// 端末内データの管理(フレームワーク非依存)。もとはクラウド同期エンジンで、現在は GitHub 同期(githubSync.ts)の土台として使う。
//
//  * 画面は常にローカルのデータ(AppData)を見る。編集は即座にローカルへ反映し、変更を「未送信(pending)」として記録する。
//  * 送信(flush)は各行のバージョンを照合する楽観ロック。他の端末が先に変更していたら上書きせず「競合」として止め、
//    利用者が「他の端末の内容を採用」か「この端末の内容で上書き」を選ぶ。
//  * 通信できない間も、最後に取得した予定で表示を続ける。未送信の変更は保持し、復旧後に再送する。
//    再送はバージョン照合つきなので、二重登録や意図しない上書きは起きない。

import type { Activity, AppData, AppSettings, DateOverride, Preset, Theme } from '../types';
import { emptyAppData, nowIso } from '../defaults';

export class ConflictError extends Error {
  constructor(message = 'version_conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}
export class NetworkError extends Error {
  constructor(message = 'network') {
    super(message);
    this.name = 'NetworkError';
  }
}

export type Coll = 'activities' | 'presets' | 'overrides';
type Entity = Activity | Preset | DateOverride;

export interface RemoteSnapshot {
  activities: Activity[];
  presets: Preset[];
  overrides: DateOverride[];
  theme: Theme | null;
  settings: AppSettings | null;
}

export interface Remote {
  fetchAll(): Promise<RemoteSnapshot>;
  fetchOne(coll: Coll, id: string): Promise<Entity | null>;
  /** 保存して新しいバージョンを返す。version=0なら新規。競合時は ConflictError */
  put(coll: Coll, entity: Entity): Promise<number>;
  putTheme(theme: Theme): Promise<number>;
  putSettings(settings: AppSettings): Promise<number>;
  /** 期待バージョンが一致しなければ ConflictError。既に無ければ成功扱い */
  remove(coll: Coll, id: string, expectedVersion: number): Promise<void>;
}

export type PendingOp = { op: 'upsert' } | { op: 'delete'; version: number };

export interface Pending {
  activities: Record<string, PendingOp>;
  presets: Record<string, PendingOp>;
  overrides: Record<string, PendingOp>;
  theme: boolean;
  settings: boolean;
}

export interface Conflict {
  key: string;
  coll: Coll | 'theme' | 'settings';
  id: string;
  label: string;
  localDeleted: boolean;
  remoteDeleted: boolean;
}

export type SyncStatus = 'local-only' | 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict';

export interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  error: string | null;
  conflicts: Conflict[];
}

export interface CacheStorage {
  load(): { data: AppData; pending: Pending; lastSyncedAt: string | null } | null;
  save(v: { data: AppData; pending: Pending; lastSyncedAt: string | null }): void;
}

export const emptyPending = (): Pending => ({ activities: {}, presets: {}, overrides: {}, theme: false, settings: false });

const COLLS: Coll[] = ['activities', 'presets', 'overrides'];

function contentKey(e: unknown): string {
  return JSON.stringify(e, (k, v) => (k === 'version' || k === 'updatedAt' || k === 'createdAt' ? undefined : v));
}

function pendingCount(p: Pending): number {
  return Object.keys(p.activities).length + Object.keys(p.presets).length + Object.keys(p.overrides).length + (p.theme ? 1 : 0) + (p.settings ? 1 : 0);
}

function labelOf(coll: Coll | 'theme' | 'settings', e: Entity | null): string {
  if (coll === 'theme') return '配色設定';
  if (coll === 'settings') return '曜日・祝日・ロックなどの設定';
  if (!e) return coll === 'activities' ? '活動' : coll === 'presets' ? 'プリセット' : '臨時変更';
  if (coll === 'activities') return `活動「${(e as Activity).name}」`;
  if (coll === 'presets') return `プリセット「${(e as Preset).name}」`;
  const o = e as DateOverride;
  return `臨時変更(${o.startDate}${o.endDate !== o.startDate ? `〜${o.endDate}` : ''})`;
}

export class SyncEngine {
  private data: AppData = emptyAppData();
  private pending: Pending = emptyPending();
  private state: SyncState;
  private listeners = new Set<() => void>();
  private flushing: Promise<void> | null = null;
  private lastSyncedAt: string | null = null;
  /** 競合時に比較表示するための、取得済みの相手側の内容 */
  private remoteCopies = new Map<string, Entity | Theme | AppSettings | null>();

  constructor(
    private remote: Remote | null,
    private cache: CacheStorage | null,
    private now: () => string = nowIso
  ) {
    this.state = { status: remote ? 'idle' : 'local-only', pendingCount: 0, lastSyncedAt: null, error: null, conflicts: [] };
  }

  // ---- 購読 ----
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.state = { ...this.state, pendingCount: pendingCount(this.pending), lastSyncedAt: this.lastSyncedAt };
    this.listeners.forEach((f) => f());
  }
  getData(): AppData {
    return this.data;
  }
  getState(): SyncState {
    return this.state;
  }
  getRemoteCopy(key: string): Entity | Theme | AppSettings | null | undefined {
    return this.remoteCopies.get(key);
  }

  private persist() {
    this.cache?.save({ data: this.data, pending: this.pending, lastSyncedAt: this.lastSyncedAt });
  }

  // ---- 起動 ----
  /** ローカルキャッシュを読み込む(通信なし)。オフラインでも最後の予定が表示できる */
  init(): boolean {
    const c = this.cache?.load();
    if (c) {
      this.data = c.data;
      this.pending = c.pending;
      this.lastSyncedAt = c.lastSyncedAt;
      this.emit();
      return true;
    }
    this.emit();
    return false;
  }

  /** 外部(GitHubなど)から取り込んだ内容で丸ごと置き換える。未送信の変更は残さない */
  replaceData(data: AppData): void {
    this.data = data;
    this.pending = emptyPending();
    this.persist();
    this.emit();
  }

  // ---- 編集 ----
  /** 変更をローカルへ即時反映し、差分を未送信として記録する */
  update(mutator: (d: AppData) => AppData): void {
    const prev = this.data;
    const next = mutator(structuredClone(prev));
    const stamp = this.now();

    for (const coll of COLLS) {
      const pm = new Map((prev[coll] as Entity[]).map((e) => [e.id, e]));
      const list = next[coll] as Entity[];
      const ids = new Set<string>();
      list.forEach((e, i) => {
        ids.add(e.id);
        const old = pm.get(e.id);
        if (!old || contentKey(old) !== contentKey(e)) {
          (list as Entity[])[i] = { ...e, updatedAt: stamp };
          this.pending[coll][e.id] = { op: 'upsert' };
        }
      });
      for (const [id, old] of pm) {
        if (ids.has(id)) continue;
        if (old.version === 0) delete this.pending[coll][id];
        else this.pending[coll][id] = { op: 'delete', version: old.version };
      }
    }
    if (contentKey(prev.theme) !== contentKey(next.theme)) {
      next.theme = { ...next.theme, updatedAt: stamp };
      this.pending.theme = true;
    }
    if (contentKey(prev.settings) !== contentKey(next.settings)) {
      next.settings = { ...next.settings, updatedAt: stamp };
      this.pending.settings = true;
    }

    this.data = next;
    // クラウドに接続しない(この端末だけの)モードでは、未送信という概念がない
    if (!this.remote) this.pending = emptyPending();
    if (this.state.status === 'synced') this.state = { ...this.state, status: 'idle' };
    this.persist();
    this.emit();
    void this.flush();
  }

  // ---- 取得 ----
  /** クラウドの最新を取り込む。未送信の変更がある行は上書きしない */
  async refresh(): Promise<void> {
    if (!this.remote) return;
    if (this.flushing) await this.flushing;
    let snap: RemoteSnapshot;
    try {
      snap = await this.remote.fetchAll();
    } catch (e) {
      this.fail(e);
      return;
    }
    const next = structuredClone(this.data);

    for (const coll of COLLS) {
      const remoteList = snap[coll] as Entity[];
      const rm = new Map(remoteList.map((e) => [e.id, e]));
      const local = next[coll] as Entity[];
      const out: Entity[] = [];
      for (const l of local) {
        const r = rm.get(l.id);
        const p = this.pending[coll][l.id];
        if (p) {
          out.push(l); // 未送信の変更は残す(競合はflush時に検出)
        } else if (r) {
          out.push(r);
        } else if (l.version === 0) {
          out.push(l);
        } // それ以外: 他の端末で削除された → ローカルからも消す
      }
      for (const r of remoteList) {
        if (local.some((l) => l.id === r.id)) continue;
        const p = this.pending[coll][r.id];
        if (p && p.op === 'delete') continue; // こちらで削除済み(未送信)
        out.push(r); // 他の端末で追加された
      }
      (next as any)[coll] = out; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    if (snap.theme && !this.pending.theme) next.theme = snap.theme;
    if (snap.settings && !this.pending.settings) next.settings = snap.settings;

    const changed = JSON.stringify(next) !== JSON.stringify(this.data);
    this.data = next;
    this.lastSyncedAt = this.now();
    if (changed) this.persist();
    else this.cache?.save({ data: this.data, pending: this.pending, lastSyncedAt: this.lastSyncedAt });
    if (this.state.status !== 'conflict') this.state = { ...this.state, status: pendingCount(this.pending) ? 'idle' : 'synced', error: null };
    this.emit();
    if (pendingCount(this.pending)) void this.flush();
  }

  // ---- 送信 ----
  flush(): Promise<void> {
    if (!this.remote) return Promise.resolve();
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private fail(e: unknown) {
    const offline = e instanceof NetworkError || (typeof navigator !== 'undefined' && navigator.onLine === false);
    this.state = { ...this.state, status: offline ? 'offline' : 'error', error: offline ? null : e instanceof Error ? e.message : String(e) };
    this.emit();
  }

  private addConflict(coll: Coll | 'theme' | 'settings', id: string, local: Entity | null, remote: Entity | null, localDeleted: boolean, remoteDeleted: boolean) {
    const key = `${coll}:${id}`;
    this.remoteCopies.set(key, remote);
    const c: Conflict = { key, coll, id, label: labelOf(coll, local ?? remote), localDeleted, remoteDeleted };
    this.state = { ...this.state, conflicts: [...this.state.conflicts.filter((x) => x.key !== key), c] };
  }

  private isConflicted(key: string): boolean {
    return this.state.conflicts.some((c) => c.key === key);
  }

  private async doFlush(): Promise<void> {
    const remote = this.remote!;
    if (pendingCount(this.pending) === 0) {
      if (this.state.status !== 'conflict') {
        this.state = { ...this.state, status: 'synced', error: null };
        this.emit();
      }
      return;
    }
    this.state = { ...this.state, status: 'syncing', error: null };
    this.emit();

    try {
      // 1) 追加・更新(参照される側から: 活動 → プリセット → 臨時変更 → 配色 → 設定)
      for (const coll of COLLS) {
        for (const [id, op] of Object.entries(this.pending[coll])) {
          if (op.op !== 'upsert' || this.isConflicted(`${coll}:${id}`)) continue;
          const ent = (this.data[coll] as Entity[]).find((e) => e.id === id);
          if (!ent) {
            delete this.pending[coll][id];
            continue;
          }
          try {
            const v = await remote.put(coll, ent);
            this.applyVersion(coll, id, v);
            delete this.pending[coll][id];
            this.persist();
          } catch (e) {
            if (!(e instanceof ConflictError)) throw e;
            const r = await remote.fetchOne(coll, id);
            this.addConflict(coll, id, ent, r, false, r === null);
          }
        }
      }
      if (this.pending.theme && !this.isConflicted('theme:theme')) {
        try {
          const v = await remote.putTheme(this.data.theme);
          this.data = { ...this.data, theme: { ...this.data.theme, version: v } };
          this.pending.theme = false;
          this.persist();
        } catch (e) {
          if (!(e instanceof ConflictError)) throw e;
          const snap = await remote.fetchAll();
          this.remoteCopies.set('theme:theme', snap.theme as never);
          this.state = { ...this.state, conflicts: [...this.state.conflicts.filter((x) => x.key !== 'theme:theme'), { key: 'theme:theme', coll: 'theme', id: 'theme', label: labelOf('theme', null), localDeleted: false, remoteDeleted: false }] };
        }
      }
      if (this.pending.settings && !this.isConflicted('settings:settings')) {
        try {
          const v = await remote.putSettings(this.data.settings);
          this.data = { ...this.data, settings: { ...this.data.settings, version: v } };
          this.pending.settings = false;
          this.persist();
        } catch (e) {
          if (!(e instanceof ConflictError)) throw e;
          const snap = await remote.fetchAll();
          this.remoteCopies.set('settings:settings', snap.settings as never);
          this.state = { ...this.state, conflicts: [...this.state.conflicts.filter((x) => x.key !== 'settings:settings'), { key: 'settings:settings', coll: 'settings', id: 'settings', label: labelOf('settings', null), localDeleted: false, remoteDeleted: false }] };
        }
      }
      // 2) 削除(参照する側から: 臨時変更 → プリセット → 活動)
      for (const coll of ['overrides', 'presets', 'activities'] as Coll[]) {
        for (const [id, op] of Object.entries(this.pending[coll])) {
          if (op.op !== 'delete' || this.isConflicted(`${coll}:${id}`)) continue;
          try {
            await remote.remove(coll, id, op.version);
            delete this.pending[coll][id];
            this.persist();
          } catch (e) {
            if (!(e instanceof ConflictError)) throw e;
            const r = await remote.fetchOne(coll, id);
            this.addConflict(coll, id, null, r, true, false);
          }
        }
      }
    } catch (e) {
      this.persist();
      this.fail(e);
      return;
    }

    this.lastSyncedAt = this.now();
    this.persist();
    this.state = { ...this.state, status: this.state.conflicts.length ? 'conflict' : 'synced', error: null };
    this.emit();
  }

  private applyVersion(coll: Coll, id: string, version: number) {
    const list = (this.data[coll] as Entity[]).map((e) => (e.id === id ? { ...e, version } : e));
    this.data = { ...this.data, [coll]: list } as AppData;
  }

  // ---- 競合の解消 ----
  /** remote: 他の端末の内容を採用(この端末の未送信の変更は破棄) / local: この端末の内容で上書き */
  async resolveConflict(key: string, choice: 'remote' | 'local'): Promise<void> {
    const c = this.state.conflicts.find((x) => x.key === key);
    if (!c) return;
    const remoteCopy = this.remoteCopies.get(key) ?? null;

    if (c.coll === 'theme' || c.coll === 'settings') {
      if (choice === 'remote' && remoteCopy) {
        this.data = { ...this.data, [c.coll]: remoteCopy } as AppData;
        this.pending[c.coll] = false;
      } else if (remoteCopy) {
        const cur = this.data[c.coll] as Theme | AppSettings;
        this.data = { ...this.data, [c.coll]: { ...cur, version: (remoteCopy as Theme | AppSettings).version } } as AppData;
      }
    } else {
      const coll = c.coll;
      const list = this.data[coll] as Entity[];
      if (choice === 'remote') {
        const rest = list.filter((e) => e.id !== c.id);
        (this.data as any)[coll] = remoteCopy ? [...rest, remoteCopy as Entity] : rest; // eslint-disable-line @typescript-eslint/no-explicit-any
        delete this.pending[coll][c.id];
      } else if (c.localDeleted) {
        if (remoteCopy) this.pending[coll][c.id] = { op: 'delete', version: (remoteCopy as Entity).version };
        else delete this.pending[coll][c.id];
      } else {
        const newVersion = remoteCopy ? (remoteCopy as Entity).version : 0;
        this.data = { ...this.data, [coll]: list.map((e) => (e.id === c.id ? { ...e, version: newVersion } : e)) } as AppData;
        this.pending[coll][c.id] = { op: 'upsert' };
      }
    }
    this.remoteCopies.delete(key);
    this.state = { ...this.state, conflicts: this.state.conflicts.filter((x) => x.key !== key) };
    if (this.state.conflicts.length === 0 && this.state.status === 'conflict') this.state = { ...this.state, status: 'idle' };
    this.persist();
    this.emit();
    await this.flush();
  }

  /** 状態の再試行(手動)。通信エラーからの復帰に使う */
  async retry(): Promise<void> {
    if (!this.remote) return;
    await this.refresh();
    await this.flush();
  }
}
