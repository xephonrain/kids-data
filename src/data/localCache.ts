import type { AppData, CheckItem, Checksheet, Progress } from '../types';
import { mergeColors } from './mappers';
import { defaultImageDisplay, defaultSettings, defaultTheme } from '../defaults';
import { emptyCheckDay, ensureCheckDay, type CheckDay } from '../lib/checklist';
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

/**
 * チェックリスト関連の補完。以前の形式(シートの中に項目名・時間帯を持つ)で保存されたデータは、
 * 「チェック項目」として切り出し、時間帯・曜日は捨てる(活動から作った項目は活動の画像設定を引き継ぐ)。
 */
export function migrateChecklists(v: Partial<AppData>): { checkItems: CheckItem[]; checksheets: Checksheet[] } {
  const items = new Map<string, CheckItem>((v.checkItems ?? []).map((i) => [i.id, i]));
  const sheets: Checksheet[] = [];
  for (const raw of (v.checksheets ?? []) as unknown as Record<string, unknown>[]) {
    const legacy = Array.isArray(raw.items) ? (raw.items as { id: string; name: string; activityId?: string | null }[]) : null;
    let itemIds = Array.isArray(raw.itemIds) ? (raw.itemIds as string[]) : [];
    if (legacy) {
      itemIds = [];
      for (const li of legacy) {
        if (!items.has(li.id)) {
          const act = li.activityId ? (v.activities ?? []).find((a) => a.id === li.activityId) : undefined;
          const base = act ? { imagePath: act.imagePath, shape: act.shape, scale: act.scale, offsetX: act.offsetX, offsetY: act.offsetY, fit: act.fit, borderColor: act.borderColor, borderOpacity: act.borderOpacity, borderWidth: act.borderWidth } : defaultImageDisplay();
          items.set(li.id, { ...base, id: li.id, name: li.name });
        }
        itemIds.push(li.id);
      }
    }
    sheets.push({ id: String(raw.id), name: String(raw.name ?? ''), itemIds, rewardEnabled: raw.rewardEnabled !== false });
  }
  return { checkItems: [...items.values()], checksheets: sheets };
}

/** 将来キーが増えても壊れないように、既定値で補完する */
export function normalizeAppData(raw: Partial<AppData> | undefined): AppData {
  const v = raw ?? {};
  return {
    activities: v.activities ?? [],
    presets: v.presets ?? [],
    overrides: v.overrides ?? [],
    ...migrateChecklists(v),
    mapLog: v.mapLog ?? [],
    prefImages: v.prefImages ?? {},
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

// ---- チェックシートの進み具合(端末ごと、その日だけ有効) ----
const CHECKS_KEY = 'kt:checks:v1';
export const CHECKS_EVENT = 'kt:checks';

export function loadCheckDay(dateKey: string): CheckDay {
  try {
    const raw = localStorage.getItem(CHECKS_KEY);
    return ensureCheckDay(raw ? (JSON.parse(raw) as CheckDay) : null, dateKey);
  } catch {
    return emptyCheckDay(dateKey);
  }
}
export function saveCheckDay(d: CheckDay): void {
  try {
    localStorage.setItem(CHECKS_KEY, JSON.stringify(d));
    // 表示中のチェックリスト画面に、設定画面などからの変更(ごほうびの取り消し等)を知らせる
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHECKS_EVENT));
  } catch {
    /* noop */
  }
}
