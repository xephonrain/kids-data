import { isLockOff } from './deviceLock';
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AppData } from '../types';
import { collectImagePaths } from './backup';
import { GhClient, IMAGE_DIR, type GhConfig } from './github';
import { GithubSync, type GhState } from './githubSync';
import { prefetchImages, readLocalImage, setImageSource } from './images';
import { localStorageCache } from './localCache';
import { SyncEngine } from './sync';

interface Store {
  data: AppData;
  /** 'github': GitHub(非公開リポジトリ)と同期 / 'local': この端末だけに保存 */
  mode: 'github' | 'local';
  userId: string;
  gh: GhState;
  /** 設定の変更。ロック中は無視される(誤操作・不正な呼び出しの防止) */
  update: (fn: (d: AppData) => AppData) => boolean;
  /** 子ども画面からの記録(シールをはる等)。設定のロックに関係なく書き込める。呼ぶ側は記録専用の変更だけを渡すこと */
  record: (fn: (d: AppData) => AppData) => void;
  syncNow: () => Promise<void>;
  resolveConflict: (choice: 'remote' | 'local') => Promise<void>;
  /** 競合時に表示する、GitHub側の内容の概要 */
  remoteSummary: () => { activities: number; presets: number; overrides: number } | null;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('DataProvider の外で useStore が呼ばれました');
  return s;
}

interface Props {
  github: GhConfig | null;
  /** 設定を変更してよい状態か(ロック解除中か) */
  canEdit: boolean;
  children: ReactNode;
}

const OFF: GhState = { status: 'idle', error: null, lastSyncedAt: null, dirty: false };
const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export function DataProvider({ github, canEdit, children }: Props) {
  const userId = github ? `gh:${github.repo}` : 'local';
  const mode = github ? 'github' : 'local';
  const repo = github?.repo;
  const token = github?.token;

  const engine = useMemo(() => {
    const e = new SyncEngine(null, localStorageCache(userId));
    e.init();
    return e;
  }, [userId]);

  const sync = useMemo(() => {
    if (!repo || !token) return null;
    const client = new GhClient({ repo, token });
    const key = `kt:ghmeta:v1:${repo}`;
    return {
      client,
      gs: new GithubSync(
        client,
        engine,
        { read: readLocalImage, prefetch: prefetchImages },
        {
          load: () => {
            try {
              const raw = localStorage.getItem(key);
              return raw ? JSON.parse(raw) : null;
            } catch {
              return null;
            }
          },
          save: (m) => {
            try {
              localStorage.setItem(key, JSON.stringify(m));
            } catch {
              /* noop */
            }
          },
        }
      ),
    };
  }, [engine, repo, token]);

  const data = useSyncExternalStore(engine.subscribe.bind(engine), () => engine.getData());
  const gh = useSyncExternalStore(
    (fn) => (sync ? sync.gs.subscribe(fn) : () => undefined),
    () => (sync ? sync.gs.getState() : OFF)
  );
  const [, bump] = useState(0);

  const canEditRef = useRef(canEdit);
  // パスワード未設定の間は(初回のパスワード登録のため)編集を許可する
  canEditRef.current = canEdit || !data.settings.lockHash || isLockOff();

  // GitHub接続中: 起動時・画面に戻ったとき・通信回復時・一定間隔で同期
  useEffect(() => {
    if (!sync) return;
    const { gs, client } = sync;
    setImageSource(async (path) => client.getBlob(`${IMAGE_DIR}/${baseName(path)}`));
    gs.start();
    void gs.syncNow();
    const onOnline = () => void gs.syncNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void gs.syncNow();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const poll = setInterval(() => void gs.syncNow(), 60_000);
    return () => {
      gs.stop();
      setImageSource(null);
      clearInterval(poll);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync]);

  // 使っている画像を端末に保存しておく(オフラインでも表示できるように)
  const imageKey = collectImagePaths(data).sort().join('|');
  useEffect(() => {
    if (imageKey) void prefetchImages(imageKey.split('|')).then(() => bump((n) => n + 1));
  }, [imageKey]);

  const value = useMemo<Store>(
    () => ({
      data,
      mode,
      userId,
      gh,
      update: (fn) => {
        if (!canEditRef.current) return false;
        engine.update(fn);
        return true;
      },
      record: (fn) => {
        engine.update(fn);
      },
      syncNow: () => (sync ? sync.gs.syncNow() : Promise.resolve()),
      resolveConflict: (c) => (sync ? sync.gs.resolveConflict(c) : Promise.resolve()),
      remoteSummary: () => {
        const r = sync?.gs.getConflictRemote();
        return r ? { activities: r.activities.length, presets: r.presets.length, overrides: r.overrides.length } : null;
      },
    }),
    [data, gh, engine, sync, mode, userId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
