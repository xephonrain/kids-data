import { describe, expect, it } from 'vitest';
import { newActivity } from '../src/defaults';
import { GhClient, base64ToBytes, decodeCode, encodeCode } from '../src/data/github';
import { GithubSync } from '../src/data/githubSync';
import { SyncEngine } from '../src/data/sync';

/** GitHubのContents APIを模した、メモリ上のリポジトリ */
class FakeGitHub {
  files = new Map<string, { sha: string; b64: string }>();
  n = 0;
  online = true;
  puts: string[] = [];
  isPrivate = true;
  token = 'tok';
  fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    if (!this.online) throw new TypeError('Failed to fetch');
    const auth = (init.headers as Record<string, string>).Authorization;
    if (auth !== `Bearer ${this.token}`) return json(401, { message: 'Bad credentials' });
    const u = new URL(url);
    const m = u.pathname.match(/^\/repos\/([^/]+\/[^/]+)(?:\/contents\/(.*))?$/);
    if (!m) return json(404, {});
    if (!m[2]) return json(200, { private: this.isPrivate, permissions: { push: true } });
    const path = decodeURIComponent(m[2]);
    const method = init.method ?? 'GET';
    if (method === 'PUT') {
      const body = JSON.parse(init.body as string) as { content: string; sha?: string };
      const cur = this.files.get(path);
      if (cur && body.sha !== cur.sha) return json(409, { message: `${path} does not match` });
      if (!cur && body.sha) return json(409, { message: 'not found' });
      const sha = `sha${++this.n}`;
      this.files.set(path, { sha, b64: body.content });
      this.puts.push(path);
      return json(200, { content: { sha } });
    }
    const f = this.files.get(path);
    if (f) {
      const accept = (init.headers as Record<string, string>).Accept;
      if (accept.includes('raw')) return new Response(base64ToBytes(f.b64) as BodyInit);
      return json(200, { sha: f.sha, content: f.b64, encoding: 'base64' });
    }
    const dir = [...this.files.keys()].filter((k) => k.startsWith(path + '/')).map((k) => ({ name: k.slice(path.length + 1) }));
    return dir.length ? json(200, dir) : json(404, { message: 'Not Found' });
  };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function device(gh: FakeGitHub, imgs: Map<string, Blob> = new Map()) {
  const engine = new SyncEngine(null, null);
  let meta: { sha: string | null; hash: string | null; lastSyncedAt: string | null } | null = null;
  const sync = new GithubSync(
    new GhClient({ repo: 'a/b', token: gh.token }, gh.fetch),
    engine,
    { read: async (p) => imgs.get(p) ?? null, prefetch: async () => undefined },
    { load: () => meta, save: (m) => (meta = m) },
    () => '2026-10-16T00:00:00Z',
    10_000
  );
  return { engine, sync, imgs };
}
const addActivity = (e: SyncEngine, name: string) => e.update((d) => ({ ...d, activities: [...d.activities, newActivity(name)] }));

describe('GitHub同期', () => {
  it('端末の変更がGitHubに保存され、別の端末に取り込まれる', async () => {
    const gh = new FakeGitHub();
    const A = device(gh);
    addActivity(A.engine, 'あさごはん');
    await A.sync.syncNow();
    expect(A.sync.getState().status).toBe('synced');
    expect(A.sync.getState().dirty).toBe(false);
    expect(gh.files.has('kids-timer/data.json')).toBe(true);

    const B = device(gh);
    await B.sync.syncNow();
    expect(B.engine.getData().activities.map((a) => a.name)).toEqual(['あさごはん']);
    expect(B.sync.getState().dirty).toBe(false);
  });

  it('変更がなければ書き込まない / 変更があれば送る', async () => {
    const gh = new FakeGitHub();
    const A = device(gh);
    addActivity(A.engine, 'a');
    await A.sync.syncNow();
    const n = gh.puts.length;
    await A.sync.syncNow();
    expect(gh.puts.length).toBe(n);
    addActivity(A.engine, 'b');
    expect(A.sync.getState().dirty).toBe(false); // subscribe未開始のため状態は同期時に更新
    await A.sync.syncNow();
    expect(gh.puts.length).toBe(n + 1);
  });

  it('相手側だけが変わっていれば自動で取り込む', async () => {
    const gh = new FakeGitHub();
    const A = device(gh);
    addActivity(A.engine, 'a');
    await A.sync.syncNow();
    const B = device(gh);
    await B.sync.syncNow();
    addActivity(B.engine, 'b');
    await B.sync.syncNow();
    await A.sync.syncNow();
    expect(A.engine.getData().activities.map((x) => x.name)).toEqual(['a', 'b']);
  });

  it('両方で変更した場合は競合として止まり、勝手に上書きしない', async () => {
    const gh = new FakeGitHub();
    const A = device(gh);
    addActivity(A.engine, 'base');
    await A.sync.syncNow();
    const B = device(gh);
    await B.sync.syncNow();
    addActivity(A.engine, 'fromA');
    addActivity(B.engine, 'fromB');
    await B.sync.syncNow(); // Bが先にGitHubへ
    await A.sync.syncNow();
    expect(A.sync.getState().status).toBe('conflict');
    expect(A.engine.getData().activities.map((x) => x.name)).toEqual(['base', 'fromA']);

    await A.sync.resolveConflict('remote');
    expect(A.engine.getData().activities.map((x) => x.name)).toEqual(['base', 'fromB']);
    expect(A.sync.getState().status).toBe('synced');
  });

  it('競合で「この端末の内容で上書き」を選ぶとGitHubが更新される', async () => {
    const gh = new FakeGitHub();
    const A = device(gh);
    addActivity(A.engine, 'base');
    await A.sync.syncNow();
    const B = device(gh);
    await B.sync.syncNow();
    addActivity(A.engine, 'fromA');
    addActivity(B.engine, 'fromB');
    await B.sync.syncNow();
    await A.sync.syncNow();
    await A.sync.resolveConflict('local');
    const C = device(gh);
    await C.sync.syncNow();
    expect(C.engine.getData().activities.map((x) => x.name)).toEqual(['base', 'fromA']);
  });

  it('保存中に他の端末が先に更新しても、上書きせず取得からやり直す', async () => {
    const gh = new FakeGitHub();
    const A = device(gh);
    addActivity(A.engine, 'base');
    await A.sync.syncNow();
    const B = device(gh);
    await B.sync.syncNow();
    addActivity(B.engine, 'fromB');
    await B.sync.syncNow();
    addActivity(A.engine, 'fromA'); // AはBの更新をまだ知らない
    await A.sync.syncNow();
    expect(A.sync.getState().status).toBe('conflict');
  });

  it('オフラインでは offline になり、復帰後に送れる', async () => {
    const gh = new FakeGitHub();
    const A = device(gh);
    addActivity(A.engine, 'a');
    gh.online = false;
    await A.sync.syncNow();
    expect(A.sync.getState().status).toBe('offline');
    expect(A.sync.getState().dirty).toBe(true);
    gh.online = true;
    await A.sync.syncNow();
    expect(A.sync.getState().status).toBe('synced');
  });

  it('画像は別ファイルで保存され、同じ画像は再送しない', async () => {
    const gh = new FakeGitHub();
    const imgs = new Map([['local/x.webp', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' })]]);
    const A = device(gh, imgs);
    A.engine.update((d) => ({ ...d, activities: [{ ...newActivity('e'), imagePath: 'local/x.webp' }] }));
    await A.sync.syncNow();
    expect(gh.files.has('kids-timer/images/x.webp')).toBe(true);
    expect(Array.from(base64ToBytes(gh.files.get('kids-timer/images/x.webp')!.b64))).toEqual([1, 2, 3]);
    addActivity(A.engine, 'more');
    await A.sync.syncNow();
    expect(gh.puts.filter((p) => p.endsWith('x.webp')).length).toBe(1);
  });

  it('コードが違う(401)と分かりやすいエラーになる', async () => {
    const gh = new FakeGitHub();
    const A = device(gh);
    gh.token = 'other';
    addActivity(A.engine, 'a');
    await A.sync.syncNow();
    expect(A.sync.getState().status).toBe('error');
    expect(A.sync.getState().error).toContain('コード');
  });

  it('壊れたデータは取り込まない', async () => {
    const gh = new FakeGitHub();
    gh.files.set('kids-timer/data.json', { sha: 's', b64: btoa('{"hello":1}') });
    const A = device(gh);
    await A.sync.syncNow();
    expect(A.sync.getState().status).toBe('error');
    expect(A.engine.getData().activities).toEqual([]);
  });

  it('ロック設定も端末間で共有される', async () => {
    const gh = new FakeGitHub();
    const A = device(gh);
    A.engine.update((d) => ({ ...d, settings: { ...d.settings, lockSalt: 's', lockHash: 'h', lockIterations: 1 } }));
    addActivity(A.engine, 'a');
    await A.sync.syncNow();
    const B = device(gh);
    await B.sync.syncNow();
    expect(B.engine.getData().settings.lockHash).toBe('h');
  });
});

describe('コード', () => {
  it('作ったコードを読み戻せる', () => {
    const c = encodeCode({ repo: 'aki/kids-data', token: 'github_pat_ABC_def-123' });
    expect(c.startsWith('kt1.')).toBe(true);
    expect(decodeCode(c)).toEqual({ repo: 'aki/kids-data', token: 'github_pat_ABC_def-123' });
    expect(decodeCode(`  ${c}\n`)).not.toBeNull();
  });
  it('不正なコードは弾く', () => {
    expect(decodeCode('')).toBeNull();
    expect(decodeCode('hello')).toBeNull();
    expect(decodeCode('kt1.@@@')).toBeNull();
    expect(decodeCode('kt1.' + btoa('{"r":"bad repo","t":"x"}'))).toBeNull();
  });
});
