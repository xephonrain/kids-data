// 日本の祝日判定(内閣府の定める国民の祝日、2000〜2099年を対象)。
// 外部APIに依存せず端末内で計算するため、オフラインでも動く。
// 春分・秋分は1980〜2099年に有効な近似式を使用する。

import { addDays, dateKey, parseDateKey, pad2 } from './time';

export const HOLIDAY_MIN_YEAR = 2000;
export const HOLIDAY_MAX_YEAR = 2099;

function key(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** 第n月曜日の日 */
function nthMonday(y: number, m: number, n: number): number {
  const first = new Date(y, m - 1, 1).getDay(); // 0=日
  const firstMonday = 1 + ((8 - first) % 7);
  return firstMonday + (n - 1) * 7;
}

function vernalEquinoxDay(y: number): number {
  return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

function autumnalEquinoxDay(y: number): number {
  return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

const cache = new Map<number, Map<string, string>>();

/** その年の祝日(名前付き)。振替休日・国民の休日を含む */
export function holidaysOfYear(y: number): Map<string, string> {
  const hit = cache.get(y);
  if (hit) return hit;
  const map = new Map<string, string>();
  if (y < HOLIDAY_MIN_YEAR || y > HOLIDAY_MAX_YEAR) {
    cache.set(y, map);
    return map;
  }
  const add = (m: number, d: number, name: string) => map.set(key(y, m, d), name);

  add(1, 1, '元日');
  add(1, nthMonday(y, 1, 2), '成人の日');
  add(2, 11, '建国記念の日');
  if (y >= 2020) add(2, 23, '天皇誕生日');
  add(3, vernalEquinoxDay(y), '春分の日');
  add(4, 29, '昭和の日');
  add(5, 3, '憲法記念日');
  add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');

  // 海の日(2020・2021は東京五輪のため特例)
  if (y === 2020) add(7, 23, '海の日');
  else if (y === 2021) add(7, 22, '海の日');
  else add(7, nthMonday(y, 7, 3), '海の日');

  // 山の日(2016〜)
  if (y === 2020) add(8, 10, '山の日');
  else if (y === 2021) add(8, 8, '山の日');
  else add(8, 11, '山の日');

  add(9, nthMonday(y, 9, 3), '敬老の日');
  add(9, autumnalEquinoxDay(y), '秋分の日');

  // スポーツの日(2020〜)
  if (y === 2020) add(7, 24, 'スポーツの日');
  else if (y === 2021) add(7, 23, 'スポーツの日');
  else add(10, nthMonday(y, 10, 2), 'スポーツの日');

  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');

  // 国民の休日: 前日と翌日がともに祝日で、日曜でも祝日でもない日
  const base = new Set(map.keys());
  for (const k of base) {
    const mid = addDays(k, 1);
    if (!base.has(mid) && base.has(addDays(k, 2)) && parseDateKey(mid).getDay() !== 0 && parseDateKey(mid).getFullYear() === y) {
      map.set(mid, '国民の休日');
    }
  }

  // 振替休日: 祝日が日曜なら、その後の最初の祝日でない日
  for (const k of [...map.keys()].sort()) {
    if (parseDateKey(k).getDay() !== 0) continue;
    let next = addDays(k, 1);
    while (map.has(next)) next = addDays(next, 1);
    if (parseDateKey(next).getFullYear() === y) map.set(next, '振替休日');
  }

  cache.set(y, map);
  return map;
}

export function holidayName(dateStr: string): string | null {
  const y = Number(dateStr.slice(0, 4));
  return holidaysOfYear(y).get(dateStr) ?? null;
}

export function isHoliday(dateStr: string): boolean {
  return holidayName(dateStr) !== null;
}

/** 年末年始の振替が翌年にまたがる場合に備え、dateKeyから直接判定するヘルパー */
export function isHolidayDate(d: Date): boolean {
  return isHoliday(dateKey(d));
}
