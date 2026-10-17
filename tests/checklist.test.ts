import { describe, expect, it } from 'vitest';
import { activeSheets, checkedIds, currentItemId, emptyCheckDay, ensureCheckDay, isAllDone, nextStickerNumber, pickDifferent, pickSticker, stickerCounts, toggleCheck } from '../src/lib/checklist';
import { buildBackup, collectImagePaths, parseBackup, planRestore } from '../src/data/backup';
import { normalizeAppData } from '../src/data/localCache';
import { hashOf, isEmptyData } from '../src/data/githubSync';
import { data } from './helpers';
import type { Checksheet, Sticker, StickerGet } from '../src/types';

const sheet = (over: Partial<Checksheet> = {}): Checksheet => ({
  id: 's1',
  name: 'あさ',
  items: [
    { id: 'a', name: 'ごはん', activityId: null },
    { id: 'b', name: 'はみがき', activityId: null },
  ],
  startMin: 6 * 60 + 30,
  endMin: 8 * 60,
  weekdays: [],
  rewardEnabled: true,
  ...over,
});
const st = (id: string): Sticker => ({ id, imagePath: `local/${id}.webp`, name: '', createdAt: '2026-10-18T00:00:00Z' });
const get = (stickerId: string): StickerGet => ({ id: `g-${stickerId}-${Math.random()}`, stickerId, sheetId: 's1', dateKey: '2026-10-18', at: '2026-10-18T00:00:00Z' });

describe('activeSheets', () => {
  it('時間帯・曜日で絞る(終了時刻ちょうどは含まない)', () => {
    const s = sheet();
    expect(activeSheets([s], 1, 6 * 60 + 29)).toHaveLength(0);
    expect(activeSheets([s], 1, 6 * 60 + 30)).toHaveLength(1);
    expect(activeSheets([s], 1, 7 * 60 + 59)).toHaveLength(1);
    expect(activeSheets([s], 1, 8 * 60)).toHaveLength(0);
    const wk = sheet({ weekdays: [1, 2] });
    expect(activeSheets([wk], 0, 7 * 60)).toHaveLength(0);
    expect(activeSheets([wk], 2, 7 * 60)).toHaveLength(1);
  });
  it('項目が空のシートは出さない', () => {
    expect(activeSheets([sheet({ items: [] })], 1, 7 * 60)).toHaveLength(0);
  });
});

describe('チェックの進み方', () => {
  it('チェック→全部できた→外せる', () => {
    const s = sheet();
    let d = emptyCheckDay('2026-10-18');
    expect(currentItemId(d, s)).toBe('a');
    d = toggleCheck(d, s, 'a');
    expect(currentItemId(d, s)).toBe('b');
    expect(isAllDone(d, s)).toBe(false);
    d = toggleCheck(d, s, 'b');
    expect(isAllDone(d, s)).toBe(true);
    expect(currentItemId(d, s)).toBeNull();
    d = toggleCheck(d, s, 'a');
    expect(checkedIds(d, s)).toEqual(['b']);
    expect(isAllDone(d, s)).toBe(false);
  });
  it('削除された項目のチェックは数えない', () => {
    const s = sheet();
    const d = { ...emptyCheckDay('x'), checked: { s1: ['a', 'zzz'] } };
    expect(checkedIds(d, s)).toEqual(['a']);
  });
  it('日付が変わる/壊れた保存データは空に戻る', () => {
    expect(ensureCheckDay(emptyCheckDay('2026-10-17'), '2026-10-18').dateKey).toBe('2026-10-18');
    expect(ensureCheckDay({ dateKey: '2026-10-18' } as never, '2026-10-18').checked).toEqual({});
    expect(ensureCheckDay(null, '2026-10-18').reward).toEqual({});
  });
});

describe('ごほうびシールの選択', () => {
  it('シールが無ければ null', () => {
    expect(pickSticker([], [], 0.5)).toBeNull();
  });
  it('まだ持っていないシールを優先する', () => {
    const all = [st('a'), st('b'), st('c')];
    const log = [get('a'), get('b')];
    for (const r of [0, 0.3, 0.99]) expect(pickSticker(all, log, r)?.id).toBe('c');
  });
  it('全部持っていれば全体から選ぶ。rnd=0.999でも範囲内', () => {
    const all = [st('a'), st('b')];
    const log = [get('a'), get('b')];
    expect(pickSticker(all, log, 0.999)?.id).toBe('b');
    expect(pickSticker(all, log, 0)?.id).toBe('a');
  });
  it('枚数・回数の数え方', () => {
    const log = [get('a'), get('a'), get('b')];
    expect(nextStickerNumber(log)).toBe(4);
    const m = stickerCounts({ stickers: [st('a'), st('b')], stickerLog: log });
    expect(m.get('a')).toBe(2);
    expect(m.get('b')).toBe(1);
  });
});

describe('pickDifferent', () => {
  it('直前と同じ番号を選ばない(全パターン)', () => {
    for (let last = 0; last < 5; last++) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.9999]) {
        const v = pickDifferent(5, last, r);
        expect(v).not.toBe(last);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(5);
      }
    }
    expect(pickDifferent(1, 0, 0.5)).toBe(0);
  });
});

describe('データの保存・復元', () => {
  it('古いデータ(新フィールド無し)でも補完される', () => {
    const n = normalizeAppData({ activities: [], presets: [], overrides: [] } as never);
    expect(n.checksheets).toEqual([]);
    expect(n.stickers).toEqual([]);
    expect(n.stickerLog).toEqual([]);
  });
  it('シールだけあるデータは「空」ではない(初回接続で上書きされない)', () => {
    expect(isEmptyData(data())).toBe(true);
    expect(isEmptyData(data({ stickers: [st('a')] }))).toBe(false);
    expect(isEmptyData(data({ checksheets: [sheet()] }))).toBe(false);
  });
  it('ログの追加でハッシュが変わる(同期対象になる)', () => {
    const a = data({ stickers: [st('a')] });
    expect(hashOf(a)).not.toBe(hashOf({ ...a, stickerLog: [get('a')] }));
  });
  it('シール画像は画像収集に含まれる', () => {
    expect(collectImagePaths(data({ stickers: [st('a')] }))).toContain('local/a.webp');
  });
  it('バックアップ→復元でシール・シート・記録が戻り、存在しない参照は除かれる', async () => {
    const d = data({ checksheets: [sheet()], stickers: [st('a'), st('b')], stickerLog: [get('a')] });
    const { file } = await buildBackup(d, async (p) => `data:image/webp;base64,${p}`);
    const parsed = parseBackup(JSON.stringify(file));
    // b の画像だけ復元できなかった場合
    const { data: out, warnings } = planRestore(data(), parsed, { 'local/a.webp': 'local/new-a.webp' }, '2026-10-18T00:00:00Z');
    expect(out.checksheets).toHaveLength(1);
    expect(out.stickers.map((s) => s.imagePath)).toEqual(['local/new-a.webp']);
    expect(out.stickerLog).toHaveLength(1);
    expect(warnings.some((w) => w.includes('シール'))).toBe(true);
  });
  it('古いバックアップ(新フィールド無し)も復元できる', () => {
    const d = data();
    const old = { format: 'kids-timer-backup', version: 1, exportedAt: '', data: { activities: d.activities, presets: d.presets, overrides: d.overrides, theme: d.theme, settings: d.settings }, images: {} };
    const parsed = parseBackup(JSON.stringify(old));
    const { data: out } = planRestore(data(), parsed, {}, '2026-10-18T00:00:00Z');
    expect(out.checksheets).toEqual([]);
    expect(out.stickers).toEqual([]);
  });
});
