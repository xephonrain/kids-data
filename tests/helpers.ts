import { defaultImageDisplay, defaultSettings, newActivity } from '../src/defaults';
import type { Activity, AppData, DateOverride, Preset, ScheduleItem, SwitchMode } from '../src/types';
import { defaultTheme } from '../src/defaults';

export const hm = (h: number, m = 0) => h * 60 + m;
export const sec = (h: number, m = 0, s = 0) => h * 3600 + m * 60 + s;

export function act(name: string, over: Partial<Activity> = {}): Activity {
  return { ...newActivity(name), id: `act-${name}`, ...over };
}

export function item(id: string, startMin: number, endMin: number, activityId: string | null, over: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id,
    startMin,
    endMin,
    kind: activityId ? 'activity' : 'free',
    activityId,
    free: activityId ? null : { ...defaultImageDisplay(), name: 'じゆうじかん' },
    flash: 'inherit',
    flashMinutes: null,
    switchMode: 'inherit',
    ...over,
  };
}

export function preset(id: string, items: ScheduleItem[], mode: SwitchMode = 'auto', name = id): Preset {
  return { id, name, defaultSwitchMode: mode, items, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', version: 0 };
}

export function ov(id: string, start: string, end: string, presetId: string, updatedAt = '2026-01-01T00:00:00Z'): DateOverride {
  return { id, kind: 'special', startDate: start, endDate: end, presetId, label: '', createdAt: updatedAt, updatedAt, version: 1 };
}

export function data(over: Partial<AppData> = {}): AppData {
  return { activities: [], presets: [], overrides: [], theme: defaultTheme(), settings: defaultSettings(), ...over };
}
