// GitHub(非公開リポジトリ)への保存・読み込み。フレームワーク非依存。
//
//  * 設定全体を kids-timer/data.json 1ファイルに、画像は kids-timer/images/ に個別ファイルとして保存する。
//  * 画面は常に端末内のデータを見る(オフラインでも動く)。編集のたびに自動で送信し、他の端末の変更は起動時や画面復帰時に取り込む。
//  * ファイルのsha(版番号)で競合を検出する。両方で変更があった場合は勝手に上書きせず、どちらを残すか選んでもらう。

import type { AppData } from '../types';
import { collectImagePaths } from './backup';
import { DATA_FILE, GhError, IMAGE_DIR, bytesToBase64, textToBase64, type GhClient } from './github';
import { normalizeAppData } from './localCache';

export const SNAPSHOT_FORMAT = 'kids-timer-sync';

export type GhStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict';

export interface GhState {
  status: GhStatus;
  error: string | null;
  lastSyncedAt: string | null;
  /** 端末の内容がGitHubに未保存か */
  dirty: boolean;
}

interface Meta {
  sha: string | null;
  hash: string | null;
  lastSyncedAt: string | null;
}

export interface MetaStorage {
  load(): Meta | null;
  save(m: Meta): void;
}

export interface DataPort {
  getData(): AppData;
  replaceData(d: AppData): void;
  subscribe(fn: () => void): () => void;
}

export interface ImagePort {
  read(path: string): Promise<Blob | null>;
  prefetch(paths: string[]): Promise<void>;
}

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export const hashOf = (d: AppData): string => stableStringify(normalizeAppData(d));

export function isEmptyData(d: AppData): boolean {
  return d.activities.length === 0 && d.presets.length === 0 && d.overrides.length === 0;
}

export function parseSnapshot(text: string): AppData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('GitHub上のデータが壊れています(JSONとして読めません)');
  }
  const r = raw as { format?: unknown; version?: unknown; data?: Partial<AppData> };
  if (!r || r.format !== SNAPSHOT_FORMAT || typeof r.version !== 'number') throw new Error('GitHub上のデータの形式が違います(このアプリで保存したファイルではありません)');
  if (r.version > 1) throw new Error('新しいバージョンのデータです。アプリを更新してください');
  const d = r.data;
  if (!d || !Array.isArray(d.activities) || !Array.isArray(d.presets) || !Array.isArray(d.overrides)) throw new Error('GitHub上のデータが壊れています');
  return normalizeAppData(d);
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export class GithubSync {
  private state: GhState;
  private listeners = new Set<() => void>();
  private meta: Meta;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unsub: (() => void) | null = null;
  private conflict: { data: AppData; sha: string } | null = null;
  private lastHashedRef: AppData | null = null;
  private lastHash = '';

  constructor(
    private client: GhClient,
    private port: DataPort,
    private images: ImagePort,
    private storage: MetaStorage,
    private now: () => string = () => new Date().toISOString(),
    private debounceMs = 2500
  ) {
    this.meta = storage.load() ?? { sha: null, hash: null, lastSyncedAt: null };
    this.state = { status: 'idle', error: null, lastSyncedAt: this.meta.lastSyncedAt, dirty: false };
    this.state.dirty = this.isDirty();
  }

  // ---- 購読 ----
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  getState(): GhState {
    return this.state;
  }
  private set(patch: Partial<GhState>) {
    this.state = { ...this.state, ...patch, dirty: this.isDirty(), lastSyncedAt: this.meta.lastSyncedAt };
    this.listeners.forEach((f) => f());
  }
  private currentHash(): string {
    const d = this.port.getData();
    if (d !== this.lastHashedRef) {
      this.lastHashedRef = d;
      this.lastHash = hashOf(d);
    }
    return this.lastHash;
  }
  private isDirty(): boolean {
    return this.meta.hash === null ? !isEmptyData(this.port.getData()) : this.currentHash() !== this.meta.hash;
  }
  private saveMeta(m: Meta) {
    this.meta = m;
    this.storage.save(m);
  }

  // ---- 自動送信 ----
  start(): void {
    this.unsub = this.port.subscribe(() => {
      const dirty = this.isDirty();
      if (dirty !== this.state.dirty) this.set({});
      if (dirty && this.state.status !== 'conflict' && this.state.status !== 'syncing') {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.syncNow(), this.debounceMs);
      }
    });
  }
  stop(): void {
    clearTimeout(this.timer);
    this.unsub?.();
    this.unsub = null;
  }

  // ---- 同期 ----
  syncNow(): Promise<void> {
    if (this.state.status === 'conflict') return Promise.resolve();
    if (!this.running) this.running = this.run().finally(() => (this.running = null));
    return this.running;
  }

  private async run(): Promise<void> {
    this.set({ status: 'syncing', error: null });
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (await this.once()) return;
      }
      this.set({ status: 'error', error: '他の端末と同時に保存したため完了できませんでした。もう一度「今すぐ同期」を押してください' });
    } catch (e) {
      this.fail(e);
    }
  }

  /** 1回の同期。完了(または競合で停止)したらtrue、やり直しが必要ならfalse */
  private async once(): Promise<boolean> {
    const remote = await this.client.getText(DATA_FILE);
    const local = this.port.getData();
    if (!remote) {
      if (isEmptyData(local) && this.meta.hash === null) {
        this.set({ status: 'synced' });
        return true;
      }
      return await this.pushOrRetry(null, local);
    }
    const rdata = parseSnapshot(remote.text);
    const lh = this.currentHash();
    const rh = hashOf(rdata);

    if (rh === lh) {
      this.saveMeta({ sha: remote.sha, hash: lh, lastSyncedAt: this.now() });
      this.set({ status: 'synced' });
      return true;
    }
    if (remote.sha === this.meta.sha) {
      // GitHub側は前回から変わっていない → 端末の変更を送る
      return await this.pushOrRetry(remote.sha, local);
    }
    if ((this.meta.hash !== null && lh === this.meta.hash) || (this.meta.hash === null && isEmptyData(local))) {
      // 端末側に未保存の変更はない → GitHubの内容を取り込む
      await this.apply(rdata, remote.sha);
      return true;
    }
    // 端末にもGitHubにも違う変更がある
    this.conflict = { data: rdata, sha: remote.sha };
    this.set({ status: 'conflict' });
    return true;
  }

  private async pushOrRetry(sha: string | null, snapshot: AppData): Promise<boolean> {
    try {
      await this.push(sha, snapshot);
      return true;
    } catch (e) {
      if (e instanceof GhError && e.kind === 'conflict') return false; // 他の端末が先に更新 → 取得からやり直し
      throw e;
    }
  }

  private async push(sha: string | null, snapshot: AppData): Promise<void> {
    const existing = new Set(await this.client.listDir(IMAGE_DIR));
    for (const p of collectImagePaths(snapshot)) {
      const name = baseName(p);
      if (existing.has(name)) continue;
      const blob = await this.images.read(p);
      if (!blob) continue;
      try {
        await this.client.putFile(`${IMAGE_DIR}/${name}`, bytesToBase64(new Uint8Array(await blob.arrayBuffer())), null, `画像を追加 ${name}`);
      } catch (e) {
        if (!(e instanceof GhError && e.kind === 'conflict')) throw e; // 既に存在する場合は問題なし
      }
    }
    const body = JSON.stringify({ format: SNAPSHOT_FORMAT, version: 1, savedAt: this.now(), data: snapshot });
    const newSha = await this.client.putFile(DATA_FILE, textToBase64(body), sha, '設定を保存');
    this.saveMeta({ sha: newSha, hash: hashOf(snapshot), lastSyncedAt: this.now() });
    this.conflict = null;
    this.set({ status: 'synced' });
  }

  private async apply(rdata: AppData, sha: string): Promise<void> {
    await this.images.prefetch(collectImagePaths(rdata)).catch(() => undefined);
    this.port.replaceData(rdata);
    this.saveMeta({ sha, hash: this.currentHash(), lastSyncedAt: this.now() });
    this.conflict = null;
    this.set({ status: 'synced' });
  }

  getConflictRemote(): AppData | null {
    return this.conflict?.data ?? null;
  }

  /** 競合の解決。'remote'=GitHubの内容にする / 'local'=この端末の内容で上書き */
  async resolveConflict(choice: 'remote' | 'local'): Promise<void> {
    const c = this.conflict;
    if (!c) return;
    this.set({ status: 'syncing', error: null });
    try {
      if (choice === 'remote') await this.apply(c.data, c.sha);
      else {
        try {
          await this.push(c.sha, this.port.getData());
        } catch (e) {
          if (e instanceof GhError && e.kind === 'conflict') {
            this.conflict = null;
            this.set({ status: 'idle' });
            await this.syncNow();
            return;
          }
          throw e;
        }
      }
    } catch (e) {
      this.conflict = c;
      this.fail(e, 'conflict');
    }
  }

  private fail(e: unknown, keep?: GhStatus) {
    if (e instanceof GhError && e.kind === 'network') {
      this.set({ status: keep ?? 'offline', error: keep ? e.message : null });
      return;
    }
    this.set({ status: keep ?? 'error', error: e instanceof Error ? e.message : String(e) });
  }
}
