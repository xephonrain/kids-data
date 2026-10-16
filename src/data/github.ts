// GitHub REST API(Contents API)の最小クライアントと、接続情報(コード)の扱い。
// トークンは利用者が端末に入力したものだけを使い、この端末のブラウザ内(localStorage)にのみ保存する。
// ビルドやソースコードには一切含めない。

export interface GhConfig {
  repo: string; // owner/name
  token: string;
}

export type Connection = ({ mode: 'github' } & GhConfig) | { mode: 'local' };

export type GhErrorKind = 'auth' | 'notfound' | 'conflict' | 'network' | 'other';

export class GhError extends Error {
  constructor(
    public kind: GhErrorKind,
    message: string,
    public status = 0
  ) {
    super(message);
    this.name = 'GhError';
  }
}

export const DATA_FILE = 'kids-timer/data.json';
export const IMAGE_DIR = 'kids-timer/images';

// ---- 接続情報の保存 ----
const CONN_KEY = 'kt:conn:v1';

export function loadConnection(): Connection | null {
  try {
    const raw = localStorage.getItem(CONN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Connection;
    if (v.mode === 'local') return v;
    if (v.mode === 'github' && typeof v.repo === 'string' && typeof v.token === 'string') return v;
    return null;
  } catch {
    return null;
  }
}
export function saveConnection(c: Connection): void {
  try {
    localStorage.setItem(CONN_KEY, JSON.stringify(c));
  } catch {
    /* 保存できない環境では毎回入力になる */
  }
}
export function clearConnection(): void {
  try {
    localStorage.removeItem(CONN_KEY);
  } catch {
    /* noop */
  }
}

// ---- コード(リポジトリ名+トークンを1つにまとめた文字列) ----
const CODE_PREFIX = 'kt1.';

export function encodeCode(cfg: GhConfig): string {
  const json = JSON.stringify({ r: cfg.repo, t: cfg.token });
  return CODE_PREFIX + btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isValidRepo(repo: string): boolean {
  return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo);
}

export function decodeCode(code: string): GhConfig | null {
  const c = code.trim();
  if (!c.startsWith(CODE_PREFIX)) return null;
  try {
    const b64 = c.slice(CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const v = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { r?: unknown; t?: unknown };
    if (typeof v.r !== 'string' || typeof v.t !== 'string' || !isValidRepo(v.r) || !v.t) return null;
    return { repo: v.r, token: v.t };
  } catch {
    return null;
  }
}

// ---- base64 ----
export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class GhClient {
  constructor(
    private cfg: GhConfig,
    private fetchImpl: FetchLike = (u, i) => fetch(u, i)
  ) {}

  private url(path: string): string {
    const enc = path.split('/').map(encodeURIComponent).join('/');
    return `https://api.github.com/repos/${this.cfg.repo}/contents/${enc}`;
  }

  private async call(url: string, init: RequestInit = {}, accept = 'application/vnd.github+json'): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        ...init,
        cache: 'no-store',
        headers: { Accept: accept, Authorization: `Bearer ${this.cfg.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers ?? {}) },
      });
    } catch {
      throw new GhError('network', 'GitHubに接続できません');
    }
    return res;
  }

  private async fail(res: Response, what: string): Promise<never> {
    let detail = '';
    try {
      detail = ((await res.json()) as { message?: string }).message ?? '';
    } catch {
      /* noop */
    }
    if (res.status === 401) throw new GhError('auth', 'コードが無効か、期限が切れています(新しいトークンでコードを作り直してください)', 401);
    if (res.status === 403 || res.status === 429) {
      if (/rate limit/i.test(detail)) throw new GhError('other', 'GitHubへのアクセスが多すぎます。しばらくしてからやり直してください', res.status);
      throw new GhError('auth', 'このトークンには書き込み権限がありません(Contents: Read and write が必要です)', res.status);
    }
    if (res.status === 404) throw new GhError('notfound', `${what}が見つかりません(リポジトリ名かトークンの対象リポジトリを確認してください)`, 404);
    if (res.status === 409 || res.status === 422) throw new GhError('conflict', detail || 'conflict', res.status);
    throw new GhError('other', `GitHubのエラー(${res.status}): ${detail || '不明'}`, res.status);
  }

  /** 接続確認。リポジトリが非公開か、書き込めるかを返す */
  async check(): Promise<{ private: boolean; canPush: boolean }> {
    const res = await this.call(`https://api.github.com/repos/${this.cfg.repo}`);
    if (!res.ok) await this.fail(res, 'リポジトリ');
    const j = (await res.json()) as { private?: boolean; permissions?: { push?: boolean } };
    return { private: !!j.private, canPush: j.permissions?.push !== false };
  }

  /** ファイルを文字列で取得。無ければnull */
  async getText(path: string): Promise<{ sha: string; text: string } | null> {
    const res = await this.call(this.url(path));
    if (res.status === 404) return null;
    if (!res.ok) await this.fail(res, 'ファイル');
    const j = (await res.json()) as { sha: string; content?: string; encoding?: string; size?: number };
    if (j.encoding === 'base64' && j.content) return { sha: j.sha, text: new TextDecoder().decode(base64ToBytes(j.content)) };
    // 1MBを超えると本文が返らないので、rawで取り直す
    const raw = await this.call(this.url(path), {}, 'application/vnd.github.raw+json');
    if (!raw.ok) await this.fail(raw, 'ファイル');
    return { sha: j.sha, text: await raw.text() };
  }

  async getBlob(path: string): Promise<Blob | null> {
    const res = await this.call(this.url(path), {}, 'application/vnd.github.raw+json');
    if (res.status === 404) return null;
    if (!res.ok) await this.fail(res, '画像');
    return await res.blob();
  }

  /** フォルダ内のファイル名一覧。無ければ空 */
  async listDir(path: string): Promise<string[]> {
    const res = await this.call(this.url(path));
    if (res.status === 404) return [];
    if (!res.ok) await this.fail(res, 'フォルダ');
    const j = (await res.json()) as { name: string }[] | unknown;
    return Array.isArray(j) ? j.map((x: { name: string }) => x.name) : [];
  }

  /** 保存して新しいsha。shaが古い(他の端末が先に更新した)場合はkind='conflict' */
  async putFile(path: string, base64: string, sha: string | null, message: string): Promise<string> {
    const res = await this.call(this.url(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: base64, ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) await this.fail(res, 'ファイル');
    const j = (await res.json()) as { content?: { sha?: string } };
    return j.content?.sha ?? '';
  }
}
