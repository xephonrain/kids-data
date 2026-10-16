import { css } from '../lib/color';
import { fillSector, hourHandAngle, minuteHandAngle, secondsOfDay } from '../lib/time';
import type { ColorSetting, ThemeColors } from '../types';

interface Props {
  now: Date;
  colors: ThemeColors;
  /** 活動の終了時刻(0:00からの分)。nullなら赤い針・塗りつぶしなし */
  endMin: number | null;
  /** 点滅中の塗りつぶし色(通常色との補間済み) */
  fill: ColorSetting;
}

const R = 96;

function pt(angleDeg: number, r: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
}

function sectorPath(startAngle: number, sweep: number, r: number): string {
  if (sweep <= 0.01) return '';
  if (sweep >= 359.99) {
    return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`;
  }
  const [x1, y1] = pt(startAngle, r);
  const [x2, y2] = pt(startAngle + sweep, r);
  const large = sweep > 180 ? 1 : 0;
  return `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

export function AnalogClock({ now, colors, endMin, fill }: Props) {
  const nowSec = secondsOfDay(now);
  const sector = endMin !== null ? fillSector(nowSec, endMin) : null;
  const hourA = hourHandAngle(now);
  const minA = minuteHandAngle(now);

  const ticks = Array.from({ length: 60 }, (_, i) => i);
  const nums = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <svg viewBox="-104 -104 208 208" role="img" aria-label="アナログ時計" style={{ width: '100%', height: '100%', display: 'block' }}>
      {/* 文字盤と縁 */}
      <circle r={R} fill={css(colors.clockFace)} />
      {/* 現在の分の位置から終了時刻までの扇形(残りが減ると小さくなる) */}
      {sector && <path d={sectorPath(sector.startAngle, sector.sweep, R - 3)} fill={css(fill)} />}
      <circle r={R} fill="none" stroke={css(colors.clockRim)} strokeWidth={6} />
      {ticks.map((i) => {
        const major = i % 5 === 0;
        const [x1, y1] = pt(i * 6, R - 4);
        const [x2, y2] = pt(i * 6, R - (major ? 11 : 7));
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={css(colors.clockRim)} strokeWidth={major ? 2.2 : 1} strokeLinecap="round" opacity={major ? 1 : 0.7} />;
      })}
      {nums.map((n) => {
        const [x, y] = pt(n * 30, R - 22);
        return (
          <text key={n} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={700} fill={css(colors.hourHand)} style={{ fontFamily: 'inherit' }}>
            {n}
          </text>
        );
      })}
      {/* 時針・分針 */}
      <line x1={0} y1={0} {...xy(pt(hourA, 50))} stroke={css(colors.hourHand)} strokeWidth={7} strokeLinecap="round" />
      <line x1={0} y1={0} {...xy(pt(minA, 78))} stroke={css(colors.minuteHand)} strokeWidth={4.5} strokeLinecap="round" />
      {/* 活動終了時刻を示す赤い針: 塗りつぶしの終点と同じ角度 */}
      {sector && (
        <g>
          <line x1={0} y1={0} {...xy(pt(sector.endAngle, R - 4))} stroke={css(colors.endHand)} strokeWidth={3} strokeLinecap="round" />
          <circle cx={pt(sector.endAngle, R - 4)[0]} cy={pt(sector.endAngle, R - 4)[1]} r={4.5} fill={css(colors.endHand)} />
        </g>
      )}
      <circle r={5.5} fill={css(colors.hourHand)} />
    </svg>
  );
}

function xy([x, y]: [number, number]) {
  return { x2: x, y2: y };
}
