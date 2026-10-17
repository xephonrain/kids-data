import { useEffect, useRef, useState } from 'react';
import { defaultImageDisplay } from '../defaults';
import { playSound } from '../lib/sound';
import { css, mixSetting } from '../lib/color';
import { formatClockKana } from '../lib/time';
import type { Activity, ColorSetting, DisplayModel, ThemeColors } from '../types';
import { AnalogClock } from './AnalogClock';
import { ImageFrame } from './ImageFrame';

interface Props {
  display: DisplayModel;
  now: Date;
  colors: ThemeColors;
  /** 点滅の位相 0〜1。点滅していなければ0 */
  phase: number;
  activity?: Activity | null;
  onBack?: () => void;
  onDone?: () => void;
  onSettings?: () => void;
  /** 設定画面のプレビュー: ボタンを押せなくする */
  preview?: boolean;
  /** 設定画面の「残り時間の背景」プレビュー用に、強制的に点滅色を使う */
  forceFlash?: boolean;
  /** 残り5分以下で黄色、1分以下で赤にする(点滅中は点滅の色を優先) */
  urgency?: boolean;
  /** 「おわったよ」を押したときのごほうび演出 */
  reward?: boolean;
  /** 「せってい」ボタンを出さない(動作確認画面用) */
  noSettings?: boolean;
  /** 効果音を鳴らす */
  sound?: boolean;
}

const SWITCH_FX = ['slide', 'spin', 'zoom', 'bounce', 'flip', 'drop', 'wobble'] as const;

const URGENT_YELLOW: ColorSetting = { color: '#ffd23f', opacity: 1 };
const URGENT_RED: ColorSetting = { color: '#e5484d', opacity: 1 };
const REWARD_EMOJI = ['⭐', '🌟', '✨', '🎵', '🎶', '💖', '🎉', '🎈'];

interface Particle {
  id: number;
  emoji: string;
  left: number;
  dx: number;
  dy: number;
  rot: number;
  delay: number;
  size: number;
}

function makeBurst(seed: number): Particle[] {
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  return Array.from({ length: 18 }, (_, i) => ({
    id: seed * 100 + i,
    emoji: REWARD_EMOJI[Math.floor(Math.random() * REWARD_EMOJI.length)],
    left: r(15, 85),
    dx: r(-18, 18),
    dy: r(45, 85),
    rot: r(-40, 40),
    delay: r(0, 0.4),
    size: r(7, 13),
  }));
}

/** 子ども向けメイン画面(表示のみ)。設定画面のプレビューでも同じ部品を使う */
export function KidsView({ display, now, colors, phase, activity, onBack, onDone, onSettings, preview, forceFlash, urgency, reward, noSettings, sound }: Props) {
  const flashing = display.flashing || !!forceFlash;
  const p = forceFlash && !display.flashing ? 1 : phase;

  // 点滅時は「あと○ふん」の背景と時計の塗りつぶしを同じ位相で連動させる
  const flashBg: ColorSetting = {
    color: activity?.flashBgColor ?? colors.remainingBgFlash.color,
    opacity: activity?.flashBgOpacity ?? colors.remainingBgFlash.opacity,
  };
  let remainBg = flashing ? mixSetting(colors.remainingBg, flashBg, p) : colors.remainingBg;
  let remainFg = colors.remainingText;
  if (urgency && !flashing && display.kind === 'item' && !display.overtime && display.remainingMin > 0) {
    if (display.remainingMin <= 1) {
      remainBg = URGENT_RED;
      remainFg = { color: '#ffffff', opacity: 1 };
    } else if (display.remainingMin <= 5) {
      remainBg = URGENT_YELLOW;
      remainFg = { color: '#3a2e00', opacity: 1 };
    }
  }

  // 次のやることの予告: 点滅(=終わりが近い)中だけ、いまの絵を左へ寄せて「→ つぎ」を出す
  const next = flashing && !forceFlash && display.kind === 'item' ? display.next : null;
  const nextShown = useRef(next);
  if (next) nextShown.current = next; // 閉じるアニメーション中も内容を保つ

  // ごほうび演出
  const [burst, setBurst] = useState<Particle[] | null>(null);
  const seed = useRef(0);
  const timer = useRef<number | null>(null);
  const lastDone = useRef(0);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const handleDone = () => {
    if (reward && !preview && display.canFinish) {
      seed.current += 1;
      setBurst(makeBurst(seed.current));
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setBurst(null), 3300);
    }
    if (sound && !preview && display.canFinish) {
      playSound('done');
      lastDone.current = Date.now();
    }
    onDone?.();
  };

  // やることが切り替わったとき: 絵にランダムな動きを付けて、やさしい音を鳴らす
  const itemId = display.kind === 'item' ? (display.item?.id ?? null) : null;
  const prevItem = useRef<string | null>(itemId);
  const [fx, setFx] = useState<{ name: string; n: number } | null>(null);
  useEffect(() => {
    if (prevItem.current === itemId) return;
    prevItem.current = itemId;
    if (!itemId || preview) return; // 予定の合間や終了では出さない
    setFx((f) => ({ name: SWITCH_FX[Math.floor(Math.random() * SWITCH_FX.length)], n: (f?.n ?? 0) + 1 }));
    // 「おわったよ」の直後は、ごほうびの音だけにする
    if (sound && Date.now() - lastDone.current > 2800) playSound('switch');
  }, [itemId, preview, sound]);
  const fill = flashing ? mixSetting(colors.clockFill, colors.clockFillFlash, p) : colors.clockFill;

  const showHands = display.endMin !== null && display.kind !== 'done' && display.kind !== 'none';
  const remainText = display.kind === 'done' || display.kind === 'none' ? '' : `あと${display.remainingMin}ふん`;
  const sub = display.kind === 'gap' ? 'つぎまで' : '';

  return (
    <div className={`kv-wrap${preview ? ' kv-preview' : ''}`}>
    <div className="kv" style={{ background: css(colors.background), color: css(colors.timeText) }}>
      <div className="kv-top">
        <div
          className="kv-remain"
          style={{ background: css(remainBg), color: css(remainFg), visibility: remainText ? 'visible' : 'hidden' }}
          aria-live="polite"
        >
          {sub && <span className="kv-sub">{sub}</span>}
          {remainText || 'あと0ふん'}
        </div>
        <div className="kv-name" style={{ background: css(colors.activityNameBg), color: css(colors.activityNameText) }}>
          {display.name || ' '}
        </div>
      </div>

      <div className="kv-clock">
        <AnalogClock now={now} colors={colors} endMin={showHands ? display.endMin : null} fill={display.overtime ? { ...fill, opacity: 0 } : fill} />
      </div>
      <div className="kv-time" style={{ color: css(colors.timeText) }}>
        {formatClockKana(now)}
      </div>

      <div className={`kv-art${next ? ' has-next' : ''}`}>
        <div key={fx?.n ?? 0} className={`kv-art-cur${fx ? ` fx-${fx.name}` : ''}`}>
          <ImageFrame
            display={display.image ?? { ...defaultImageDisplay(), borderColor: colors.illustrationFrame.color, borderOpacity: colors.illustrationFrame.opacity }}
            fallbackText={display.name}
            panelColor={css(colors.panel)}
          />
        </div>
        <div className="kv-art-arrow" aria-hidden="true">→</div>
        <div className="kv-art-next" aria-hidden={!next}>
          <div className="kv-art-next-label"><span>つぎは</span><b>{nextShown.current?.name}</b></div>
          <div className="kv-art-next-img">
            <ImageFrame
              display={nextShown.current?.image ?? { ...defaultImageDisplay(), borderColor: colors.illustrationFrame.color, borderOpacity: colors.illustrationFrame.opacity }}
              fallbackText={nextShown.current?.name}
              panelColor={css(colors.panel)}
            />
          </div>
        </div>
      </div>

      <div className="kv-buttons">
        <button
          type="button"
          className="kv-btn kv-back"
          disabled={preview || !display.canGoBack}
          onClick={onBack}
          style={{ background: css(colors.backButtonBg), color: css(colors.backButtonText) }}
        >
          まだ<br />おわってなかった
        </button>
        <button
          type="button"
          className="kv-btn kv-done"
          disabled={preview || !display.canFinish}
          onClick={handleDone}
          style={{ background: css(colors.doneButtonBg), color: css(colors.doneButtonText) }}
        >
          おわったよ
        </button>
      </div>
      {burst && (
        <div className="kv-reward" aria-hidden="true">
          {burst.map((q) => (
            <span
              key={q.id}
              style={{ left: `${q.left}%`, fontSize: `${q.size}cqmin`, animationDelay: `${q.delay}s`, ['--dx' as string]: `${q.dx}cqmin`, ['--dy' as string]: `${q.dy}cqmin`, ['--rot' as string]: `${q.rot}deg` }}
            >
              {q.emoji}
            </span>
          ))}
        </div>
      )}
      {!noSettings && <button type="button" className="kv-settings" disabled={preview} onClick={onSettings} style={{ background: css(colors.settingsButtonBg), color: css(colors.settingsButtonText) }}>
        せってい
      </button>}
    </div>
    </div>
  );
}
