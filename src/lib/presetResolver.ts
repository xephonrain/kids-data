// その日に使うプリセットを決める。
// 優先順位: 1.日付指定の臨時変更 > 2.祝日用 > 3.曜日別 > 4.デフォルト

import type { AppData, DateOverride, Preset } from '../types';
import { isHoliday } from './holidays';
import { weekdayOf } from './time';

export type PresetSource = 'override' | 'holiday' | 'weekday' | 'default' | 'none';

export interface Resolution {
  presetId: string | null;
  source: PresetSource;
  /** 採用された臨時変更 */
  override: DateOverride | null;
  /** 同じ日に重なっていて採用されなかった臨時変更(競合) */
  conflicts: DateOverride[];
}

export function overrideCovers(o: DateOverride, date: string): boolean {
  return o.startDate <= date && date <= o.endDate;
}

/** 同じ優先度(臨時変更)が複数ある場合は、更新日時が新しいものを採用する。同時刻ならIDの辞書順 */
export function pickOverride(candidates: DateOverride[]): DateOverride | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => (a.updatedAt === b.updatedAt ? (a.id < b.id ? -1 : 1) : a.updatedAt < b.updatedAt ? 1 : -1))[0];
}

export function resolvePreset(date: string, data: Pick<AppData, 'overrides' | 'presets' | 'settings'>): Resolution {
  const exists = (id: string | null): id is string => !!id && data.presets.some((p) => p.id === id);

  const covering = data.overrides.filter((o) => overrideCovers(o, date) && exists(o.presetId));
  const chosen = pickOverride(covering);
  if (chosen) {
    const conflicts = covering.filter((o) => o.id !== chosen.id && o.presetId !== chosen.presetId);
    return { presetId: chosen.presetId, source: 'override', override: chosen, conflicts };
  }

  const s = data.settings;
  if (isHoliday(date) && exists(s.holidayPresetId)) {
    return { presetId: s.holidayPresetId, source: 'holiday', override: null, conflicts: [] };
  }
  const wd = s.weekdayPresets[weekdayOf(date)] ?? null;
  if (exists(wd)) return { presetId: wd, source: 'weekday', override: null, conflicts: [] };
  if (exists(s.defaultPresetId)) return { presetId: s.defaultPresetId, source: 'default', override: null, conflicts: [] };
  return { presetId: null, source: 'none', override: null, conflicts: [] };
}

export function findPreset(data: Pick<AppData, 'presets'>, id: string | null): Preset | null {
  return id ? (data.presets.find((p) => p.id === id) ?? null) : null;
}

/** 設定上の競合: 期間が重なり、異なるプリセットを指す臨時変更の組 */
export function findOverrideConflicts(overrides: DateOverride[]): [DateOverride, DateOverride][] {
  const pairs: [DateOverride, DateOverride][] = [];
  for (let i = 0; i < overrides.length; i++) {
    for (let j = i + 1; j < overrides.length; j++) {
      const a = overrides[i];
      const b = overrides[j];
      const overlap = a.startDate <= b.endDate && b.startDate <= a.endDate;
      if (overlap && a.presetId !== b.presetId) pairs.push([a, b]);
    }
  }
  return pairs;
}

/** 期限切れ(終了日が昨日以前)の臨時変更。明日限定が翌々日以降に残らないよう掃除する対象 */
export function expiredOverrides(overrides: DateOverride[], today: string): DateOverride[] {
  return overrides.filter((o) => o.endDate < today);
}

/**
 * 「今日だけ」「明日だけ」の変更を設定する。同じ日付の同種の変更は置き換え、presetIdがnullなら解除する。
 * 通常の曜日・祝日設定には触れない。
 */
export function withDayOverride(overrides: DateOverride[], kind: 'today' | 'tomorrow', date: string, presetId: string | null, newId: string, nowIso: string): DateOverride[] {
  const rest = overrides.filter((o) => !(o.kind === kind && o.startDate === date && o.endDate === date));
  if (!presetId) return rest;
  return [...rest, { id: newId, kind, startDate: date, endDate: date, presetId, label: kind === 'today' ? '今日だけ' : '明日だけ', createdAt: nowIso, updatedAt: nowIso, version: 0 }];
}
