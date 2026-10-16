import type { Activity, AppData, AppSettings, ImageDisplay, Theme, ThemeColors, ThemeKey } from './types';

export const DEFAULT_COLORS: ThemeColors = {
  background: { color: '#ffffff', opacity: 100 },
  clockFace: { color: '#ffffff', opacity: 100 },
  clockRim: { color: '#6c63c9', opacity: 100 },
  hourHand: { color: '#3b3b58', opacity: 100 },
  minuteHand: { color: '#3b82c4', opacity: 100 },
  endHand: { color: '#e5484d', opacity: 100 },
  clockFill: { color: '#4fb286', opacity: 45 },
  clockFillFlash: { color: '#f2a93b', opacity: 65 },
  remainingBg: { color: '#e4f4ec', opacity: 100 },
  remainingBgFlash: { color: '#ffe3a8', opacity: 100 },
  remainingText: { color: '#1f3d2f', opacity: 100 },
  activityNameBg: { color: '#ece9fb', opacity: 100 },
  activityNameText: { color: '#3a2f7a', opacity: 100 },
  timeText: { color: '#3b3b58', opacity: 100 },
  backButtonBg: { color: '#dbe9f8', opacity: 100 },
  backButtonText: { color: '#1f4a7a', opacity: 100 },
  doneButtonBg: { color: '#26805a', opacity: 100 },
  doneButtonText: { color: '#ffffff', opacity: 100 },
  settingsButtonBg: { color: '#ece9fb', opacity: 100 },
  settingsButtonText: { color: '#3a2f7a', opacity: 100 },
  illustrationFrame: { color: '#6c63c9', opacity: 100 },
  panel: { color: '#f6f4fd', opacity: 100 },
};

export const THEME_LABELS: Record<ThemeKey, string> = {
  background: '画面全体の背景',
  clockFace: '時計の文字盤',
  clockRim: '時計の縁',
  hourHand: '時針',
  minuteHand: '分針',
  endHand: '終了時刻の赤い針',
  clockFill: '残り時間の塗りつぶし(通常)',
  clockFillFlash: '残り時間の塗りつぶし(点滅時)',
  remainingBg: '「あと○ふん」の背景(通常)',
  remainingBgFlash: '「あと○ふん」の背景(点滅時)',
  remainingText: '「あと○ふん」の文字',
  activityNameBg: '活動名の背景',
  activityNameText: '活動名の文字',
  timeText: '現在時刻の文字',
  backButtonBg: '「まだおわってなかった」背景',
  backButtonText: '「まだおわってなかった」文字',
  doneButtonBg: '「おわったよ」背景',
  doneButtonText: '「おわったよ」文字',
  settingsButtonBg: '「せってい」背景',
  settingsButtonText: '「せってい」文字',
  illustrationFrame: 'イラストの枠(既定)',
  panel: 'パネル',
};

/** 文字色と背景色の組み合わせ(読みやすさチェック用) */
export const CONTRAST_PAIRS: { text: ThemeKey; bg: ThemeKey[]; label: string }[] = [
  { text: 'remainingText', bg: ['remainingBg', 'remainingBgFlash'], label: '「あと○ふん」' },
  { text: 'activityNameText', bg: ['activityNameBg'], label: '活動名' },
  { text: 'backButtonText', bg: ['backButtonBg'], label: '「まだおわってなかった」' },
  { text: 'doneButtonText', bg: ['doneButtonBg'], label: '「おわったよ」' },
  { text: 'settingsButtonText', bg: ['settingsButtonBg'], label: '「せってい」' },
  { text: 'timeText', bg: ['background'], label: '現在時刻' },
];

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function defaultTheme(): Theme {
  return { colors: structuredClone(DEFAULT_COLORS), version: 0, updatedAt: nowIso() };
}

export function defaultSettings(): AppSettings {
  return {
    weekdayPresets: [null, null, null, null, null, null, null],
    holidayPresetId: null,
    defaultPresetId: null,
    lockSalt: null,
    lockHash: null,
    lockIterations: null,
    lockDisabled: false,
    timeFormat: 'kana',
    version: 0,
    updatedAt: nowIso(),
  };
}

export function defaultImageDisplay(): ImageDisplay {
  return {
    imagePath: null,
    shape: 'circle',
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    fit: 'cover',
    borderColor: '#6c63c9',
    borderOpacity: 100,
    borderWidth: 8,
  };
}

export function newActivity(name = ''): Activity {
  const t = nowIso();
  return {
    ...defaultImageDisplay(),
    id: newId(),
    name,
    flashEnabled: false, // 初期値は点滅オフ
    flashMinutes: 5,
    flashBgColor: null,
    flashBgOpacity: null,
    switchMode: 'inherit',
    createdAt: t,
    updatedAt: t,
    version: 0,
  };
}

export function emptyAppData(): AppData {
  return { activities: [], presets: [], overrides: [], theme: defaultTheme(), settings: defaultSettings() };
}
