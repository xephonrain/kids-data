// 時刻まわりの純関数。端末のローカル時刻を基準にする。

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** ローカル日付を YYYY-MM-DD にする */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 日付キーに日数を足す。年またぎ・うるう年は Date に任せる */
export function addDays(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export function weekdayOf(key: string): number {
  return parseDateKey(key).getDay(); // 0=日
}

export const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export function formatDateJa(key: string): string {
  const d = parseDateKey(key);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAY_NAMES[d.getDay()]})`;
}

/** その日の0:00からの経過秒(小数含む) */
export function secondsOfDay(now: Date): number {
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
}

export function minutesToHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const isNextDay = min >= 1440;
  const text = `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  return isNextDay && min !== 1440 ? `翌${text}` : min === 1440 ? '24:00' : text;
}

export function hhmmToMinutes(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59 || (h === 24 && mm !== 0)) return null;
  return h * 60 + mm;
}

/** 「8じ15ふん」形式。表示形式を変えるときはここだけ直す */
export function formatClockKana(now: Date): string {
  const h = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12;
  return `${h}じ${now.getMinutes()}ふん`;
}

/** 残り秒数 → 表示用の残り分(切り上げ)。全画面でこの関数だけを使い丸め方を統一する */
export function remainingMinutesFromSec(sec: number): number {
  if (sec <= 0) return 0;
  return Math.ceil(sec / 60);
}

/** 時針の角度(度、12時方向=0、時計回り) */
export function hourHandAngle(now: Date): number {
  const h = now.getHours() % 12;
  return (h + now.getMinutes() / 60 + now.getSeconds() / 3600) * 30;
}

/** 分針の角度 */
export function minuteHandAngle(now: Date): number {
  return (now.getMinutes() + now.getSeconds() / 60) * 6;
}

/** 0:00からの分 → 文字盤の分針位置の角度(度) */
export function minuteAngleOfMinutes(minOfDay: number): number {
  return ((minOfDay % 60) + 60) % 60 * 6;
}

/**
 * 残り時間の扇形。startAngleは現在の分針、sweepは残り分×6度(最大360)。
 * 終点 = startAngle + sweep は、終了時刻の分針位置(赤い針)と必ず一致する。
 */
export function fillSector(nowSecOfDay: number, endMin: number): { startAngle: number; sweep: number; endAngle: number } {
  const remainingMin = Math.max(0, endMin - nowSecOfDay / 60);
  const startAngle = ((nowSecOfDay / 60) % 60) * 6;
  const sweep = Math.min(remainingMin, 60) * 6;
  return { startAngle, sweep, endAngle: minuteAngleOfMinutes(endMin) };
}
