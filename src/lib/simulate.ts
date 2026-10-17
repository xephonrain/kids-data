// プリセットの動作確認用: 「次のできごと」(点滅の開始・予定の開始・予定の終了)の時刻を求める。

import type { Activity, Preset } from '../types';
import { findActivity, resolveFlash, sortedItems } from './schedule';

export type EventKind = 'start' | 'flash' | 'end';
export interface SimEvent {
  sec: number;
  kind: EventKind;
  name: string;
}

export const EVENT_LABEL: Record<EventKind, string> = { start: 'はじまり', flash: '色がかわりはじめる', end: 'おわり' };

/** 時刻順のできごと一覧(同じ時刻に複数あれば全部残す) */
export function simEvents(preset: Preset | null, activities: Activity[]): SimEvent[] {
  const out: SimEvent[] = [];
  for (const it of sortedItems(preset)) {
    const act = findActivity(activities, it.activityId);
    const name = it.kind === 'free' ? it.free?.name || 'じゆうじかん' : (act?.name ?? '(活動なし)');
    out.push({ sec: it.startMin * 60, kind: 'start', name });
    const f = resolveFlash(it, act);
    const fs = it.endMin * 60 - f.minutes * 60;
    if (f.enabled && fs > it.startMin * 60) out.push({ sec: fs, kind: 'flash', name });
    out.push({ sec: it.endMin * 60, kind: 'end', name });
  }
  const order: Record<EventKind, number> = { end: 0, start: 1, flash: 2 };
  return out.sort((a, b) => a.sec - b.sec || order[a.kind] - order[b.kind]);
}

/** nowSecより後で最初の「時刻」(なければnull) */
export function nextEventSec(events: SimEvent[], nowSec: number): number | null {
  const e = events.find((x) => x.sec > nowSec);
  return e ? e.sec : null;
}
/** nowSecより前で最後の「時刻」(なければnull) */
export function prevEventSec(events: SimEvent[], nowSec: number): number | null {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].sec < nowSec) return events[i].sec;
  return null;
}
