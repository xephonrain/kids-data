import type { Activity, ScheduleItem } from '../types';
import { minutesToHHMM } from './time';
import { resolveFlash } from './schedule';

export interface Issue {
  level: 'error' | 'warning';
  itemId?: string;
  message: string;
}

const MAX_END = 1440;

/**
 * 時間割の入力チェック。
 * - 開始 < 終了 が必須(同じ時刻=長さ0分はエラー)
 * - 0:00〜24:00の範囲
 * - 重複はエラー(終了時刻と次の開始時刻が同じ=隣接はOK)
 * - 点滅開始が活動時間より長い場合は警告
 */
export function validateItems(items: ScheduleItem[], activities: Activity[]): Issue[] {
  const issues: Issue[] = [];
  const label = (it: ScheduleItem) => `${minutesToHHMM(it.startMin)}〜${minutesToHHMM(it.endMin)}`;

  for (const it of items) {
    if (!Number.isInteger(it.startMin) || !Number.isInteger(it.endMin) || it.startMin < 0 || it.endMin > MAX_END || it.startMin >= MAX_END) {
      issues.push({ level: 'error', itemId: it.id, message: `${label(it)}: 時刻が正しくありません(0:00〜24:00の範囲で指定してください)` });
      continue;
    }
    if (it.endMin === it.startMin) {
      issues.push({ level: 'error', itemId: it.id, message: `${label(it)}: 開始と終了が同じ時刻です(長さ0分の予定は登録できません)` });
    } else if (it.endMin < it.startMin) {
      issues.push({ level: 'error', itemId: it.id, message: `${label(it)}: 開始時刻が終了時刻より後になっています` });
    }
    if (it.kind === 'activity') {
      if (!it.activityId || !activities.some((a) => a.id === it.activityId)) {
        issues.push({ level: 'error', itemId: it.id, message: `${label(it)}: 活動が選択されていません(または削除されています)` });
      }
    } else if (!it.free || it.free.name.trim() === '') {
      issues.push({ level: 'error', itemId: it.id, message: `${label(it)}: 表示名が入力されていません` });
    }
    const act = it.activityId ? (activities.find((a) => a.id === it.activityId) ?? null) : null;
    const flash = resolveFlash(it, act);
    if (flash.enabled && it.endMin > it.startMin && flash.minutes > it.endMin - it.startMin) {
      issues.push({
        level: 'warning',
        itemId: it.id,
        message: `${label(it)}: 点滅開始(終了${flash.minutes}分前)が予定の長さ(${it.endMin - it.startMin}分)より長いため、最初から点滅します`,
      });
    }
  }

  const valid = items.filter((it) => it.endMin > it.startMin).sort((a, b) => a.startMin - b.startMin);
  for (let i = 0; i + 1 < valid.length; i++) {
    if (valid[i].endMin > valid[i + 1].startMin) {
      issues.push({
        level: 'error',
        itemId: valid[i + 1].id,
        message: `${label(valid[i])} と ${label(valid[i + 1])} の時間が重なっています`,
      });
    }
  }
  return issues;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.level === 'error');
}
