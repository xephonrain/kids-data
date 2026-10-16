import { describe, expect, it } from 'vitest';
import { setEnd, setStart, startFromNow } from '../src/lib/scheduleEdit';
import type { ScheduleItem } from '../src/types';

const mk = (id: string, s: number, e: number) => ({ id, startMin: s, endMin: e }) as unknown as ScheduleItem;
const base = () => [mk('a', 480, 540), mk('b', 540, 600), mk('c', 620, 660)];
const pos = (r: ScheduleItem[]) => r.map((i) => [i.id, i.startMin, i.endMin]);

describe('scheduleEdit', () => {
  it('終了を30分短くすると以降が30分早まる', () => {
    const r = setEnd(base(), 'a', 510);
    expect(pos(r.items)).toEqual([['a', 480, 510], ['b', 510, 570], ['c', 590, 630]]);
  });
  it('cascade off は次の開始まで', () => {
    const r = setEnd(base(), 'a', 600, false);
    expect(pos(r.items)[0]).toEqual(['a', 480, 540]);
  });
  it('最初の開始を変えると全体が動く', () => {
    const r = setStart(base(), 'a', 450);
    expect(pos(r.items)).toEqual([['a', 450, 510], ['b', 510, 570], ['c', 590, 630]]);
  });
  it('24:00を超えない', () => {
    const r = setEnd(base(), 'a', 1400);
    expect(Math.max(...r.items.map((i) => i.endMin))).toBe(1440);
  });
  it('今の時間から開始(長さ・すきまを維持)', () => {
    const r = startFromNow(base(), 600);
    expect(pos(r.items)).toEqual([['a', 600, 660], ['b', 660, 720], ['c', 740, 780]]);
  });
  it('長さ変更と24:00切り詰め', () => {
    const r = startFromNow(base(), 1400, { a: 30 });
    expect(r.items.length).toBeGreaterThan(0);
    expect(Math.max(...r.items.map((i) => i.endMin))).toBeLessThanOrEqual(1440);
  });
});
