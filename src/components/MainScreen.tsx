import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadProgress, saveProgress } from '../data/localCache';
import { useStore } from '../data/store';
import { useFlashPhase, useNow } from '../hooks';
import { effectivePreset, findPreset, resolvePreset } from '../lib/presetResolver';
import { advance, computeDisplay, ensureProgress, findActivity, goBack, tick } from '../lib/schedule';
import { dateKey, secondsOfDay } from '../lib/time';
import type { Progress } from '../types';
import { ChecklistScreen, MapBook } from './Checklist';
import { KidsView } from './KidsView';

const TAP_GUARD_MS = 700; // 二重タップによる連続遷移の防止

export function MainScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data, gh, mode } = useStore();
  const now = useNow();
  const nowSec = secondsOfDay(now);
  const key = dateKey(now);

  const resolution = useMemo(() => resolvePreset(key, data), [key, data]);
  const eff = useMemo(() => effectivePreset(findPreset(data, resolution.presetId), resolution.source === 'override' ? resolution.override : null), [data, resolution]);
  const preset = eff.preset;
  const progressId = eff.progressId ?? resolution.presetId;

  const [stored, setStored] = useState<Progress | null>(() => loadProgress());
  // 表示は毎回「進行状況 + 現在時刻」から計算する(描画回数に依存しない)
  const progress = useMemo(() => tick(ensureProgress(stored, key, progressId), preset, data.activities, nowSec), [stored, key, progressId, preset, data.activities, nowSec]);

  useEffect(() => {
    if (progress !== stored) {
      setStored(progress);
      saveProgress(progress);
    }
  }, [progress, stored]);

  const display = useMemo(() => computeDisplay(progress, preset, data.activities, nowSec), [progress, preset, data.activities, nowSec]);
  const activity = findActivity(data.activities, display.item?.activityId ?? null);
  const phase = useFlashPhase(display.flashing);

  const latest = useRef({ progress, preset, activities: data.activities, key, resolutionId: progressId });
  latest.current = { progress, preset, activities: data.activities, key, resolutionId: progressId };
  const guardUntil = useRef(0);

  // 画面: 起動時に「スケジュール / チェックリスト」を選ぶ。完全に別の画面として扱う
  const [view, setView] = useState<'select' | 'schedule' | 'check'>('select');
  const [book, setBook] = useState(false);
  // チェックリストは登録済みの全シートから選べる(項目が1つもないシートは出さない)
  const sheets = useMemo(() => {
    const ids = new Set(data.checkItems.map((i) => i.id));
    return data.checksheets.map((c) => ({ ...c, itemIds: c.itemIds.filter((id) => ids.has(id)) })).filter((c) => c.itemIds.length > 0);
  }, [data.checksheets, data.checkItems]);

  const act = useCallback((fn: typeof advance) => {
    const t = Date.now();
    if (t < guardUntil.current) return;
    guardUntil.current = t + TAP_GUARD_MS;
    const { progress: p, preset: pr, activities, key: k, resolutionId } = latest.current;
    const sec = secondsOfDay(new Date());
    const base = ensureProgress(p, k, resolutionId);
    const next = tick(fn(base, pr, sec), pr, activities, sec);
    setStored(next);
    saveProgress(next);
  }, []);

  const badge = ((mode === 'github' && gh.status === 'offline') || mode === 'local') && (
    <div className="kv-badge" role="status">
      {mode === 'local' ? 'この端末だけに保存中' : 'オフライン(保存済みの予定を表示中)'}
    </div>
  );

  if (view === 'select') return <StartScreen hasSheets={sheets.length > 0} onPick={setView} onSettings={onOpenSettings} badge={badge} />;

  if (view === 'check')
    return (
      <>
        <ChecklistScreen sheets={sheets} onSwitch={() => setView('schedule')} onSettings={onOpenSettings} onOpenBook={() => setBook(true)} />
        {book && <MapBook onClose={() => setBook(false)} />}
      </>
    );

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <KidsView
        display={display}
        now={now}
        colors={data.theme.colors}
        phase={phase}
        urgency={data.settings.urgencyColors}
        reward={data.settings.rewardEffect}
        sound={data.settings.soundEffect}
        activity={activity}
        onBack={() => act(goBack)}
        onDone={() => act(advance)}
        onSettings={onOpenSettings}
      />
      <div className="mode-bar">
        <button type="button" className="mode-switch" onClick={() => setView('check')}>
          🔄 きりかえ
        </button>
        {badge}
      </div>
    </div>
  );
}

/** 起動したときの画面。スケジュールかチェックリストを選ぶ */
function StartScreen({ hasSheets, onPick, onSettings, badge }: { hasSheets: boolean; onPick: (v: 'schedule' | 'check') => void; onSettings: () => void; badge: React.ReactNode }) {
  return (
    <div className="start" role="main">
      <button type="button" className="start-settings" onClick={onSettings}>
        せってい
      </button>
      <div className="start-title">どっちを みる?</div>
      <div className="start-choices">
        <button type="button" className="start-card schedule" onClick={() => onPick('schedule')}>
          <span className="start-icon">⏰</span>
          <span>スケジュール</span>
        </button>
        <button type="button" className="start-card check" onClick={() => onPick('check')}>
          <span className="start-icon">✅</span>
          <span>チェックリスト</span>
          {!hasSheets && <span className="start-note">まだ ありません</span>}
        </button>
      </div>
      {badge}
    </div>
  );
}
