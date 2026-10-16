import { useMemo, useState } from 'react';
import { KidsView } from '../components/KidsView';
import { Banner, ColorOpacity, Confirm, Segmented } from '../components/ui';
import { useStore } from '../data/store';
import { CONTRAST_PAIRS, DEFAULT_COLORS, THEME_LABELS } from '../defaults';
import { useFlashPhase, useNow } from '../hooks';
import { contrastRatio } from '../lib/color';
import { LABEL_GAP } from '../lib/schedule';
import { secondsOfDay } from '../lib/time';
import type { DisplayModel, ThemeColors, ThemeKey } from '../types';

const GROUPS: { title: string; keys: ThemeKey[] }[] = [
  { title: '画面全体', keys: ['background', 'panel', 'timeText', 'illustrationFrame'] },
  { title: '時計', keys: ['clockFace', 'clockRim', 'hourHand', 'minuteHand', 'endHand', 'clockFill'] },
  { title: '「あと○ふん」・活動名', keys: ['remainingBg', 'remainingText', 'activityNameBg', 'activityNameText'] },
  { title: '点滅したとき(時計の塗りつぶしと「あと○ふん」の背景が連動して変わります)', keys: ['clockFillFlash', 'remainingBgFlash'] },
  { title: 'ボタン', keys: ['backButtonBg', 'backButtonText', 'doneButtonBg', 'doneButtonText', 'settingsButtonBg', 'settingsButtonText'] },
];

export function ThemeSection() {
  const { data, update } = useStore();
  const saved = data.theme.colors;
  const [draft, setDraft] = useState<ThemeColors>(() => structuredClone(saved));
  const [confirmReset, setConfirmReset] = useState(false);
  const [mode, setMode] = useState<'normal' | 'flash' | 'anim'>('normal');
  const now = useNow();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  // プレビュー用の表示内容(実際の活動ではなく見本)
  const display = useMemo<DisplayModel>(() => {
    const sec = secondsOfDay(now);
    const endMin = Math.ceil(sec / 60) + 10;
    return {
      kind: 'item',
      name: data.activities[0]?.name ?? 'あさごはん',
      image: data.activities[0] ?? null,
      item: null,
      index: 0,
      remainingSec: endMin * 60 - sec,
      remainingMin: 10,
      endMin,
      flashing: mode === 'anim',
      overtime: false,
      canGoBack: true,
      canFinish: true,
    };
  }, [now, mode, data.activities]);
  const phase = useFlashPhase(mode === 'anim');

  const set = (k: ThemeKey, v: ThemeColors[ThemeKey]) => setDraft((d) => ({ ...d, [k]: v }));
  const textOn = (k: ThemeKey) => {
    const pair = CONTRAST_PAIRS.find((p) => p.text === k);
    return pair ? { bg: pair.bg.map((b) => draft[b]), name: pair.label } : undefined;
  };
  const lowContrast = CONTRAST_PAIRS.flatMap((p) => p.bg.map((b) => ({ p, b, ratio: contrast(draft, p.text, b) }))).filter((x) => x.ratio < 3);

  return (
    <div className="panel">
      <h2>配色設定</h2>
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={data.settings.urgencyColors} onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, urgencyColors: e.target.checked } }))} />
          <span>残り5分以下で黄色、1分以下で赤に「あと○ふん」の色を変える(点滅の設定がある場合は点滅を優先)</span>
        </label>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={data.settings.rewardEffect} onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, rewardEffect: e.target.checked } }))} />
          <span>「おわったよ」を押したとき、星や音符のごほうび演出を出す</span>
        </label>
        <p className="hint">終わりが近づくと(点滅の設定がある活動のみ)、いまの絵が左に寄って「→ つぎは○○」が出ます。</p>
      </div>
      <p className="muted" style={{ marginBottom: 10 }}>色と透明度(0〜100%)を変えると、プレビューにすぐ反映されます。「保存」で、すべての端末に反映されます。</p>
      <div className="two-col theme-cols">
        <div className="theme-colors">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3>{g.title}</h3>
              {g.keys.map((k) => (
                <ColorOpacity key={k} label={THEME_LABELS[k]} value={draft[k]} onChange={(v) => set(k, v)} textOn={textOn(k)} />
              ))}
            </div>
          ))}
        </div>
        <div className="theme-side-col">
          <div className="theme-side" style={{ position: 'sticky', top: 70 }}>
            <div className="ts-seg">
              <Segmented
                label="プレビューの状態"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'normal', label: '通常' },
                  { value: 'flash', label: '点滅(濃い色)' },
                  { value: 'anim', label: '点滅(動き)' },
                ]}
              />
            </div>
            <div className="preview-box ts-prev" style={{ position: 'static', marginTop: 8 }}>
              <KidsView display={mode === 'normal' ? { ...display, flashing: false } : display} now={now} colors={draft} phase={mode === 'anim' ? phase : 0} forceFlash={mode === 'flash'} preview />
            </div>
            {lowContrast.length > 0 && (
              <Banner kind="warn">
                読みにくい組み合わせがあります:{' '}
                {lowContrast.map((x) => `${x.p.label}(${THEME_LABELS[x.b]}との差)`).join('、')}
              </Banner>
            )}
            <div className="row-end">
              <button className="btn" onClick={() => setConfirmReset(true)}>
                初期配色にもどす
              </button>
              <button className="btn" disabled={!dirty} onClick={() => setDraft(structuredClone(saved))}>
                変更を取り消す
              </button>
              <button
                className="btn btn-primary"
                disabled={!dirty}
                onClick={() => update((d) => ({ ...d, theme: { ...d.theme, colors: structuredClone(draft) } }))}
              >
                保存
              </button>
            </div>
            <p className="hint">プレビューの表示名「{display.name || LABEL_GAP}」は見本です。</p>
          </div>
        </div>
      </div>
      {confirmReset && (
        <Confirm
          title="初期配色にもどしますか？"
          message="色と透明度だけが初期値になります。活動やプリセットなど、配色以外の設定は変わりません。(保存するまで他の端末には反映されません)"
          confirmLabel="もどす"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setDraft(structuredClone(DEFAULT_COLORS));
            setConfirmReset(false);
          }}
        />
      )}
    </div>
  );
}

function contrast(colors: ThemeColors, text: ThemeKey, bg: ThemeKey): number {
  return contrastRatio(colors[text], colors[bg]);
}
