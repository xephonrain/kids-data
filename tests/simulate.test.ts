import { describe, expect, it } from 'vitest';
import { nextEventSec, prevEventSec, simEvents } from '../src/lib/simulate';
import type { Activity, Preset } from '../src/types';

const acts = [{ id: 'a', name: 'ごはん', flashEnabled: true, flashMinutes: 5 }] as unknown as Activity[];
const preset = {
  id: 'p', name: 'p', defaultSwitchMode: 'auto',
  items: [
    { id: 'i1', startMin: 420, endMin: 450, kind: 'activity', activityId: 'a', free: null, flash: 'inherit', flashMinutes: null, switchMode: 'inherit' },
    { id: 'i2', startMin: 450, endMin: 480, kind: 'free', activityId: null, free: { name: 'あそぶ' }, flash: 'off', flashMinutes: null, switchMode: 'inherit' },
  ],
} as unknown as Preset;

describe('simulate', () => {
  const ev = simEvents(preset, acts);
  it('開始・点滅開始・終了を時刻順に並べる', () => {
    expect(ev.map((e) => [e.sec / 60, e.kind])).toEqual([[420, 'start'], [445, 'flash'], [450, 'end'], [450, 'start'], [480, 'end']]);
  });
  it('次・前のできごと', () => {
    expect(nextEventSec(ev, 420 * 60)).toBe(445 * 60);
    expect(nextEventSec(ev, 480 * 60)).toBeNull();
    expect(prevEventSec(ev, 445 * 60)).toBe(420 * 60);
    expect(prevEventSec(ev, 420 * 60)).toBeNull();
  });
});
