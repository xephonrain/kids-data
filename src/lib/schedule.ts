// 予定の進行(時刻計算・切り替え・点滅判定)。UIから独立した純関数だけで構成する。
//
// 状態は Progress(端末ごと・その日だけ)。表示内容は「Progress + 現在時刻」から毎回計算するので、
// 描画回数・スリープ復帰・端末時刻の変更に左右されない。
// 状態を変える操作は tick(時間経過による自動切替)/ advance(おわったよ)/ goBack(まだおわってなかった) の3つだけ。

import type { Activity, DisplayModel, Preset, Progress, ScheduleItem, SwitchMode } from '../types';
import { remainingMinutesFromSec } from './time';

export function freshProgress(dateKeyStr: string, presetId: string | null): Progress {
  return { dateKey: dateKeyStr, presetId, itemId: null, held: false, finished: false };
}

/** 日付かプリセットが変わっていたら進行状況をリセットする。「今日の途中でプリセット変更」でも終了済みの活動は再実行されない(時刻に従うため) */
export function ensureProgress(p: Progress | null, dateKeyStr: string, presetId: string | null): Progress {
  if (!p || p.dateKey !== dateKeyStr || p.presetId !== presetId) return freshProgress(dateKeyStr, presetId);
  return p;
}

export function sortedItems(preset: Preset | null): ScheduleItem[] {
  if (!preset) return [];
  return [...preset.items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

export function findActivity(activities: Activity[], id: string | null): Activity | null {
  return id ? (activities.find((a) => a.id === id) ?? null) : null;
}

/** 切り替え方式: 時間割項目 > 活動 > プリセットの初期値 */
export function resolveSwitchMode(item: ScheduleItem, activity: Activity | null, preset: Preset): SwitchMode {
  if (item.switchMode !== 'inherit') return item.switchMode;
  if (activity && activity.switchMode !== 'inherit') return activity.switchMode;
  return preset.defaultSwitchMode;
}

export function resolveFlash(item: ScheduleItem, activity: Activity | null): { enabled: boolean; minutes: number } {
  const enabled = item.flash === 'inherit' ? (activity?.flashEnabled ?? false) : item.flash === 'on';
  const minutes = item.flashMinutes ?? activity?.flashMinutes ?? 5;
  return { enabled, minutes };
}

/** 現在時刻を含む項目のindex(なければnull) */
export function naturalIndex(items: ScheduleItem[], nowSec: number): number | null {
  const i = items.findIndex((it) => it.startMin * 60 <= nowSec && nowSec < it.endMin * 60);
  return i < 0 ? null : i;
}

function indexOfId(items: ScheduleItem[], id: string | null): number | null {
  if (!id) return null;
  const i = items.findIndex((it) => it.id === id);
  return i < 0 ? null : i;
}

/** 時間経過による更新。変化がなければ同じオブジェクトを返す(再描画を避ける) */
export function tick(progress: Progress, preset: Preset | null, activities: Activity[], nowSec: number): Progress {
  if (!preset || progress.finished) return progress;
  const items = sortedItems(preset);
  if (items.length === 0) return progress;

  let p = progress;
  for (let guard = 0; guard < items.length + 2; guard++) {
    const idx = indexOfId(items, p.itemId);
    if (idx === null) {
      const nat = naturalIndex(items, nowSec);
      if (nat === null) {
        return p.itemId === null ? p : { ...p, itemId: null };
      }
      p = { ...p, itemId: items[nat].id, held: false };
      // 切り替え直後にまだ自動切替の対象か判定するため、ループを続ける
      const it = items[nat];
      const mode = resolveSwitchMode(it, findActivity(activities, it.activityId), preset);
      if (!(mode === 'auto' && nowSec >= it.endMin * 60)) return p;
      continue;
    }
    const it = items[idx];
    const mode = resolveSwitchMode(it, findActivity(activities, it.activityId), preset);
    if (!p.held && mode === 'auto' && nowSec >= it.endMin * 60) {
      p = { ...p, itemId: null };
      continue; // 次の項目を時刻から決め直す
    }
    return p;
  }
  return p;
}

/** 「おわったよ」 */
export function advance(progress: Progress, preset: Preset | null, nowSec: number): Progress {
  if (!preset || progress.finished) return progress;
  const items = sortedItems(preset);
  if (items.length === 0) return progress;
  const idx = indexOfId(items, progress.itemId);
  if (idx === null) {
    // 予定の合間(まだ次が始まっていない)で押された場合は次の予定へ。次がなければ終了。
    const next = items.findIndex((it) => it.startMin * 60 > nowSec);
    if (next >= 0) return { ...progress, itemId: items[next].id, held: false };
    return { ...progress, itemId: null, finished: true };
  }
  if (idx + 1 < items.length) return { ...progress, itemId: items[idx + 1].id, held: false };
  return { ...progress, itemId: null, held: false, finished: true };
}

/** 戻る対象のindex(なければnull) */
export function previousIndex(progress: Progress, preset: Preset | null, nowSec: number): number | null {
  if (!preset) return null;
  const items = sortedItems(preset);
  if (items.length === 0) return null;
  if (progress.finished) return items.length - 1;
  const idx = indexOfId(items, progress.itemId);
  if (idx === null) {
    // 合間: 直前に終わった項目
    let prev: number | null = null;
    items.forEach((it, i) => {
      if (it.endMin * 60 <= nowSec) prev = i;
    });
    return prev;
  }
  return idx > 0 ? idx - 1 : null;
}

/** 「まだおわってなかった」。戻った項目は「おわったよ」を押すまで自動で進まない */
export function goBack(progress: Progress, preset: Preset | null, nowSec: number): Progress {
  const prev = previousIndex(progress, preset, nowSec);
  if (prev === null) return progress;
  const items = sortedItems(preset);
  return { ...progress, itemId: items[prev].id, held: true, finished: false };
}

export const LABEL_GAP = 'よていはないよ';
export const LABEL_DONE = 'おしまい';

/** 画面に出す内容。tick済みのprogressを渡すこと */
export function computeDisplay(progress: Progress, preset: Preset | null, activities: Activity[], nowSec: number): DisplayModel {
  const base: DisplayModel = {
    kind: 'none',
    name: LABEL_GAP,
    image: null,
    item: null,
    index: null,
    remainingSec: 0,
    remainingMin: 0,
    endMin: null,
    flashing: false,
    overtime: false,
    canGoBack: false,
    canFinish: false,
  };
  const items = sortedItems(preset);
  if (!preset || items.length === 0) return base;

  const canGoBack = previousIndex(progress, preset, nowSec) !== null;
  const idx = indexOfId(items, progress.itemId);

  if (progress.finished) return { ...base, kind: 'done', name: LABEL_DONE, canGoBack };

  if (idx === null) {
    const next = items.find((it) => it.startMin * 60 > nowSec);
    if (!next) return { ...base, kind: 'done', name: LABEL_DONE, canGoBack };
    const remainingSec = next.startMin * 60 - nowSec;
    return {
      ...base,
      kind: 'gap',
      remainingSec,
      remainingMin: remainingMinutesFromSec(remainingSec),
      endMin: next.startMin,
      canGoBack,
      canFinish: true,
    };
  }

  const item = items[idx];
  const activity = findActivity(activities, item.activityId);
  const display = item.kind === 'free' ? item.free : activity;
  const remainingSec = item.endMin * 60 - nowSec;
  const remainingMin = remainingMinutesFromSec(remainingSec);
  const flash = resolveFlash(item, activity);

  return {
    kind: 'item',
    name: display?.name ?? '',
    image: display,
    item,
    index: idx,
    remainingSec,
    remainingMin,
    endMin: item.endMin,
    flashing: flash.enabled && remainingSec > 0 && remainingMin <= flash.minutes,
    overtime: remainingSec <= 0,
    canGoBack,
    canFinish: true,
  };
}

/** 点滅の位相(0〜1)。時刻から直接計算するので、再描画や状態リセットで点滅が乱れない */
export const FLASH_PERIOD_MS = 3000;
export function flashPhase(nowMs: number): number {
  const t = (nowMs % FLASH_PERIOD_MS) / FLASH_PERIOD_MS;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
}
