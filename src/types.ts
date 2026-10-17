// アプリ全体で使うデータ型。時刻は「その日の0:00からの経過分」(0〜1440)で持つ。
// 終了時刻は1440を超える値も構造上は許容し、日付またぎに備える(現状のUIは1440まで)。

export type Shape = 'circle' | 'square';
export type Fit = 'contain' | 'cover';
export type SwitchMode = 'auto' | 'manual';
export type SwitchModeSetting = 'inherit' | SwitchMode;
export type FlashSetting = 'inherit' | 'on' | 'off';

/** 画像の表示設定。原本は加工せず、倍率・位置・方式だけを保存する。 */
export interface ImageDisplay {
  imagePath: string | null;
  shape: Shape;
  /** 表示倍率 1 = 基準(枠に合わせた大きさ) */
  scale: number;
  /** 表示位置。枠の大きさに対する割合 (-1〜1)。0 = 中央 */
  offsetX: number;
  offsetY: number;
  fit: Fit;
  borderColor: string;
  borderOpacity: number; // 0〜100
  borderWidth: number; // px (基準表示サイズに対する値)
}

export interface Activity extends ImageDisplay {
  id: string;
  name: string;
  flashEnabled: boolean;
  flashMinutes: number;
  /** 点滅時の背景色。nullなら配色設定の値を使う */
  flashBgColor: string | null;
  flashBgOpacity: number | null;
  switchMode: SwitchModeSetting;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** 活動データを作らずに時間割へ置ける「設定外の表示」 */
export interface FreeDisplay extends ImageDisplay {
  name: string;
}

export interface ScheduleItem {
  id: string;
  startMin: number;
  endMin: number;
  kind: 'activity' | 'free';
  activityId: string | null;
  free: FreeDisplay | null;
  flash: FlashSetting;
  /** nullなら活動側の設定を使う */
  flashMinutes: number | null;
  switchMode: SwitchModeSetting;
}

export interface Preset {
  id: string;
  name: string;
  /** プリセット単位の切り替え方式の初期値 */
  defaultSwitchMode: SwitchMode;
  items: ScheduleItem[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type OverrideKind = 'today' | 'tomorrow' | 'special';

/** 日付を指定した臨時変更(明日だけの変更・今日の変更・特別な日) */
export interface DateOverride {
  id: string;
  kind: OverrideKind;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (含む)
  presetId: string;
  label: string;
  /**
   * その日だけ使う時間割(「今の時間から開始」で作る)。あるときは、プリセットの項目の代わりにこれを使う。
   * 元のプリセットは書き換えない
   */
  customItems?: ScheduleItem[] | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ColorSetting {
  color: string; // #rrggbb
  opacity: number; // 0〜100
}

export type ThemeKey =
  | 'background'
  | 'clockFace'
  | 'clockRim'
  | 'hourHand'
  | 'minuteHand'
  | 'endHand'
  | 'clockFill'
  | 'clockFillFlash'
  | 'remainingBg'
  | 'remainingBgFlash'
  | 'remainingText'
  | 'activityNameBg'
  | 'activityNameText'
  | 'timeText'
  | 'backButtonBg'
  | 'backButtonText'
  | 'doneButtonBg'
  | 'doneButtonText'
  | 'settingsButtonBg'
  | 'settingsButtonText'
  | 'illustrationFrame'
  | 'panel';

export type ThemeColors = Record<ThemeKey, ColorSetting>;

export interface Theme {
  colors: ThemeColors;
  version: number;
  updatedAt: string;
}

export interface AppSettings {
  /** 曜日ごとのプリセット。index 0=日曜 ... 6=土曜 */
  weekdayPresets: (string | null)[];
  holidayPresetId: string | null;
  defaultPresetId: string | null;
  /** 設定画面ロック(PBKDF2ハッシュ)。平文は保存しない */
  lockSalt: string | null;
  lockHash: string | null;
  lockIterations: number | null;
  /** 残り5分以下で黄色、1分以下で赤に「あと○ふん」の背景を変える */
  urgencyColors: boolean;
  /** 「おわったよ」を押したときのごほうび演出(星・音符) */
  rewardEffect: boolean;
  /** 効果音(ごほうび・切り替え) */
  soundEffect: boolean;
  /** 時刻表示形式。将来の変更用 */
  timeFormat: 'kana';
  version: number;
  updatedAt: string;
}

/** チェックシートの項目。活動から作った場合は activityId を持ち、画像を共有する */
export interface ChecksheetItem {
  id: string;
  name: string;
  activityId: string | null;
}

/** 子ども向けのチェックシート(朝の準備など)。時間帯と曜日で表示する */
export interface Checksheet {
  id: string;
  name: string;
  items: ChecksheetItem[];
  /** 表示する時間帯(0:00からの分) */
  startMin: number;
  endMin: number;
  /** 表示する曜日(0=日〜6=土)。空なら毎日 */
  weekdays: number[];
  /** 全部できたらシールがもらえる */
  rewardEnabled: boolean;
}

/** 日本地図をぬった記録(1回のごほうび = 1県)。ぬる順は都道府県コード順で、記録の数から決まる */
export interface MapGet {
  id: string;
  prefCode: number;
  sheetId: string;
  dateKey: string;
  at: string;
}

export interface AppData {
  activities: Activity[];
  presets: Preset[];
  overrides: DateOverride[];
  checksheets: Checksheet[];
  mapLog: MapGet[];
  /** 県ごとの絵(任意)。キーは地図のid(例: hokkaido)、値は画像パス。未登録なら絵文字を表示 */
  prefImages: Record<string, string>;
  theme: Theme;
  settings: AppSettings;
}

/** 現在の予定進行状況(端末ごと、その日だけ有効) */
export interface Progress {
  dateKey: string;
  presetId: string | null;
  /** 現在表示中の時間割項目ID。nullなら時刻に従う(時間割の編集でindexがずれないようIDで持つ) */
  itemId: string | null;
  /** 戻った活動など、自動切り替えを止めている */
  held: boolean;
  /** 「おわったよ」で最後の項目まで終えた */
  finished: boolean;
}

/** 画面に表示する内容(時刻計算の結果) */
export interface DisplayModel {
  kind: 'item' | 'gap' | 'done' | 'none';
  name: string;
  image: ImageDisplay | null;
  item: ScheduleItem | null;
  index: number | null;
  /** 秒単位の残り(負なら終了時刻超過) */
  remainingSec: number;
  /** 表示する残り分(切り上げ、0以上) */
  remainingMin: number;
  /** 時計に描く終了時刻(0:00からの分) */
  endMin: number | null;
  flashing: boolean;
  /** 終了時刻を過ぎて手動切り替え待ち */
  overtime: boolean;
  canGoBack: boolean;
  canFinish: boolean;
  /** 次のやること(「つぎは」の予告用)。なければnull/未指定 */
  next?: { name: string; image: ImageDisplay | null } | null;
}
