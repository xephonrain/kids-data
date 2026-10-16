import { describe, expect, it } from 'vitest';
import { SyncEngine } from '../src/data/sync';
import { newActivity } from '../src/defaults';
import { act, hm, item, preset } from './helpers';
import { FakeServer, MemoryCache } from './fakeRemote';

let clock = 0;
const now = () => new Date(Date.UTC(2026, 9, 16, 0, 0, clock++)).toISOString();
const engine = (server: FakeServer, cache = new MemoryCache()) => new SyncEngine(server.remote(), cache, now);

describe('同期', () => {
  it('編集はローカルに即反映され、保存後にクラウドへ送られる', async () => {
    const s = new FakeServer();
    const e = engine(s);
    const a = newActivity('あさごはん');
    e.update((d) => ({ ...d, activities: [...d.activities, a] }));
    expect(e.getData().activities).toHaveLength(1); // 即時
    await e.flush();
    expect(s.tables.activities.size).toBe(1);
    expect(e.getData().activities[0].version).toBe(1);
    expect(e.getState().status).toBe('synced');
    expect(e.getState().pendingCount).toBe(0);
  });

  it('他の端末の変更が refresh で反映される(追加・更新・削除)', async () => {
    const s = new FakeServer();
    const a = engine(s);
    const b = engine(s);
    const x = newActivity('x');
    a.update((d) => ({ ...d, activities: [x] }));
    await a.flush();
    await b.refresh();
    expect(b.getData().activities.map((v) => v.name)).toEqual(['x']);

    a.update((d) => ({ ...d, activities: d.activities.map((v) => ({ ...v, name: 'x2' })) }));
    await a.flush();
    await b.refresh();
    expect(b.getData().activities[0].name).toBe('x2');

    a.update((d) => ({ ...d, activities: [] }));
    await a.flush();
    await b.refresh();
    expect(b.getData().activities).toHaveLength(0);
  });

  it('同時編集は競合として検出され、勝手に上書きされない', async () => {
    const s = new FakeServer();
    const a = engine(s);
    const b = engine(s);
    a.update((d) => ({ ...d, activities: [newActivity('もと')] }));
    await a.flush();
    await b.refresh();

    // 同じ活動を2端末が別々に編集
    a.update((d) => ({ ...d, activities: d.activities.map((v) => ({ ...v, name: 'Aの変更' })) }));
    await a.flush();
    b.update((d) => ({ ...d, activities: d.activities.map((v) => ({ ...v, name: 'Bの変更' })) }));
    await b.flush();

    expect(b.getState().status).toBe('conflict');
    expect(b.getState().conflicts).toHaveLength(1);
    expect(([...s.tables.activities.values()][0] as { name: string }).name).toBe('Aの変更'); // クラウドはAのまま
    expect(b.getData().activities[0].name).toBe('Bの変更'); // Bの未送信の編集はローカルに残る
  });

  it('競合: 他の端末の内容を採用', async () => {
    const s = new FakeServer();
    const a = engine(s);
    const b = engine(s);
    a.update((d) => ({ ...d, activities: [newActivity('もと')] }));
    await a.flush();
    await b.refresh();
    a.update((d) => ({ ...d, activities: d.activities.map((v) => ({ ...v, name: 'A' })) }));
    await a.flush();
    b.update((d) => ({ ...d, activities: d.activities.map((v) => ({ ...v, name: 'B' })) }));
    await b.flush();
    await b.resolveConflict(b.getState().conflicts[0].key, 'remote');
    expect(b.getData().activities[0].name).toBe('A');
    expect(b.getState().status).toBe('synced');
    expect(b.getState().pendingCount).toBe(0);
  });

  it('競合: この端末の内容で上書き', async () => {
    const s = new FakeServer();
    const a = engine(s);
    const b = engine(s);
    a.update((d) => ({ ...d, activities: [newActivity('もと')] }));
    await a.flush();
    await b.refresh();
    a.update((d) => ({ ...d, activities: d.activities.map((v) => ({ ...v, name: 'A' })) }));
    await a.flush();
    b.update((d) => ({ ...d, activities: d.activities.map((v) => ({ ...v, name: 'B' })) }));
    await b.flush();
    await b.resolveConflict(b.getState().conflicts[0].key, 'local');
    expect(([...s.tables.activities.values()][0] as { name: string }).name).toBe('B');
    expect(b.getState().status).toBe('synced');
  });

  it('他端末で削除された行をこちらで編集 → 競合(削除済み)として検出', async () => {
    const s = new FakeServer();
    const a = engine(s);
    const b = engine(s);
    a.update((d) => ({ ...d, activities: [newActivity('x')] }));
    await a.flush();
    await b.refresh();
    a.update((d) => ({ ...d, activities: [] }));
    await a.flush();
    b.update((d) => ({ ...d, activities: d.activities.map((v) => ({ ...v, name: 'y' })) }));
    await b.flush();
    const c = b.getState().conflicts[0];
    expect(c.remoteDeleted).toBe(true);
    await b.resolveConflict(c.key, 'local'); // 再作成
    expect(s.tables.activities.size).toBe(1);
  });

  it('オフライン中も編集でき、未送信を保持。復旧後に送信され二重登録されない', async () => {
    const s = new FakeServer();
    const cache = new MemoryCache();
    const e = engine(s, cache);
    s.online = false;
    e.update((d) => ({ ...d, activities: [newActivity('オフライン作成')] }));
    await e.flush();
    expect(e.getState().status).toBe('offline');
    expect(e.getState().pendingCount).toBe(1);
    expect(e.getData().activities).toHaveLength(1); // 表示は続く
    expect(s.tables.activities.size).toBe(0);

    // アプリを再起動してもキャッシュから復元される
    const e2 = engine(s, cache);
    expect(e2.init()).toBe(true);
    expect(e2.getData().activities).toHaveLength(1);
    expect(e2.getState().pendingCount).toBe(1);

    s.online = true;
    await e2.retry();
    await e2.retry(); // 何度再試行しても
    expect(s.tables.activities.size).toBe(1); // 1件のまま
    expect(s.calls.put).toBe(1);
    expect(e2.getState().status).toBe('synced');
  });

  it('オフラインで最後に取得した予定を表示できる', async () => {
    const s = new FakeServer();
    const cache = new MemoryCache();
    const a = engine(s);
    const act1 = act('はみがき');
    a.update((d) => ({
      ...d,
      activities: [act1],
      presets: [preset('P1', [item('i1', hm(8), hm(9), act1.id)])],
    }));
    await a.flush();

    const b = engine(s, cache);
    await b.refresh();
    s.online = false;
    const b2 = engine(s, cache); // 再起動
    b2.init();
    await b2.refresh(); // 失敗するが落ちない
    expect(b2.getState().status).toBe('offline');
    expect(b2.getData().presets[0].items).toHaveLength(1);
  });

  it('通信エラー以外(権限など)は error として表示され、再試行できる', async () => {
    const s = new FakeServer();
    const remote = s.remote();
    let fail = true;
    const e = new SyncEngine({ ...remote, put: async (c, x) => (fail ? Promise.reject(new Error('permission denied')) : remote.put(c, x)) }, new MemoryCache(), now);
    e.update((d) => ({ ...d, activities: [newActivity('x')] }));
    await e.flush();
    expect(e.getState().status).toBe('error');
    expect(e.getState().error).toContain('permission denied');
    fail = false;
    await e.retry();
    expect(e.getState().status).toBe('synced');
  });

  it('作成前に削除したものは送信しない', async () => {
    const s = new FakeServer();
    const e = engine(s);
    s.online = false;
    const a = newActivity('x');
    e.update((d) => ({ ...d, activities: [a] }));
    e.update((d) => ({ ...d, activities: [] }));
    expect(e.getState().pendingCount).toBe(0);
  });

  it('プリセットと活動の整合性: 活動→プリセットの順で送る', async () => {
    const s = new FakeServer();
    const order: string[] = [];
    const r = s.remote();
    const e = new SyncEngine({ ...r, put: async (c, x) => (order.push(c), r.put(c, x)) }, new MemoryCache(), now);
    const a = act('a');
    e.update((d) => ({ ...d, presets: [preset('P', [item('i', 0, 60, a.id)])], activities: [a] }));
    await e.flush();
    expect(order).toEqual(['activities', 'presets']);
  });

  it('配色・設定も同期され、競合も検出される', async () => {
    const s = new FakeServer();
    const a = engine(s);
    const b = engine(s);
    a.update((d) => ({ ...d, theme: { ...d.theme, colors: { ...d.theme.colors, background: { color: '#ff0000', opacity: 100 } } } }));
    await a.flush();
    await b.refresh();
    expect(b.getData().theme.colors.background.color).toBe('#ff0000');

    a.update((d) => ({ ...d, theme: { ...d.theme, colors: { ...d.theme.colors, background: { color: '#00ff00', opacity: 100 } } } }));
    await a.flush();
    b.update((d) => ({ ...d, theme: { ...d.theme, colors: { ...d.theme.colors, background: { color: '#0000ff', opacity: 100 } } } }));
    await b.flush();
    expect(b.getState().conflicts[0].coll).toBe('theme');
    await b.resolveConflict('theme:theme', 'remote');
    expect(b.getData().theme.colors.background.color).toBe('#00ff00');
  });

  it('設定保存→再起動でも維持される(キャッシュ)', async () => {
    const s = new FakeServer();
    const cache = new MemoryCache();
    const e = engine(s, cache);
    e.update((d) => ({ ...d, settings: { ...d.settings, defaultPresetId: null, weekdayPresets: ['p', null, null, null, null, null, null] } }));
    await e.flush();
    const e2 = engine(s, cache);
    e2.init();
    expect(e2.getData().settings.weekdayPresets[0]).toBe('p');
  });
});
