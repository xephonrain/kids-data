import { describe, expect, it } from 'vitest';
import { checkedIds, currentItemId, emptyCheckDay, ensureCheckDay, isAllDone, pickDifferent, toggleCheck } from '../src/lib/checklist';
import { PREFS, PREF_COUNT, mapState, nextGet } from '../src/lib/japan';
import { JAPAN_SHAPES } from '../src/data/japanMap';
import { buildBackup, collectImagePaths, parseBackup, planRestore } from '../src/data/backup';
import { normalizeAppData } from '../src/data/localCache';
import { hashOf, isEmptyData } from '../src/data/githubSync';
import { data } from './helpers';
import { defaultImageDisplay } from '../src/defaults';
import type { Checksheet, MapGet } from '../src/types';

const sheet = (over: Partial<Checksheet> = {}): Checksheet => ({ id: 's1', name: 'あさ', itemIds: ['a', 'b'], rewardEnabled: true, ...over });
const ci = (id: string, name: string, imagePath: string | null = null) => ({ ...defaultImageDisplay(), id, name, imagePath });
const logN = (n: number): MapGet[] => Array.from({ length: n }, (_, i) => ({ id: `g${i}`, prefCode: (i % 47) + 1, sheetId: 's1', dateKey: '2026-10-18', at: '2026-10-18T00:00:00Z' }));

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

describe('日本地図のデータ', () => {
  it('47県ぶん、コードは1〜47で重複なし、地図の形(パス)がすべてある', () => {
    expect(PREFS).toHaveLength(47);
    expect(PREFS.map((p) => p.code)).toEqual(Array.from({ length: 47 }, (_, i) => i + 1));
    expect(new Set(PREFS.map((p) => p.id)).size).toBe(47);
    for (const p of PREFS) {
      expect(JAPAN_SHAPES[p.id]?.path.length, p.id).toBeGreaterThan(50);
      expect(p.items.length, p.id).toBeGreaterThan(0);
      expect(p.feature.length, p.id).toBeGreaterThan(5);
      expect(p.kana, p.id).toMatch(/^[ぁ-ん]+$/);
    }
  });
  it('北海道から始まり、沖縄で終わる', () => {
    expect(PREFS[0].name).toBe('北海道');
    expect(PREFS[46].name).toBe('沖縄');
  });
});

describe('日本地図の進み方', () => {
  it('最初は白地図で、次は北海道', () => {
    const s = mapState([]);
    expect(s.filled).toEqual([]);
    expect(s.next.name).toBe('北海道');
    expect(s.round).toBe(1);
    expect(s.complete).toBe(false);
  });
  it('1回ごとに、コード順に1県ずつ増える', () => {
    const s = mapState(logN(3));
    expect(s.filled).toEqual([1, 2, 3]);
    expect(s.next.code).toBe(4);
    expect(nextGet(logN(3))).toBe(4);
  });
  it('47県そろうとコンプリート。次のごほうびで白にもどり2しゅうめの北海道', () => {
    const full = mapState(logN(47));
    expect(full.filled).toHaveLength(PREF_COUNT);
    expect(full.complete).toBe(true);
    expect(full.round).toBe(1);
    expect(full.next.code).toBe(1);
    const again = mapState(logN(48));
    expect(again.round).toBe(2);
    expect(again.filled).toEqual([1]);
    expect(again.complete).toBe(false);
    expect(again.next.code).toBe(2);
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
    expect(n.checkItems).toEqual([]);
    expect(n.mapLog).toEqual([]);
    expect(n.prefImages).toEqual({});
  });
  it('地図の記録だけあるデータは「空」ではない(初回接続で上書きされない)', () => {
    expect(isEmptyData(data())).toBe(true);
    expect(isEmptyData(data({ mapLog: logN(1) }))).toBe(false);
    expect(isEmptyData(data({ checksheets: [sheet()] }))).toBe(false);
    expect(isEmptyData(data({ checkItems: [ci('a', 'x')] }))).toBe(false);
    expect(isEmptyData(data({ prefImages: { tokyo: 'local/t.webp' } }))).toBe(false);
  });
  it('ぬった記録でハッシュが変わる(同期対象になる)', () => {
    const a = data();
    expect(hashOf(a)).not.toBe(hashOf({ ...a, mapLog: logN(1) }));
  });
  it('県の絵は画像収集に含まれる', () => {
    expect(collectImagePaths(data({ prefImages: { tokyo: 'local/t.webp' } }))).toContain('local/t.webp');
  });
  it('バックアップ→復元で、項目・リスト・記録・県の絵が戻り、復元できない画像は警告つきで外れる', async () => {
    const d = data({ checkItems: [ci('a', 'ごはん', 'local/a.webp'), ci('b', 'はみがき', 'local/b.webp')], checksheets: [sheet()], mapLog: logN(5), prefImages: { tokyo: 'local/t.webp', osaka: 'local/o.webp' } });
    const { file } = await buildBackup(d, async (p) => `data:image/webp;base64,${p}`);
    const parsed = parseBackup(JSON.stringify(file));
    const { data: out, warnings } = planRestore(data(), parsed, { 'local/a.webp': 'local/new-a.webp', 'local/t.webp': 'local/new-t.webp' }, '2026-10-18T00:00:00Z');
    expect(out.checkItems.map((i) => [i.name, i.imagePath])).toEqual([['ごはん', 'local/new-a.webp'], ['はみがき', null]]);
    expect(out.checksheets[0].itemIds).toEqual(['a', 'b']);
    expect(out.mapLog).toHaveLength(5);
    expect(out.prefImages).toEqual({ tokyo: 'local/new-t.webp' });
    expect(warnings.some((w) => w.includes('県の絵'))).toBe(true);
    expect(warnings.some((w) => w.includes('はみがき'))).toBe(true);
  });
  it('古いバックアップ(新フィールド無し)も復元できる', () => {
    const d = data();
    const old = { format: 'kids-timer-backup', version: 1, exportedAt: '', data: { activities: d.activities, presets: d.presets, overrides: d.overrides, theme: d.theme, settings: d.settings }, images: {} };
    const parsed = parseBackup(JSON.stringify(old));
    const { data: out } = planRestore(data(), parsed, {}, '2026-10-18T00:00:00Z');
    expect(out.checksheets).toEqual([]);
    expect(out.checkItems).toEqual([]);
    expect(out.mapLog).toEqual([]);
    expect(out.prefImages).toEqual({});
  });
});

describe('以前の形式のチェックシートからの移行', () => {
  const legacy = {
    activities: [{ ...defaultImageDisplay(), id: 'act1', name: 'はみがき', imagePath: 'local/act1.webp', scale: 1.4 }],
    presets: [],
    overrides: [],
    checksheets: [
      {
        id: 's1',
        name: 'あさ',
        items: [
          { id: 'i1', name: 'はみがき', activityId: 'act1' },
          { id: 'i2', name: 'もちもの', activityId: null },
        ],
        startMin: 360,
        endMin: 540,
        weekdays: [1],
        rewardEnabled: false,
      },
    ],
  };
  it('項目を「チェック項目」に切り出し、時間帯・曜日は捨てる。活動の画像設定は引き継ぐ', () => {
    const n = normalizeAppData(legacy as never);
    expect(n.checksheets).toEqual([{ id: 's1', name: 'あさ', itemIds: ['i1', 'i2'], rewardEnabled: false }]);
    expect(n.checkItems.map((i) => i.name)).toEqual(['はみがき', 'もちもの']);
    expect(n.checkItems[0].imagePath).toBe('local/act1.webp');
    expect(n.checkItems[0].scale).toBe(1.4);
    expect(n.checkItems[1].imagePath).toBeNull();
  });
  it('2回正規化しても同じ(冪等)', () => {
    const once = normalizeAppData(legacy as never);
    expect(normalizeAppData(once)).toEqual(once);
  });
  it('古い形式のバックアップも取り込める', () => {
    const d = data();
    const old = { format: 'kids-timer-backup', version: 1, exportedAt: '', data: { ...legacy, theme: d.theme, settings: d.settings }, images: {} };
    const { data: out } = planRestore(data(), parseBackup(JSON.stringify(old)), { 'local/act1.webp': 'local/new.webp' }, '2026-10-18T00:00:00Z');
    expect(out.checkItems).toHaveLength(2);
    expect(out.checksheets[0].itemIds).toEqual(['i1', 'i2']);
    expect(out.checkItems[0].imagePath).toBe('local/new.webp');
  });
});
