import { describe, expect, it } from 'vitest';
import { holidayName, isHoliday } from '../src/lib/holidays';
import { expiredOverrides, findOverrideConflicts, resolvePreset, withDayOverride } from '../src/lib/presetResolver';
import { advance, computeDisplay, ensureProgress, flashPhase, freshProgress, goBack, tick } from '../src/lib/schedule';
import { validateItems, hasErrors } from '../src/lib/validate';
import { addDays, fillSector, formatClockKana, hhmmToMinutes, hourHandAngle, minuteHandAngle, minutesToHHMM, remainingMinutesFromSec, weekdayOf } from '../src/lib/time';
import { contrastRatio, mixSetting } from '../src/lib/color';
import { createLock, verifyLock } from '../src/lib/lock';
import { CONTRAST_PAIRS, DEFAULT_COLORS, defaultSettings } from '../src/defaults';
import { act, data, hm, item, ov, preset, sec } from './helpers';
import type { Progress } from '../src/types';

describe('時計', () => {
  it('現在時刻が「○じ○ふん」で表示される', () => {
    expect(formatClockKana(new Date(2026, 9, 16, 8, 15))).toBe('8じ15ふん');
    expect(formatClockKana(new Date(2026, 9, 16, 0, 5))).toBe('12じ5ふん');
    expect(formatClockKana(new Date(2026, 9, 16, 15, 0))).toBe('3じ0ふん');
  });

  it('時針・分針の角度', () => {
    expect(hourHandAngle(new Date(2026, 0, 1, 3, 0, 0))).toBeCloseTo(90);
    expect(hourHandAngle(new Date(2026, 0, 1, 15, 30, 0))).toBeCloseTo(105);
    expect(minuteHandAngle(new Date(2026, 0, 1, 3, 30, 0))).toBeCloseTo(180);
    expect(minuteHandAngle(new Date(2026, 0, 1, 3, 15, 30))).toBeCloseTo(93);
  });

  it('塗りつぶしの終点は赤い針(終了時刻の分針位置)と一致する', () => {
    // 3:00 → 3:30 : 12時の位置から6時の位置まで180度
    const s = fillSector(sec(3, 0), hm(3, 30));
    expect(s.startAngle).toBeCloseTo(0);
    expect(s.sweep).toBeCloseTo(180);
    expect((s.startAngle + s.sweep) % 360).toBeCloseTo(s.endAngle);
  });

  it('12時をまたぐ場合・午前午後をまたぐ場合も終点が一致する', () => {
    for (const [now, end] of [
      [sec(11, 50), hm(12, 20)],
      [sec(11, 55, 30), hm(12, 5)],
      [sec(23, 40), hm(24, 0)],
      [sec(0, 10), hm(0, 50)],
    ] as const) {
      const s = fillSector(now, end);
      expect((s.startAngle + s.sweep + 360) % 360).toBeCloseTo(s.endAngle, 5);
    }
  });

  it('残りが60分を超えるときは全周まで', () => {
    expect(fillSector(sec(9, 0), hm(11, 0)).sweep).toBe(360);
  });

  it('残り時間に応じて塗りつぶしが小さくなる', () => {
    const a = fillSector(sec(9, 0), hm(9, 30)).sweep;
    const b = fillSector(sec(9, 10), hm(9, 30)).sweep;
    expect(b).toBeLessThan(a);
  });

  it('残り分は切り上げで統一', () => {
    expect(remainingMinutesFromSec(600)).toBe(10);
    expect(remainingMinutesFromSec(599)).toBe(10);
    expect(remainingMinutesFromSec(541)).toBe(10);
    expect(remainingMinutesFromSec(540)).toBe(9);
    expect(remainingMinutesFromSec(1)).toBe(1);
    expect(remainingMinutesFromSec(0)).toBe(0);
    expect(remainingMinutesFromSec(-30)).toBe(0);
  });

  it('時刻文字列の変換', () => {
    expect(hhmmToMinutes('08:05')).toBe(485);
    expect(hhmmToMinutes('24:00')).toBe(1440);
    expect(hhmmToMinutes('25:00')).toBeNull();
    expect(hhmmToMinutes('abc')).toBeNull();
    expect(minutesToHHMM(485)).toBe('08:05');
  });
});

describe('日付', () => {
  it('年またぎ・うるう年', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(weekdayOf('2026-10-16')).toBe(5);
  });
});

describe('日本の祝日', () => {
  it('主な祝日', () => {
    expect(holidayName('2026-01-01')).toBe('元日');
    expect(holidayName('2026-01-12')).toBe('成人の日');
    expect(holidayName('2026-03-20')).toBe('春分の日');
    expect(holidayName('2026-07-20')).toBe('海の日');
    expect(holidayName('2026-10-12')).toBe('スポーツの日');
    expect(holidayName('2026-11-23')).toBe('勤労感謝の日');
    expect(isHoliday('2026-10-16')).toBe(false);
  });
  it('振替休日・国民の休日', () => {
    expect(holidayName('2026-05-06')).toBe('振替休日'); // 5/3が日曜
    expect(holidayName('2026-09-22')).toBe('国民の休日'); // 敬老の日と秋分の日の間
    expect(holidayName('2026-09-23')).toBe('秋分の日');
  });
  it('東京五輪の特例(2021)', () => {
    expect(holidayName('2021-07-22')).toBe('海の日');
    expect(holidayName('2021-07-23')).toBe('スポーツの日');
    expect(holidayName('2021-08-08')).toBe('山の日');
    expect(holidayName('2021-08-09')).toBe('振替休日');
  });
  it('天皇誕生日は2020年から2/23', () => {
    expect(holidayName('2024-02-23')).toBe('天皇誕生日');
    expect(holidayName('2019-02-23')).toBeNull(); // 2019年は祝日ではない(上皇の時代の名残なし)
    expect(holidayName('2025-02-23')).toBe('天皇誕生日');
    expect(holidayName('2025-02-24')).toBe('振替休日'); // 日曜のため
  });
});

describe('プリセットの決定', () => {
  const A = preset('A', []);
  const B = preset('B', []);
  const C = preset('C', []);
  const D = preset('D', []);
  const settings = { ...defaultSettings(), defaultPresetId: 'D', holidayPresetId: 'C', weekdayPresets: ['B', 'A', 'A', 'A', 'A', 'A', 'B'] as (string | null)[] };
  const base = data({ presets: [A, B, C, D], settings });

  it('曜日ごとの設定が反映される', () => {
    expect(resolvePreset('2026-10-16', base)).toMatchObject({ presetId: 'A', source: 'weekday' }); // 金
    expect(resolvePreset('2026-10-17', base)).toMatchObject({ presetId: 'B', source: 'weekday' }); // 土
  });
  it('祝日用プリセットが曜日より優先される', () => {
    expect(resolvePreset('2026-10-12', base)).toMatchObject({ presetId: 'C', source: 'holiday' }); // 月曜の祝日
  });
  it('明日限定の変更が最優先', () => {
    const d = data({ presets: [A, B, C, D], settings, overrides: [ov('o1', '2026-10-12', '2026-10-12', 'B')] });
    expect(resolvePreset('2026-10-12', d)).toMatchObject({ presetId: 'B', source: 'override' });
  });
  it('臨時変更は指定日だけで、翌日には残らない', () => {
    const d = data({ presets: [A, B, C, D], settings, overrides: [ov('o1', '2026-10-16', '2026-10-16', 'B')] });
    expect(resolvePreset('2026-10-16', d).presetId).toBe('B');
    expect(resolvePreset('2026-10-17', d)).toMatchObject({ presetId: 'B', source: 'weekday' });
    expect(resolvePreset('2026-10-19', d)).toMatchObject({ presetId: 'A', source: 'weekday' });
  });
  it('どれも無ければデフォルト、それも無ければ none', () => {
    const d = data({ presets: [A, D], settings: { ...defaultSettings(), defaultPresetId: 'D' } });
    expect(resolvePreset('2026-10-16', d)).toMatchObject({ presetId: 'D', source: 'default' });
    expect(resolvePreset('2026-10-16', data({ presets: [A] })).source).toBe('none');
  });
  it('存在しないプリセットを指す設定は無視して次の優先度へ', () => {
    const d = data({ presets: [A, D], settings: { ...settings, weekdayPresets: ['X', 'X', 'X', 'X', 'X', 'X', 'X'] }, overrides: [ov('o', '2026-10-16', '2026-10-16', 'GONE')] });
    expect(resolvePreset('2026-10-16', d)).toMatchObject({ presetId: 'D', source: 'default' });
  });
  it('同じ優先度の臨時変更が競合したら、新しい方を採用して競合を報告する', () => {
    const o1 = ov('o1', '2026-10-16', '2026-10-18', 'A', '2026-10-01T00:00:00Z');
    const o2 = ov('o2', '2026-10-16', '2026-10-16', 'B', '2026-10-05T00:00:00Z');
    const r = resolvePreset('2026-10-16', data({ presets: [A, B], overrides: [o1, o2] }));
    expect(r.presetId).toBe('B');
    expect(r.conflicts.map((c) => c.id)).toEqual(['o1']);
    expect(findOverrideConflicts([o1, o2])).toHaveLength(1);
    expect(findOverrideConflicts([o1, ov('o3', '2026-10-20', '2026-10-21', 'B')])).toHaveLength(0);
  });
});

describe('今日だけ・明日だけの変更', () => {
  const A = preset('A', []);
  const B = preset('B', []);
  const settings = { ...defaultSettings(), defaultPresetId: 'A', weekdayPresets: ['A', 'A', 'A', 'A', 'A', 'A', 'A'] as (string | null)[] };
  it('明日だけ別のプリセットにでき、通常の設定は変わらない', () => {
    const o = withDayOverride([], 'tomorrow', '2026-10-17', 'B', 'n1', '2026-10-16T00:00:00Z');
    const d = data({ presets: [A, B], settings, overrides: o });
    expect(resolvePreset('2026-10-17', d)).toMatchObject({ presetId: 'B', source: 'override' });
    expect(resolvePreset('2026-10-18', d)).toMatchObject({ presetId: 'A', source: 'weekday' });
    expect(resolvePreset('2026-10-16', d)).toMatchObject({ presetId: 'A', source: 'weekday' });
    expect(d.settings).toBe(settings);
  });
  it('同じ日の変更は置き換わり、nullで解除できる', () => {
    let o = withDayOverride([], 'tomorrow', '2026-10-17', 'B', 'n1', 't');
    o = withDayOverride(o, 'tomorrow', '2026-10-17', 'A', 'n2', 't');
    expect(o).toHaveLength(1);
    expect(o[0].presetId).toBe('A');
    expect(withDayOverride(o, 'tomorrow', '2026-10-17', null, 'x', 't')).toHaveLength(0);
  });
  it('期限切れ(昨日以前)の変更を見つけられる', () => {
    const o = [ov('o1', '2026-10-15', '2026-10-15', 'B'), ov('o2', '2026-10-16', '2026-10-16', 'B')];
    expect(expiredOverrides(o, '2026-10-16').map((x) => x.id)).toEqual(['o1']);
  });
});

describe('予定切り替え', () => {
  const activities = [act('あさごはん'), act('はみがき'), act('おでかけ')];
  const items = [item('i1', hm(8), hm(8, 30), 'act-あさごはん'), item('i2', hm(8, 30), hm(8, 45), 'act-はみがき'), item('i3', hm(9), hm(10), 'act-おでかけ')];
  const auto = preset('P', items, 'auto');
  const fresh = () => freshProgress('2026-10-16', 'P');
  const at = (p: Progress, s: number, pr = auto) => tick(p, pr, activities, s);
  const view = (p: Progress, s: number, pr = auto) => computeDisplay(at(p, s, pr), pr, activities, s);

  it('時刻に応じて表示が決まり、残り時間が計算される', () => {
    const v = view(fresh(), sec(8, 20));
    expect(v.name).toBe('あさごはん');
    expect(v.remainingMin).toBe(10);
    expect(v.endMin).toBe(hm(8, 30));
  });

  it('終了時刻に自動で次の活動へ移る', () => {
    expect(view(fresh(), sec(8, 29, 59)).name).toBe('あさごはん');
    expect(view(fresh(), sec(8, 30)).name).toBe('はみがき');
  });

  it('同じ活動が何度も切り替わらない(冪等)', () => {
    let p = at(fresh(), sec(8, 10));
    const p2 = at(p, sec(8, 10));
    expect(p2).toBe(p);
    p = at(p, sec(8, 31));
    expect(at(p, sec(8, 31))).toBe(p);
    expect(at(p, sec(8, 32))).toBe(p);
  });

  it('予定の合間は「よていはないよ」、次の開始までを表示', () => {
    const v = view(fresh(), sec(8, 50));
    expect(v.kind).toBe('gap');
    expect(v.name).toBe('よていはないよ');
    expect(v.remainingMin).toBe(10);
    expect(v.endMin).toBe(hm(9));
  });

  it('最後の予定が終わったら done', () => {
    expect(view(fresh(), sec(10, 1)).kind).toBe('done');
  });

  it('手動切り替え方式では終了時刻を過ぎても自動で進まない', () => {
    const manual = preset('P', items, 'manual');
    let p = at(fresh(), sec(8, 10), manual);
    p = at(p, sec(8, 40), manual);
    const v = computeDisplay(p, manual, activities, sec(8, 40));
    expect(v.name).toBe('あさごはん');
    expect(v.overtime).toBe(true);
    expect(v.remainingMin).toBe(0);
    expect(v.flashing).toBe(false);
  });

  it('「おわったよ」で早めに次へ進める', () => {
    let p = at(fresh(), sec(8, 10));
    p = advance(p, auto, sec(8, 10));
    p = at(p, sec(8, 10));
    const v = computeDisplay(p, auto, activities, sec(8, 10));
    expect(v.name).toBe('はみがき');
    expect(v.remainingMin).toBe(35); // 8:45まで
  });

  it('手動切り替え: おわったよで次へ、そのあとは時刻どおり', () => {
    const manual = preset('P', items, 'manual');
    let p = at(fresh(), sec(8, 10), manual);
    p = at(p, sec(8, 40), manual); // 8:30を過ぎても あさごはん のまま
    expect(computeDisplay(p, manual, activities, sec(8, 40)).name).toBe('あさごはん');
    p = at(advance(p, manual, sec(8, 40)), sec(8, 40), manual);
    expect(computeDisplay(p, manual, activities, sec(8, 40)).name).toBe('はみがき');
  });

  it('活動ごとの切り替え方式がプリセットの初期値より優先される', () => {
    const acts = [act('あさごはん', { switchMode: 'manual' }), act('はみがき'), act('おでかけ')];
    const p0 = at(fresh(), sec(8, 10));
    const p1 = tick(p0, auto, acts, sec(8, 40));
    expect(computeDisplay(p1, auto, acts, sec(8, 40)).name).toBe('あさごはん');
    // 時間割項目の個別指定はさらに優先
    const it2 = [item('i1', hm(8), hm(8, 30), 'act-あさごはん', { switchMode: 'auto' }), ...items.slice(1)];
    const pr2 = preset('P', it2, 'auto');
    const q = tick(tick(fresh(), pr2, acts, sec(8, 10)), pr2, acts, sec(8, 40));
    expect(computeDisplay(q, pr2, acts, sec(8, 40)).name).toBe('はみがき');
  });

  it('二重タップしても2つ進まない', () => {
    // 同一操作を連続で呼ぶのではなく、UI側でdebounceする。ここでは1操作=1項目のみ進むことを確認
    let p = at(fresh(), sec(8, 10));
    p = advance(p, auto, sec(8, 10));
    expect(p.itemId).toBe('i2');
  });

  it('最後の項目で「おわったよ」→ finished、さらに押しても不正な遷移なし', () => {
    let p = at(fresh(), sec(9, 10));
    p = advance(p, auto, sec(9, 10));
    expect(p.finished).toBe(true);
    expect(advance(p, auto, sec(9, 10))).toBe(p);
    expect(computeDisplay(p, auto, activities, sec(9, 10)).kind).toBe('done');
  });

  it('予定の合間で「おわったよ」→次の予定へ', () => {
    let p = at(fresh(), sec(8, 50));
    p = at(advance(p, auto, sec(8, 50)), sec(8, 50));
    expect(computeDisplay(p, auto, activities, sec(8, 50)).name).toBe('おでかけ');
  });

  it('「まだおわってなかった」で一つ前に戻れる。戻った活動は自動で進まない', () => {
    let p = at(fresh(), sec(8, 40)); // はみがき
    p = goBack(p, auto, sec(8, 40));
    p = at(p, sec(8, 40));
    const v = computeDisplay(p, auto, activities, sec(8, 40));
    expect(v.name).toBe('あさごはん');
    expect(v.overtime).toBe(true);
    expect(v.remainingMin).toBe(0);
    // さらに時間が経っても戻ったまま
    expect(computeDisplay(at(p, sec(8, 44)), auto, activities, sec(8, 44)).name).toBe('あさごはん');
    // おわったよで進める
    const n = at(advance(p, auto, sec(8, 44)), sec(8, 44));
    expect(computeDisplay(n, auto, activities, sec(8, 44)).name).toBe('はみがき');
  });

  it('最初の活動では戻れない(誤動作しない)', () => {
    const p = at(fresh(), sec(8, 10));
    const v = computeDisplay(p, auto, activities, sec(8, 10));
    expect(v.canGoBack).toBe(false);
    expect(goBack(p, auto, sec(8, 10))).toBe(p);
  });

  it('予定の合間・終了後からも戻れる', () => {
    const gap = at(fresh(), sec(8, 50));
    expect(computeDisplay(goBack(gap, auto, sec(8, 50)), auto, activities, sec(8, 50)).name).toBe('はみがき');
    const done = at(fresh(), sec(10, 5));
    expect(computeDisplay(goBack(done, auto, sec(10, 5)), auto, activities, sec(10, 5)).name).toBe('おでかけ');
  });

  it('戻ってもプリセット(時間割)自体は変わらない', () => {
    const before = JSON.stringify(auto);
    goBack(at(fresh(), sec(8, 40)), auto, sec(8, 40));
    expect(JSON.stringify(auto)).toBe(before);
  });

  it('日付かプリセットが変わると進行状況はリセットされる', () => {
    const p = advance(at(fresh(), sec(8, 10)), auto, sec(8, 10));
    expect(ensureProgress(p, '2026-10-17', 'P').itemId).toBeNull();
    expect(ensureProgress(p, '2026-10-16', 'Q').itemId).toBeNull();
    expect(ensureProgress(p, '2026-10-16', 'P')).toBe(p);
  });

  it('今日の途中でプリセットを変えても、終了済みの活動は再実行されない', () => {
    const other = preset('Q', [item('q1', hm(7), hm(8), 'act-あさごはん'), item('q2', hm(8), hm(12), 'act-おでかけ')]);
    const p = ensureProgress(at(fresh(), sec(8, 20)), '2026-10-16', 'Q');
    const v = computeDisplay(tick(p, other, activities, sec(8, 20)), other, activities, sec(8, 20));
    expect(v.name).toBe('おでかけ');
  });

  it('スリープ復帰など時刻が大きく飛んでも、正しい状態に追従する', () => {
    let p = at(fresh(), sec(8, 10));
    p = at(p, sec(9, 30)); // 一気に1時間以上経過
    expect(computeDisplay(p, auto, activities, sec(9, 30)).name).toBe('おでかけ');
  });

  it('時間割の編集で項目が消えても壊れない', () => {
    const p: Progress = { ...fresh(), itemId: 'gone' };
    expect(() => computeDisplay(at(p, sec(8, 10)), auto, activities, sec(8, 10))).not.toThrow();
    expect(view(p, sec(8, 10)).name).toBe('あさごはん');
  });

  it('予定が空のプリセットは none', () => {
    const empty = preset('E', []);
    expect(computeDisplay(freshProgress('d', 'E'), empty, activities, sec(9)).kind).toBe('none');
  });

  it('設定外の表示(自由表示)を時間割に置ける', () => {
    const pr = preset('F', [item('f1', hm(9), hm(10), null)]);
    const v = computeDisplay(tick(freshProgress('d', 'F'), pr, [], sec(9, 5)), pr, [], sec(9, 5));
    expect(v.name).toBe('じゆうじかん');
    expect(v.kind).toBe('item');
  });
});

describe('点滅', () => {
  const flashAct = act('あさごはん', { flashEnabled: true, flashMinutes: 5 });
  const plain = act('はみがき'); // 初期値は点滅オフ
  const items = [item('i1', hm(8), hm(8, 30), flashAct.id), item('i2', hm(8, 30), hm(9), plain.id), item('i3', hm(9), hm(9, 30), plain.id, { flash: 'on', flashMinutes: 10 })];
  const pr = preset('P', items);
  const acts = [flashAct, plain];
  const v = (s: number) => computeDisplay(tick(freshProgress('d', 'P'), pr, acts, s), pr, acts, s);

  it('初期値は点滅オフ', () => {
    expect(act('x').flashEnabled).toBe(false);
    expect(v(sec(8, 59)).flashing).toBe(false);
  });
  it('設定した残り時間から点滅する', () => {
    expect(v(sec(8, 24)).flashing).toBe(false); // 残り6分
    expect(v(sec(8, 25)).flashing).toBe(true); // 残り5分
    expect(v(sec(8, 29, 30)).flashing).toBe(true);
  });
  it('終了時刻を過ぎたら点滅しない', () => {
    const manual = preset('P', items, 'manual');
    const x = computeDisplay(tick(freshProgress('d', 'P'), manual, acts, sec(8, 40)), manual, acts, sec(8, 40));
    expect(x.flashing).toBe(false);
  });
  it('時間割項目の点滅設定が活動の設定より優先される', () => {
    expect(v(sec(9, 19)).flashing).toBe(false);
    expect(v(sec(9, 20)).flashing).toBe(true);
  });
  it('次の活動に移ると点滅状態がリセットされる', () => {
    expect(v(sec(8, 29)).flashing).toBe(true);
    expect(v(sec(8, 30)).flashing).toBe(false);
  });
  it('点滅条件は画面更新(再計算)のたびにリセットされない', () => {
    for (let i = 0; i < 5; i++) expect(v(sec(8, 27)).flashing).toBe(true);
  });
  it('点滅は時刻から決まる緩やかな周期(0〜1)', () => {
    const vals = [0, 500, 1000, 1500, 2000, 2500, 3000].map(flashPhase);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...vals)).toBeLessThanOrEqual(1);
    expect(flashPhase(0)).toBeCloseTo(0);
    expect(flashPhase(1500)).toBeCloseTo(1);
    expect(flashPhase(3000)).toBeCloseTo(flashPhase(0));
  });
});

describe('入力チェック', () => {
  const a = act('a');
  it('開始が終了より後ならエラー', () => {
    expect(hasErrors(validateItems([item('1', hm(9), hm(8), a.id)], [a]))).toBe(true);
  });
  it('開始と終了が同じならエラー', () => {
    const r = validateItems([item('1', hm(9), hm(9), a.id)], [a]);
    expect(r.some((i) => i.message.includes('同じ時刻'))).toBe(true);
  });
  it('重複を検出、隣接はOK', () => {
    expect(hasErrors(validateItems([item('1', hm(8), hm(9), a.id), item('2', hm(8, 30), hm(10), a.id)], [a]))).toBe(true);
    expect(hasErrors(validateItems([item('1', hm(8), hm(9), a.id), item('2', hm(9), hm(10), a.id)], [a]))).toBe(false);
  });
  it('範囲外の時刻はエラー', () => {
    expect(hasErrors(validateItems([item('1', -5, 60, a.id)], [a]))).toBe(true);
    expect(hasErrors(validateItems([item('1', 60, 1500, a.id)], [a]))).toBe(true);
    expect(hasErrors(validateItems([item('1', 60.5, 120, a.id)], [a]))).toBe(true);
  });
  it('点滅開始が活動時間を超える場合は警告', () => {
    const f = act('f', { flashEnabled: true, flashMinutes: 30 });
    const r = validateItems([item('1', hm(9), hm(9, 10), f.id)], [f]);
    expect(r.some((i) => i.level === 'warning')).toBe(true);
    expect(hasErrors(r)).toBe(false);
  });
  it('存在しない活動・名前のない自由表示はエラー', () => {
    expect(hasErrors(validateItems([item('1', hm(9), hm(10), 'ghost')], [a]))).toBe(true);
    const free = item('2', hm(9), hm(10), null);
    free.free!.name = ' ';
    expect(hasErrors(validateItems([free], []))).toBe(true);
  });
});

describe('配色', () => {
  it('色の補間(点滅時の連動)', () => {
    const m = mixSetting({ color: '#000000', opacity: 0 }, { color: '#ffffff', opacity: 100 }, 0.5);
    expect(m.color).toBe('#808080');
    expect(m.opacity).toBe(50);
  });
  it('コントラスト比', () => {
    expect(contrastRatio({ color: '#000000', opacity: 100 }, { color: '#ffffff', opacity: 100 })).toBeCloseTo(21, 0);
    expect(contrastRatio({ color: '#ffffff', opacity: 100 }, { color: '#ffffff', opacity: 100 })).toBeCloseTo(1, 1);
  });
});

describe('初期配色の読みやすさ', () => {
  it('文字と背景の組み合わせがすべてコントラスト比4.5以上', () => {
    for (const p of CONTRAST_PAIRS) for (const b of p.bg) expect(contrastRatio(DEFAULT_COLORS[p.text], DEFAULT_COLORS[b]), `${p.label} / ${b}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('ロック', () => {
  it('ハッシュ化され、正しいパスワードだけ通る(平文は保存されない)', async () => {
    const rec = await createLock('ひみつ1234');
    expect(JSON.stringify(rec)).not.toContain('ひみつ1234');
    expect(await verifyLock('ひみつ1234', rec)).toBe(true);
    expect(await verifyLock('ひみつ1235', rec)).toBe(false);
    expect(await verifyLock('', rec)).toBe(false);
  });
  it('同じパスワードでもソルトが違えばハッシュも違う', async () => {
    const a = await createLock('same-pass');
    const b = await createLock('same-pass');
    expect(a.lockHash).not.toBe(b.lockHash);
  });
  it('未設定なら常に不一致', async () => {
    expect(await verifyLock('x', { lockSalt: null, lockHash: null, lockIterations: null })).toBe(false);
  });
});
