import { describe, expect, it } from 'vitest';
import { buildBackup, parseBackup, planRestore, collectImagePaths } from '../src/data/backup';
import { defaultSettings } from '../src/defaults';
import { act, data, hm, item, ov, preset } from './helpers';

describe('バックアップ・復元', () => {
  const a = act('あさごはん', { imagePath: 'u/a.webp', version: 3 });
  const p = preset('P', [item('i1', hm(8), hm(9), a.id), item('i2', hm(9), hm(10), null)], 'auto', 'へいじつ');
  p.items[1].free!.imagePath = 'u/free.webp';
  const lock = { lockSalt: 'S', lockHash: 'H', lockIterations: 1 };
  const base = data({ activities: [a], presets: [{ ...p, version: 2 }], overrides: [ov('o1', '2026-10-17', '2026-10-17', 'P')], settings: { ...defaultSettings(), defaultPresetId: 'P', ...lock } });

  it('画像パスを収集できる', () => {
    expect(collectImagePaths(base).sort()).toEqual(['u/a.webp', 'u/free.webp']);
  });

  it('エクスポート → JSON → インポートで内容が一致し、ロック情報は含まれない', async () => {
    const { file, missingImages } = await buildBackup(base, async (path) => `data:image/webp;base64,${btoa(path)}`);
    expect(missingImages).toEqual([]);
    const text = JSON.stringify(file);
    expect(text).not.toContain('"lockHash":"H"');
    const parsed = parseBackup(text);
    expect(Object.keys(parsed.images)).toHaveLength(2);

    const map = { 'u/a.webp': 'new/a.webp', 'u/free.webp': 'new/free.webp' };
    const { data: restored, warnings } = planRestore(base, parsed, map, '2026-10-16T00:00:00Z');
    expect(warnings).toEqual([]);
    expect(restored.activities[0].imagePath).toBe('new/a.webp');
    expect(restored.presets[0].items[1].free!.imagePath).toBe('new/free.webp');
    expect(restored.presets[0].items).toHaveLength(2);
    expect(restored.settings.defaultPresetId).toBe('P');
    expect(restored.overrides).toHaveLength(1);
    // 同じIDの行は現在のバージョンを引き継ぐ → 競合せず上書きできる
    expect(restored.activities[0].version).toBe(3);
    expect(restored.presets[0].version).toBe(2);
    // ロックは現在の値を維持
    expect(restored.settings.lockHash).toBe('H');
  });

  it('別の環境(空)へ復元すると新規登録(version 0)になる', async () => {
    const { file } = await buildBackup(base, async () => 'data:image/webp;base64,AA==');
    const { data: restored } = planRestore(data(), parseBackup(JSON.stringify(file)), { 'u/a.webp': 'x', 'u/free.webp': 'y' }, 'now');
    expect(restored.activities[0].version).toBe(0);
    expect(restored.presets[0].version).toBe(0);
    expect(restored.settings.lockHash).toBeNull();
  });

  it('壊れたファイル・別形式のファイルを拒否する', () => {
    expect(() => parseBackup('not json')).toThrow();
    expect(() => parseBackup('{"format":"other"}')).toThrow('バックアップファイルではありません');
    expect(() => parseBackup(JSON.stringify({ format: 'kids-timer-backup', version: 99, data: {} }))).toThrow('新しい');
    expect(() => parseBackup(JSON.stringify({ format: 'kids-timer-backup', version: 1, data: { activities: [{ id: 1 }], presets: [], overrides: [] } }))).toThrow('壊れ');
  });

  it('参照が壊れていても整合性を保って復元する', async () => {
    const broken = data({ activities: [], presets: [preset('P', [item('i1', 0, 60, 'ghost')])], overrides: [ov('o', '2026-01-01', '2026-01-01', 'NOPE')], settings: { ...defaultSettings(), holidayPresetId: 'NOPE' } });
    const { file } = await buildBackup(broken, async () => null);
    const { data: restored, warnings } = planRestore(data(), parseBackup(JSON.stringify(file)), {}, 'now');
    expect(restored.presets[0].items).toHaveLength(0);
    expect(restored.overrides).toHaveLength(0);
    expect(restored.settings.holidayPresetId).toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('復元できなかった画像は警告する', async () => {
    const { file } = await buildBackup(base, async () => 'data:,x');
    const { warnings } = planRestore(base, parseBackup(JSON.stringify(file)), {}, 'now');
    expect(warnings.some((w) => w.includes('画像'))).toBe(true);
  });
});
