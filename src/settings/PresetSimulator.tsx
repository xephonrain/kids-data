import { useMemo, useState } from 'react';
import { KidsView } from '../components/KidsView';
import { Modal } from '../components/ui';
import { useStore } from '../data/store';
import { useFlashPhase } from '../hooks';
import { advance, computeDisplay, findActivity, freshProgress, goBack, tick } from '../lib/schedule';
import { EVENT_LABEL, nextEventSec, prevEventSec, simEvents } from '../lib/simulate';
import { minutesToHHMM } from '../lib/time';
import type { Preset, Progress } from '../types';

const hms = (sec: number) => `${minutesToHHMM(Math.floor(sec / 60))}:${String(sec % 60).padStart(2, '0')}`;

/**
 * プリセットの動作確認。仮の時刻を「次のできごと」まで一気に進めて、子ども画面の表示・点滅・切り替えを確かめる。
 * 実際の進行状況や設定は書き換えない(この画面の中だけの動き)。
 */
export function PresetSimulator({ preset, onClose }: { preset: Preset; onClose: () => void }) {
  const { data } = useStore();
  const events = useMemo(() => simEvents(preset, data.activities), [preset, data.activities]);
  const firstSec = events.length ? events[0].sec : 8 * 3600;
  const [sec, setSec] = useState(firstSec);
  const [progress, setProgress] = useState<Progress>(() => tick(freshProgress('sim', preset.id), preset, data.activities, firstSec));

  const display = useMemo(() => computeDisplay(progress, preset, data.activities, sec), [progress, preset, data.activities, sec]);
  const phase = useFlashPhase(display.flashing);
  const activity = findActivity(data.activities, display.item?.activityId ?? null);

  const moveTo = (t: number, fromScratch = false) => {
    const to = Math.max(0, Math.min(86399, t));
    setSec(to);
    setProgress((p) => tick(fromScratch ? freshProgress('sim', preset.id) : p, preset, data.activities, to));
  };
  const next = nextEventSec(events, sec);
  const prev = prevEventSec(events, sec);
  const upcoming = events.filter((e) => e.sec > sec).slice(0, 3);
  const portrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
  const now = new Date(2026, 0, 1, Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60);

  return (
    <Modal
      title={`「${preset.name}」の動作確認`}
      onClose={onClose}
      wide
      footer={
        <button className="btn" onClick={onClose}>
          閉じる
        </button>
      }
    >
      {events.length === 0 ? (
        <p className="muted">このプリセットにはまだ予定がありません。</p>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            仮の時刻を進めて、子ども画面の動きを確かめます。ここでの操作は本番の進行状況には影響しません。
          </p>
          <div className="preview-box" style={{ position: 'static', aspectRatio: portrait ? '9 / 14' : '16 / 10', maxWidth: portrait ? 300 : undefined, margin: '0 auto' }}>
            <KidsView
              display={display}
              now={now}
              colors={data.theme.colors}
              phase={phase}
              activity={activity}
              urgency={data.settings.urgencyColors}
              reward={data.settings.rewardEffect}
              noSettings
              sound={data.settings.soundEffect}
              onDone={() => setProgress((p) => tick(advance(p, preset, sec), preset, data.activities, sec))}
              onBack={() => setProgress((p) => tick(goBack(p, preset, sec), preset, data.activities, sec))}
            />
          </div>
          <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 18, margin: '10px 0 6px' }} aria-live="polite">
            仮の時刻 {hms(sec)}
          </div>
          <div className="row" style={{ justifyContent: 'center', marginBottom: 8 }}>
            <button className="btn" disabled={prev === null} onClick={() => prev !== null && moveTo(prev, true)}>
              ◀ 前のできごと
            </button>
            <button className="btn btn-primary" disabled={next === null} onClick={() => next !== null && moveTo(next)}>
              次のできごとへ ▶
            </button>
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 6, marginBottom: 8 }}>
            <button className="btn btn-sm" onClick={() => moveTo(sec + 60)}>
              +1分
            </button>
            <button className="btn btn-sm" onClick={() => moveTo(sec + 300)}>
              +5分
            </button>
            <label className="row" style={{ gap: 6 }}>
              <span className="hint">時刻を指定</span>
              <input
                type="time"
                aria-label="仮の時刻を指定"
                value={minutesToHHMM(Math.floor(sec / 60))}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number);
                  if (Number.isFinite(h) && Number.isFinite(m)) moveTo(h * 3600 + m * 60, true);
                }}
              />
            </label>
            <button className="btn btn-sm" onClick={() => moveTo(firstSec, true)}>
              最初にもどす
            </button>
          </div>
          <div className="hint" style={{ textAlign: 'center' }}>
            {upcoming.length === 0
              ? 'このあとのできごとはありません'
              : upcoming.map((e) => `${hms(e.sec)} ${e.name} ${EVENT_LABEL[e.kind]}`).join(' / ')}
          </div>
        </>
      )}
    </Modal>
  );
}
