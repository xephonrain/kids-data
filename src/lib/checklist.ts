// チェックシートの純粋なロジック(表示判定・進み具合・ごほうびシールの選び方)。画面や保存に依存しない。

import type { Checksheet, ImageDisplay } from '../types';

/** 県の絵を、枠なしで全体が見えるように表示するための設定 */
export const plainImage = (imagePath: string, color = '#6c63c9'): ImageDisplay => ({ imagePath, shape: 'square', scale: 1, offsetX: 0, offsetY: 0, fit: 'contain', borderColor: color, borderOpacity: 0, borderWidth: 0 });

/** いま表示するチェックシート(曜日と時間帯で判定)。時間帯が逆(終了<開始)のものは表示しない */
export function activeSheets(sheets: Checksheet[], weekday: number, minOfDay: number): Checksheet[] {
  return sheets.filter((s) => s.items.length > 0 && (s.weekdays.length === 0 || s.weekdays.includes(weekday)) && s.startMin <= minOfDay && minOfDay < s.endMin);
}

/** その日のチェック状態(端末ごと)。シートIDごとにチェック済みの項目IDを持つ */
export interface CheckDay {
  dateKey: string;
  checked: Record<string, string[]>;
  /** 全部できたシートのごほうび。claimed=地図をぬった(その日そのシートでは二度ともらえない) */
  reward: Record<string, { claimed: boolean }>;
}

export const emptyCheckDay = (dateKey: string): CheckDay => ({ dateKey, checked: {}, reward: {} });

/** 日付が変わっていたら空にする。保存データが壊れていても落ちない */
export function ensureCheckDay(v: CheckDay | null | undefined, dateKey: string): CheckDay {
  if (!v || v.dateKey !== dateKey || typeof v.checked !== 'object' || !v.checked || typeof v.reward !== 'object' || !v.reward) return emptyCheckDay(dateKey);
  return v;
}

export function checkedIds(day: CheckDay, sheet: Checksheet): string[] {
  const valid = new Set(sheet.items.map((i) => i.id));
  return (day.checked[sheet.id] ?? []).filter((id) => valid.has(id));
}

export function isAllDone(day: CheckDay, sheet: Checksheet): boolean {
  return sheet.items.length > 0 && checkedIds(day, sheet).length === sheet.items.length;
}

/** チェックを入れる/外す(もう一度タップで外せる) */
export function toggleCheck(day: CheckDay, sheet: Checksheet, itemId: string): CheckDay {
  const cur = checkedIds(day, sheet);
  const next = cur.includes(itemId) ? cur.filter((x) => x !== itemId) : [...cur, itemId];
  return { ...day, checked: { ...day.checked, [sheet.id]: next } };
}

/** 次に「いま取り組む」項目(最初の未チェック) */
export function currentItemId(day: CheckDay, sheet: Checksheet): string | null {
  const done = new Set(checkedIds(day, sheet));
  return sheet.items.find((i) => !done.has(i.id))?.id ?? null;
}

/** 重ならないランダムな選択(直前と同じものを避ける) */
export function pickDifferent(count: number, last: number, rnd: number): number {
  if (count <= 1) return 0;
  const i = Math.floor(rnd * (count - 1));
  return i >= last ? i + 1 : i;
}
