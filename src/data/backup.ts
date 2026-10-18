// バックアップ(JSON)の作成・検証・復元データの組み立て。画像はdata URLとして同梱する。
// ロック用のパスワードハッシュは、バックアップに含めず、復元しても現在の値を保つ。

import type { Activity, AppData, CheckItem, Checksheet, DateOverride, Preset, ScheduleItem } from '../types';
import { migrateChecklists } from './localCache';
import { mergeColors } from './mappers';
import { defaultSettings, defaultTheme } from '../defaults';

export const BACKUP_FORMAT = 'kids-timer-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 60 * 1024 * 1024;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: AppData;
  /** 画像パス → data URL */
  images: Record<string, string>;
}

export function collectImagePaths(data: AppData): string[] {
  const s = new Set<string>();
  data.activities.forEach((a) => a.imagePath && s.add(a.imagePath));
  data.presets.forEach((p) => p.items.forEach((i) => i.free?.imagePath && s.add(i.free.imagePath)));
  (data.checkItems ?? []).forEach((i) => i.imagePath && s.add(i.imagePath));
  Object.values(data.prefImages ?? {}).forEach((p) => p && s.add(p));
  return [...s];
}

export async function buildBackup(data: AppData, toDataUrl: (path: string) => Promise<string | null>): Promise<{ file: BackupFile; missingImages: string[] }> {
  const images: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of collectImagePaths(data)) {
    const u = await toDataUrl(p);
    if (u) images[p] = u;
    else missing.push(p);
  }
  const clean: AppData = structuredClone(data);
  clean.settings = { ...clean.settings, lockSalt: null, lockHash: null, lockIterations: null };
  return { file: { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: clean, images }, missingImages: missing };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('JSONとして読み込めませんでした。バックアップファイルを選んでいるか確認してください');
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) throw new Error('このアプリのバックアップファイルではありません');
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) throw new Error('新しいバージョンのバックアップです。アプリを更新してください');
  const d = raw.data;
  if (!isObj(d) || !Array.isArray(d.activities) || !Array.isArray(d.presets) || !Array.isArray(d.overrides)) throw new Error('バックアップの内容が壊れています');

  const okActivity = (a: unknown) => isObj(a) && typeof a.id === 'string' && typeof a.name === 'string';
  const okPreset = (p: unknown) => isObj(p) && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.items);
  const okOverride = (o: unknown) => isObj(o) && typeof o.id === 'string' && typeof o.startDate === 'string' && typeof o.endDate === 'string' && typeof o.presetId === 'string';
  if (!d.activities.every(okActivity) || !d.presets.every(okPreset) || !d.overrides.every(okOverride)) throw new Error('バックアップの内容が壊れています(項目の形式が正しくありません)');

  return {
    format: BACKUP_FORMAT,
    version: raw.version,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    data: d as unknown as AppData,
    images: isObj(raw.images) ? (raw.images as Record<string, string>) : {},
  };
}

export function summarizeBackup(b: BackupFile): { activities: number; presets: number; overrides: number; checksheets: number; checkItems: number; mapLog: number; images: number; exportedAt: string } {
  return { activities: b.data.activities.length, presets: b.data.presets.length, overrides: b.data.overrides.length, checksheets: (b.data.checksheets ?? []).length, checkItems: migrateChecklists(b.data).checkItems.length, mapLog: (b.data.mapLog ?? []).length, images: Object.keys(b.images).length, exportedAt: b.exportedAt };
}

/**
 * 復元後のデータを組み立てる。
 *  - 同じIDの行は現在のバージョンを引き継ぐ(競合せず上書き)。新しいIDはversion 0(新規登録)
 *  - 画像パスは、再アップロード後の新しいパスへ置き換える
 *  - 存在しない活動/プリセットへの参照は除去して整合性を保つ
 *  - ロック設定は現在のものを維持
 */
export function planRestore(current: AppData, backup: BackupFile, pathMap: Record<string, string>, nowIso: string): { data: AppData; warnings: string[] } {
  const warnings: string[] = [];
  const b = backup.data;
  const remap = (p: string | null | undefined): string | null => (p ? (pathMap[p] ?? null) : null);
  const curA = new Map(current.activities.map((a) => [a.id, a]));
  const curP = new Map(current.presets.map((p) => [p.id, p]));
  const curO = new Map(current.overrides.map((o) => [o.id, o]));

  const activities: Activity[] = b.activities.map((a) => {
    const path = remap(a.imagePath);
    if (a.imagePath && !path) warnings.push(`活動「${a.name}」の画像を復元できませんでした`);
    return { ...a, imagePath: path, version: curA.get(a.id)?.version ?? 0, updatedAt: nowIso };
  });
  const actIds = new Set(activities.map((a) => a.id));

  const presets: Preset[] = b.presets.map((p) => {
    const items: ScheduleItem[] = [];
    for (const it of p.items) {
      if (it.kind === 'activity' && !(it.activityId && actIds.has(it.activityId))) {
        warnings.push(`プリセット「${p.name}」の、存在しない活動を指す項目を除外しました`);
        continue;
      }
      items.push({ ...it, free: it.free ? { ...it.free, imagePath: remap(it.free.imagePath) } : null });
    }
    return { ...p, items, version: curP.get(p.id)?.version ?? 0, updatedAt: nowIso };
  });
  const presetIds = new Set(presets.map((p) => p.id));

  const overrides: DateOverride[] = b.overrides
    .filter((o) => {
      const ok = presetIds.has(o.presetId);
      if (!ok) warnings.push(`臨時変更(${o.startDate})が存在しないプリセットを指すため除外しました`);
      return ok;
    })
    .map((o) => ({ ...o, version: curO.get(o.id)?.version ?? 0, updatedAt: nowIso }));

  const keep = (id: string | null | undefined) => (id && presetIds.has(id) ? id : null);
  const bs = { ...defaultSettings(), ...b.settings };
  const settings = {
    ...bs,
    weekdayPresets: Array.from({ length: 7 }, (_, i) => keep(bs.weekdayPresets?.[i])),
    holidayPresetId: keep(bs.holidayPresetId),
    defaultPresetId: keep(bs.defaultPresetId),
    lockSalt: current.settings.lockSalt,
    lockHash: current.settings.lockHash,
    lockIterations: current.settings.lockIterations,
    version: current.settings.version,
    updatedAt: nowIso,
  };
  const theme = { ...defaultTheme(), ...b.theme, colors: mergeColors(b.theme?.colors), version: current.theme.version, updatedAt: nowIso };

  // チェックリスト(以前の形式のバックアップも取り込む)。項目の画像は復元後のパスに置き換える
  const mig = migrateChecklists(b);
  const checkItems: CheckItem[] = mig.checkItems.map((i) => {
    const path = remap(i.imagePath);
    if (i.imagePath && !path) warnings.push(`チェック項目「${i.name}」の画像を復元できませんでした`);
    return { ...i, imagePath: path };
  });
  const itemIds = new Set(checkItems.map((i) => i.id));
  const checksheets: Checksheet[] = mig.checksheets.map((c) => ({ ...c, itemIds: c.itemIds.filter((id) => itemIds.has(id)) }));
  const prefImages: Record<string, string> = {};
  for (const [id, path] of Object.entries(b.prefImages ?? {})) {
    const np = remap(path);
    if (np) prefImages[id] = np;
    else warnings.push('県の絵(日本地図)の画像を1つ復元できませんでした');
  }
  const mapLog = (b.mapLog ?? []).filter((g) => typeof g.prefCode === 'number' && g.prefCode >= 1 && g.prefCode <= 47);

  return { data: { activities, presets, overrides, checkItems, checksheets, mapLog, prefImages, theme, settings }, warnings };
}
