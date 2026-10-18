import { useEffect, useState } from 'react';
import { JAPAN_SHAPES, JAPAN_VIEWBOX } from '../data/japanMap';
import { OKINAWA_FRAME, OKINAWA_SCALE, OKINAWA_TRANSFORM, PREFS, REGION_COLORS } from '../lib/japan';

interface Props {
  /** 色をぬった県のコード */
  filled: number[];
  /** 次にぬる県(点滅して教える) */
  target?: number;
  /** いま色をつける県(白からふわっと色がつく) */
  animate?: number;
  /** 選んでいる県(ふちを太く) */
  selected?: number;
  onPick?: (code: number) => void;
  label?: string;
}

const BASE_STROKE = 0.7;

/** 白地図。ぬった県は地方ごとの色。沖縄は小さいので右下に拡大して置く */
export function JapanMap({ filled, target, animate, selected, onPick, label = '日本地図' }: Props) {
  const done = new Set(filled);
  const [colored, setColored] = useState(false);
  useEffect(() => {
    setColored(false);
    if (animate == null) return;
    const t = setTimeout(() => setColored(true), 120);
    return () => clearTimeout(t);
  }, [animate]);

  const paint = (code: number, region: (typeof PREFS)[number]['region']) => {
    const isDone = done.has(code);
    if (!isDone) return '#ffffff';
    if (code === animate && !colored) return '#ffffff';
    return REGION_COLORS[region];
  };

  const shape = (p: (typeof PREFS)[number], k = 1) => {
    const cls = ['jm-pref', p.code === target ? 'target' : '', p.code === animate ? 'pop' : '', onPick && done.has(p.code) ? 'pick' : ''].filter(Boolean).join(' ');
    return (
      <path
        key={p.id}
        className={cls}
        d={JAPAN_SHAPES[p.id].path}
        fill={paint(p.code, p.region)}
        strokeWidth={BASE_STROKE * k}
        data-code={p.code}
        data-filled={done.has(p.code) ? '1' : '0'}
        onClick={onPick && done.has(p.code) ? () => onPick(p.code) : undefined}
      />
    );
  };

  /** 選択・次の県・いまぬった県のふち。ふちの太さを後から変えると iOS で残像が出るため、別のパスを重ねる */
  const outline = (p: (typeof PREFS)[number], k = 1) => {
    const kind = p.code === target ? 'target' : p.code === animate ? 'pop' : p.code === selected ? 'sel' : '';
    if (!kind) return null;
    return <path key={`o-${p.id}-${kind}`} className={`jm-ov ${kind}`} d={JAPAN_SHAPES[p.id].path} strokeWidth={(kind === 'target' ? 3 : 2.6) * k} pointerEvents="none" />;
  };

  const oki = PREFS.find((p) => p.id === 'okinawa')!;
  return (
    <svg className="jm" viewBox={JAPAN_VIEWBOX} role="img" aria-label={label}>
      {PREFS.filter((p) => p.id !== 'okinawa').map((p) => shape(p))}
      {PREFS.filter((p) => p.id !== 'okinawa').map((p) => outline(p))}
      <rect className="jm-frame" x={OKINAWA_FRAME.x} y={OKINAWA_FRAME.y} width={OKINAWA_FRAME.w} height={OKINAWA_FRAME.h} rx="6" />
      <g transform={OKINAWA_TRANSFORM}>
        {shape(oki, 1 / OKINAWA_SCALE)}
        {outline(oki, 1 / OKINAWA_SCALE)}
      </g>
    </svg>
  );
}
