// DB行 <-> アプリ型 の変換。

import type { Activity, AppSettings, DateOverride, FreeDisplay, Preset, ScheduleItem, Theme, ThemeColors } from '../types';
import { DEFAULT_COLORS, defaultImageDisplay } from '../defaults';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function activityFromRow(r: Row): Activity {
  return {
    id: r.id,
    name: r.name,
    imagePath: r.image_path ?? null,
    shape: r.shape,
    scale: Number(r.scale),
    offsetX: Number(r.offset_x),
    offsetY: Number(r.offset_y),
    fit: r.fit,
    borderColor: r.border_color,
    borderOpacity: r.border_opacity,
    borderWidth: r.border_width,
    flashEnabled: r.flash_enabled,
    flashMinutes: r.flash_minutes,
    flashBgColor: r.flash_bg_color ?? null,
    flashBgOpacity: r.flash_bg_opacity ?? null,
    switchMode: r.switch_mode,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: r.version,
  };
}

export function activityToRow(a: Activity): Row {
  return {
    id: a.id,
    name: a.name,
    image_path: a.imagePath,
    shape: a.shape,
    scale: a.scale,
    offset_x: a.offsetX,
    offset_y: a.offsetY,
    fit: a.fit,
    border_color: a.borderColor,
    border_opacity: a.borderOpacity,
    border_width: a.borderWidth,
    flash_enabled: a.flashEnabled,
    flash_minutes: a.flashMinutes,
    flash_bg_color: a.flashBgColor,
    flash_bg_opacity: a.flashBgOpacity,
    switch_mode: a.switchMode,
  };
}

export function itemFromRow(r: Row): ScheduleItem {
  const free: FreeDisplay | null =
    r.kind === 'free'
      ? {
          ...defaultImageDisplay(),
          name: r.free_name ?? '',
          imagePath: r.free_image_path ?? null,
          shape: r.free_shape ?? 'circle',
          scale: r.free_scale == null ? 1 : Number(r.free_scale),
          offsetX: r.free_offset_x == null ? 0 : Number(r.free_offset_x),
          offsetY: r.free_offset_y == null ? 0 : Number(r.free_offset_y),
          fit: r.free_fit ?? 'cover',
          borderColor: r.free_border_color ?? '#6c63c9',
          borderOpacity: r.free_border_opacity ?? 100,
          borderWidth: r.free_border_width ?? 8,
        }
      : null;
  return {
    id: r.id,
    startMin: r.start_min,
    endMin: r.end_min,
    kind: r.kind,
    activityId: r.activity_id ?? null,
    free,
    flash: r.flash,
    flashMinutes: r.flash_minutes ?? null,
    switchMode: r.switch_mode,
  };
}

export function itemToRow(it: ScheduleItem, position: number): Row {
  const f = it.free;
  return {
    id: it.id,
    position,
    start_min: it.startMin,
    end_min: it.endMin,
    kind: it.kind,
    activity_id: it.kind === 'activity' ? it.activityId : null,
    free_name: f?.name ?? null,
    free_image_path: f?.imagePath ?? null,
    free_shape: f?.shape ?? null,
    free_scale: f?.scale ?? null,
    free_offset_x: f?.offsetX ?? null,
    free_offset_y: f?.offsetY ?? null,
    free_fit: f?.fit ?? null,
    free_border_color: f?.borderColor ?? null,
    free_border_opacity: f?.borderOpacity ?? null,
    free_border_width: f?.borderWidth ?? null,
    flash: it.flash,
    flash_minutes: it.flashMinutes,
    switch_mode: it.switchMode,
  };
}

export function presetFromRows(r: Row, itemRows: Row[]): Preset {
  return {
    id: r.id,
    name: r.name,
    defaultSwitchMode: r.default_switch_mode,
    items: [...itemRows].sort((a, b) => a.position - b.position).map(itemFromRow),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: r.version,
  };
}

export function presetHeadToRow(p: Preset): Row {
  return { id: p.id, name: p.name, default_switch_mode: p.defaultSwitchMode };
}

export function overrideFromRow(r: Row): DateOverride {
  return {
    id: r.id,
    kind: r.kind,
    startDate: r.start_date,
    endDate: r.end_date,
    presetId: r.preset_id,
    label: r.label ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: r.version,
  };
}

export function overrideToRow(o: DateOverride): Row {
  return { id: o.id, kind: o.kind, start_date: o.startDate, end_date: o.endDate, preset_id: o.presetId, label: o.label };
}

/** 保存済みの配色に足りないキーがあっても、既定値で補う(将来キーが増えても壊れない) */
export function mergeColors(saved: Partial<ThemeColors> | null | undefined): ThemeColors {
  const out = structuredClone(DEFAULT_COLORS);
  if (saved) for (const k of Object.keys(out) as (keyof ThemeColors)[]) if (saved[k]) out[k] = { ...out[k], ...saved[k] };
  return out;
}

export function themeFromRow(r: Row): Theme {
  return { colors: mergeColors(r.colors), version: r.version, updatedAt: r.updated_at };
}

export function themeToRow(t: Theme): Row {
  return { colors: t.colors };
}

export function settingsFromRow(r: Row): AppSettings {
  const wd: (string | null)[] = Array.from({ length: 7 }, (_, i) => (r.weekday_presets?.[i] as string | null | undefined) ?? null);
  return {
    weekdayPresets: wd,
    holidayPresetId: r.holiday_preset_id ?? null,
    defaultPresetId: r.default_preset_id ?? null,
    lockSalt: r.lock_salt ?? null,
    lockHash: r.lock_hash ?? null,
    lockIterations: r.lock_iterations ?? null,
    timeFormat: 'kana',
    version: r.version,
    updatedAt: r.updated_at,
  };
}

export function settingsToRow(s: AppSettings): Row {
  return {
    weekday_presets: s.weekdayPresets,
    holiday_preset_id: s.holidayPresetId,
    default_preset_id: s.defaultPresetId,
    lock_salt: s.lockSalt,
    lock_hash: s.lockHash,
    lock_iterations: s.lockIterations,
    time_format: s.timeFormat,
  };
}
