import type { ColorSetting } from '../types';

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgba(color: string, opacityPercent: number): string {
  const [r, g, b] = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(100, opacityPercent)) / 100})`;
}

export function css(c: ColorSetting): string {
  return rgba(c.color, c.opacity);
}

/** 2色を t (0〜1) で混ぜる。色と透明度の両方を補間する(点滅用) */
export function mixSetting(a: ColorSetting, b: ColorSetting, t: number): ColorSetting {
  const [ar, ag, ab] = hexToRgb(a.color);
  const [br, bg, bb] = hexToRgb(b.color);
  return {
    color: rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t),
    opacity: a.opacity + (b.opacity - a.opacity) * t,
  };
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 不透明度を考慮して白背景に合成した色 */
export function compositeOnWhite(c: ColorSetting): string {
  const [r, g, b] = hexToRgb(c.color);
  const a = c.opacity / 100;
  return rgbToHex(r * a + 255 * (1 - a), g * a + 255 * (1 - a), b * a + 255 * (1 - a));
}

/** WCAGのコントラスト比 */
export function contrastRatio(text: ColorSetting, bg: ColorSetting): number {
  const bgHex = compositeOnWhite(bg);
  // 文字色は背景の上に合成
  const [tr, tg, tb] = hexToRgb(text.color);
  const [br, bgG, bb] = hexToRgb(bgHex);
  const a = text.opacity / 100;
  const textHex = rgbToHex(tr * a + br * (1 - a), tg * a + bgG * (1 - a), tb * a + bb * (1 - a));
  const l1 = luminance(textHex);
  const l2 = luminance(bgHex);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
