// 時間割の一括編集(画面に依存しない計算)。
//  - 時刻を変えたとき、それ以降の予定を「長さと間隔を保ったまま」ずらす
//  - 「今の時間から開始」: 最初の予定を今の時刻にして、以降を並べ直す

import type { ScheduleItem } from '../types';

export const DAY_END = 1440;

export interface EditResult {
  items: ScheduleItem[];
  /** 自動調整が入ったときの説明(画面に表示する) */
  notes: string[];
}

const byStart = (a: ScheduleItem, b: ScheduleItem) => a.startMin - b.startMin || a.endMin - b.endMin;

function shifted(items: ScheduleItem[], ids: Set<string>, delta: number): ScheduleItem[] {
  return items.map((i) => (ids.has(i.id) ? { ...i, startMin: i.startMin + delta, endMin: i.endMin + delta } : i));
}

/**
 * 終了時刻を変える。その予定の開始は動かさず、以降の予定は変えた分だけ開始・終了を一緒にずらす
 * (各予定の長さと、予定どうしの間隔は変わらない)。重ならないよう自動で調整される。
 *  - 終了は「開始の1分後」より前にはできない
 *  - 以降の予定が夜12時(24:00)を超える場合は、超えない範囲まで
 */
export function setEnd(items: ScheduleItem[], id: string, newEnd: number, cascade = true): EditResult {
  const sorted = [...items].sort(byStart);
  const idx = sorted.findIndex((i) => i.id === id);
  if (idx < 0) return { items, notes: [] };
  const it = sorted[idx];
  const notes: string[] = [];
  let end = Math.round(newEnd);

  if (end <= it.startMin) {
    end = it.startMin + 1;
    notes.push('終了は開始より後の時刻にしてください(開始の1分後にしました)');
  }
  if (end > DAY_END) end = DAY_END;

  const later = sorted.slice(idx + 1);
  let delta = end - it.endMin;
  if (cascade && later.length > 0 && delta > 0) {
    const lastEnd = Math.max(...later.map((i) => i.endMin));
    const room = DAY_END - lastEnd;
    if (delta > room) {
      delta = Math.max(0, room);
      end = it.endMin + delta;
      notes.push('以降の予定が夜12時(24:00)を超えないように、ここまでにしました');
    }
  }
  if (!cascade) {
    // 以降はずらさない。次の予定と重ならない範囲に収める
    const next = later[0];
    if (next && end > next.startMin) {
      end = next.startMin;
      notes.push('次の予定と重ならないよう、次の開始時刻までにしました');
      if (end <= it.startMin) end = it.startMin + 1;
    }
    delta = 0;
  }

  const ids = new Set(cascade ? later.map((i) => i.id) : []);
  const out = shifted(items, ids, delta).map((i) => (i.id === id ? { ...i, endMin: end } : i));
  if (cascade && later.length > 0 && delta !== 0) notes.push(`以降の${later.length}件を${Math.abs(delta)}分${delta > 0 ? '後ろ' : '前'}にずらしました`);
  return { items: out, notes };
}

/**
 * 開始時刻を変える。その予定と、それ以降の予定をまとめて同じ分だけずらす(長さと間隔は変わらない)。
 * 最初の予定の開始を変えれば、時間割ぜんたいが前倒し・後ろ倒しになる。
 *  - 前の予定と重ならない位置まで(いちばん前の予定なら0:00まで)
 *  - 最後の予定が夜12時(24:00)を超えない位置まで
 */
export function setStart(items: ScheduleItem[], id: string, newStart: number, cascade = true): EditResult {
  const sorted = [...items].sort(byStart);
  const idx = sorted.findIndex((i) => i.id === id);
  if (idx < 0) return { items, notes: [] };
  const it = sorted[idx];
  const notes: string[] = [];
  const group = cascade ? sorted.slice(idx) : [it];
  const prev = idx > 0 ? sorted[idx - 1] : null;

  let delta = Math.round(newStart) - it.startMin;
  const minDelta = -(it.startMin - (prev ? prev.endMin : 0));
  const maxDelta = DAY_END - Math.max(...group.map((i) => i.endMin));
  if (delta < minDelta) {
    delta = minDelta;
    notes.push(prev ? '前の予定と重ならないよう、前の予定の終了までにしました' : '0:00より前にはできません');
  }
  if (delta > maxDelta) {
    delta = Math.max(0, maxDelta);
    notes.push('夜12時(24:00)を超えないように、ここまでにしました');
  }
  if (!cascade) {
    // この予定だけ動かす場合は、長さは変えず、終了は動かさない(開始だけ変える)
    const start = Math.max(prev ? prev.endMin : 0, Math.min(Math.round(newStart), it.endMin - 1));
    return { items: items.map((i) => (i.id === id ? { ...i, startMin: start } : i)), notes };
  }
  const out = shifted(items, new Set(group.map((i) => i.id)), delta);
  if (delta !== 0 && group.length > 1) notes.push(`この予定と以降の${group.length - 1}件を、まとめて${Math.abs(delta)}分${delta > 0 ? '後ろ' : '前'}にずらしました`);
  return { items: out, notes };
}

export interface FromNowResult {
  items: ScheduleItem[];
  /** 夜12時を超えて、予定ごと除いた件数 */
  dropped: number;
  /** 夜12時で途中までに短縮した予定があるか */
  truncated: boolean;
}

/** 予定の長さ(分) */
export const lengthOf = (it: ScheduleItem) => it.endMin - it.startMin;

/**
 * 「今の時間から開始」: 最初の予定の開始を nowMin にして、以降を並べ直す。
 *  - 各予定の長さは元のまま。durations で予定ごとに上書きできる(キーは予定のid)
 *  - 予定どうしの間隔(すきま)は元のまま
 *  - 夜12時(24:00)を超える分は切り詰め、完全に超える予定は除く
 */
export function startFromNow(items: ScheduleItem[], nowMin: number, durations: Record<string, number> = {}): FromNowResult {
  const sorted = [...items].filter((i) => i.endMin > i.startMin).sort(byStart);
  const out: ScheduleItem[] = [];
  let dropped = 0;
  let truncated = false;
  let cursor = Math.max(0, Math.min(Math.round(nowMin), DAY_END - 1));
  let prevOrigEnd: number | null = null;
  for (const it of sorted) {
    const gap = prevOrigEnd === null ? 0 : Math.max(0, it.startMin - prevOrigEnd);
    const start = cursor + gap;
    const len = Math.max(1, Math.round(durations[it.id] ?? lengthOf(it)));
    prevOrigEnd = it.endMin;
    if (start >= DAY_END) {
      dropped++;
      cursor = start + len; // 以降も同じく超える
      continue;
    }
    const end = Math.min(DAY_END, start + len);
    if (end < start + len) truncated = true;
    out.push({ ...it, startMin: start, endMin: end });
    cursor = start + len;
  }
  return { items: out, dropped, truncated };
}

export interface QuickPick {
  /** 画面上のキー(同じ活動を複数回えらべるよう、活動idとは別) */
  key: string;
  activityId: string;
  minutes: number;
}

/**
 * 「やることをえらんで、その場で今日の時間割を作る」: 選んだ順に、startMinから隙間なく並べる。
 * 24:00を超える分は短くし、完全に超える分は除く。
 */
export function buildQuickItems(picks: QuickPick[], startMin: number, newId: () => string): { items: ScheduleItem[]; dropped: number; truncated: boolean } {
  const items: ScheduleItem[] = [];
  let cursor = Math.max(0, Math.min(Math.round(startMin), DAY_END - 1));
  let dropped = 0;
  let truncated = false;
  for (const p of picks) {
    const len = Math.max(1, Math.round(p.minutes));
    if (cursor >= DAY_END) {
      dropped++;
      continue;
    }
    const end = Math.min(DAY_END, cursor + len);
    if (end < cursor + len) truncated = true;
    items.push({ id: newId(), startMin: cursor, endMin: end, kind: 'activity', activityId: p.activityId, free: null, flash: 'inherit', flashMinutes: null, switchMode: 'inherit' });
    cursor = end;
  }
  return { items, dropped, truncated };
}
