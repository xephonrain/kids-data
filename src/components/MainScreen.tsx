import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadCheckDay, loadProgress, saveProgress } from '../data/localCache';
import { useStore } from '../data/store';
import { useFlashPhase, useNow } from '../hooks';
import { effectivePreset, findPreset, resolvePreset } from '../lib/presetResolver';
import { advance, computeDisplay, ensureProgress, findActivity, goBack, tick } from '../lib/schedule';
import { dateKey, secondsOfDay } from '../lib/time';
import type { Progress } from '../types';
import { activeSheets, checkedIds, ensureCheckDay } from '../lib/checklist';
import { ChecklistScreen, StickerBook } from './Checklist';
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

  // チェックシート・シール帳(子ども向けの別画面)
  const [panel, setPanel] = useState<null | 'check' | 'book'>(null);
  const [highlight, setHighlight] = useState<string | undefined>(undefined);
  const sheets = useMemo(() => activeSheets(data.checksheets, now.getDay(), Math.floor(nowSec / 60)), [data.checksheets, now, nowSec]);
  const checkDay = ensureCheckDay(loadCheckDay(key), key);
  const checkProgress = sheets.reduce((n, s) => n + checkedIds(checkDay, s).length, 0);
  const checkTotal = sheets.reduce((n, s) => n + s.items.length, 0);
  const showExtra = sheets.length > 0 || data.stickers.length > 0;
  const openCheck = panel === 'check' && sheets.length > 0;

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

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div style={{ position: 'absolute', inset: `0 0 ${showExtra ? 60 : 0}px 0`, containerType: 'size' }}>
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
      </div>
      {showExtra && (
        <div className="kv-extra">
          {sheets.length > 0 && (
            <button type="button" onClick={() => setPanel('check')}>
              ✅ チェック {checkProgress}/{checkTotal}
            </button>
          )}
          {data.stickers.length > 0 && (
            <button type="button" onClick={() => setPanel('book')}>
              📖 シールちょう
            </button>
          )}
        </div>
      )}
      {openCheck && (
        <ChecklistScreen
          sheets={sheets}
          onClose={() => setPanel(null)}
          onOpenBook={(h) => {
            setHighlight(h);
            setPanel('book');
          }}
        />
      )}
      {panel === 'book' && <StickerBook highlight={highlight} onClose={() => { setHighlight(undefined); setPanel(null); }} />}
      {((mode === 'github' && gh.status === 'offline') || mode === 'local') && (
        <div className="kv-badge" role="status">
          {mode === 'local' ? 'この端末だけに保存中' : 'オフライン(保存済みの予定を表示中)'}
        </div>
      )}
    </div>
  );
}
