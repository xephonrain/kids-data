import { defaultImageDisplay } from '../defaults';
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
}

/** 子ども向けメイン画面(表示のみ)。設定画面のプレビューでも同じ部品を使う */
export function KidsView({ display, now, colors, phase, activity, onBack, onDone, onSettings, preview, forceFlash }: Props) {
  const flashing = display.flashing || !!forceFlash;
  const p = forceFlash && !display.flashing ? 1 : phase;

  // 点滅時は「あと○ふん」の背景と時計の塗りつぶしを同じ位相で連動させる
  const flashBg: ColorSetting = {
    color: activity?.flashBgColor ?? colors.remainingBgFlash.color,
    opacity: activity?.flashBgOpacity ?? colors.remainingBgFlash.opacity,
  };
  const remainBg = flashing ? mixSetting(colors.remainingBg, flashBg, p) : colors.remainingBg;
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
          style={{ background: css(remainBg), color: css(colors.remainingText), visibility: remainText ? 'visible' : 'hidden' }}
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

      <div className="kv-art">
        <ImageFrame
          display={display.image ?? { ...defaultImageDisplay(), borderColor: colors.illustrationFrame.color, borderOpacity: colors.illustrationFrame.opacity }}
          fallbackText={display.name}
          panelColor={css(colors.panel)}
        />
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
          onClick={onDone}
          style={{ background: css(colors.doneButtonBg), color: css(colors.doneButtonText) }}
        >
          おわったよ
        </button>
      </div>
      <button type="button" className="kv-settings" disabled={preview} onClick={onSettings} style={{ background: css(colors.settingsButtonBg), color: css(colors.settingsButtonText) }}>
        せってい
      </button>
    </div>
    </div>
  );
}
