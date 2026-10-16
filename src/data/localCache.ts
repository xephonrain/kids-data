import type { AppData, Progress } from '../types';
import { mergeColors } from './mappers';
import { defaultSettings, defaultTheme } from '../defaults';
import { emptyPending, type CacheStorage, type Pending } from './sync';

const LAST_USER_KEY = 'kt:lastUser';
const cacheKey = (userId: string) => `kt:cache:v1:${userId}`;

export function getLastUser(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}
export function setLastUser(id: string): void {
  try {
    localStorage.setItem(LAST_USER_KEY, id);
  } catch {
    /* 保存できない環境では何もしない */
  }
}
export function clearLastUser(): void {
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* noop */
  }
}

/** 将来キーが増えても壊れないように、既定値で補完する */
export function normalizeAppData(raw: Partial<AppData> | undefined): AppData {
  const v = raw ?? {};
  return {
    activities: v.activities ?? [],
    presets: v.presets ?? [],
    overrides: v.overrides ?? [],
    theme: { ...defaultTheme(), ...v.theme, colors: mergeColors(v.theme?.colors) },
    settings: { ...defaultSettings(), ...v.settings },
  };
}

/** 最後に取得した内容と未送信の変更を端末に保存する。オフラインでも予定を表示できる */
export function localStorageCache(userId: string): CacheStorage {
  return {
    load() {
      try {
        const raw = localStorage.getItem(cacheKey(userId));
        if (!raw) return null;
        const v = JSON.parse(raw) as { data: AppData; pending: Pending; lastSyncedAt: string | null };
        const data = normalizeAppData(v.data);
        return { data, pending: { ...emptyPending(), ...v.pending }, lastSyncedAt: v.lastSyncedAt ?? null };
      } catch {
        return null;
      }
    },
    save(v) {
      try {
        localStorage.setItem(cacheKey(userId), JSON.stringify(v));
      } catch {
        /* 容量不足など。次回の保存で再試行される */
      }
    },
  };
}

// ---- 予定の進行状況(端末ごと) ----
const PROGRESS_KEY = 'kt:progress:v1';

export function loadProgress(): Progress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as Progress) : null;
  } catch {
    return null;
  }
}
export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* noop */
  }
}
