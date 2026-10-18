// 子ども向け: チェックシート / ごほうび / シール帳。チェックするたびに、演出と効果音をランダムに組み合わせて出す。

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CHECKS_EVENT, loadCheckDay, saveCheckDay } from '../data/localCache';
import { useStore } from '../data/store';
import { newId } from '../defaults';
import { checkedIds, currentItemId, ensureCheckDay, isAllDone, pickDifferent, plainImage, toggleCheck, type CheckDay } from '../lib/checklist';
import { CAPITALS, PREF_COUNT, PREFS, mapState, nextGet, prefByCode, type Pref } from '../lib/japan';
import { CHECK_SOUNDS, playSound } from '../lib/sound';
import { dateKey } from '../lib/time';
import type { Checksheet } from '../types';
import { ImageFrame } from './ImageFrame';
import { JapanMap } from './JapanMap';

// ---- ランダムな演出 ----
export const EMOJI_SETS: string[][] = [
  ['⭐', '🌟', '✨'],
  ['💖', '💕', '💗'],
  ['🎵', '🎶', '🎼'],
  ['🎉', '🎊', '🎈'],
  ['🌸', '🌼', '🌷'],
  ['🐰', '🐱', '🐶', '🐥'],
];
export const ROW_FX = ['cl-fx-pop', 'cl-fx-wiggle', 'cl-fx-flip', 'cl-fx-bounce', 'cl-fx-glow'];

interface Burst {
  id: number;
  x: number;
  y: number;
  items: { emoji: string; dx: number; dy: number; rot: number; size: number; delay: number }[];
}

function makeBurst(id: number, x: number, y: number, set: string[]): Burst {
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  const n = 12;
  return {
    id,
    x,
    y,
    items: Array.from({ length: n }, (_, i) => {
      const ang = (i / n) * Math.PI * 2 + r(-0.3, 0.3);
      const dist = r(14, 30);
      return { emoji: set[Math.floor(Math.random() * set.length)], dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist - 6, rot: r(-60, 60), size: r(4, 8), delay: r(0, 0.3) };
    }),
  };
}

function BurstLayer({ bursts }: { bursts: Burst[] }) {
  return (
    <div className="cl-bursts" aria-hidden="true">
      {bursts.map((b) => (
        <div key={b.id} className="cl-burst" style={{ left: b.x, top: b.y }}>
          {b.items.map((q, i) => (
            <span key={i} style={{ fontSize: `${q.size}vmin`, animationDelay: `${q.delay}s`, ['--dx' as string]: `${q.dx}vmin`, ['--dy' as string]: `${q.dy}vmin`, ['--rot' as string]: `${q.rot}deg` } as CSSProperties}>
              {q.emoji}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function useBursts() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const seq = useRef(1);
  const add = useCallback((x: number, y: number, set: string[]) => {
    const id = seq.current++;
    setBursts((b) => [...b.slice(-4), makeBurst(id, x, y, set)]);
    setTimeout(() => setBursts((b) => b.filter((q) => q.id !== id)), 62000);
  }, []);
  return { bursts, add };
}

// ---- チェックシート ----
export function ChecklistScreen({ sheets, onSwitch, onSettings, onOpenBook }: { sheets: Checksheet[]; onSwitch: () => void; onSettings: () => void; onOpenBook: () => void }) {
  const { data, record } = useStore();
  const today = dateKey(new Date());
  const [day, setDay] = useState<CheckDay>(() => loadCheckDay(today));
  const [sheetId, setSheetId] = useState(sheets[0]?.id ?? '');
  const [rewardFor, setRewardFor] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [fx, setFx] = useState<{ id: string; cls: string; n: number } | null>(null);
  const { bursts, add } = useBursts();
  const lastSound = useRef(-1);
  const lastSet = useRef(-1);
  const lastFx = useRef(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const reload = () => setDay(loadCheckDay(dateKey(new Date())));
    window.addEventListener(CHECKS_EVENT, reload);
    return () => window.removeEventListener(CHECKS_EVENT, reload);
  }, []);

  const sheet = sheets.find((s) => s.id === sheetId) ?? sheets[0];
  const cur = ensureCheckDay(day, today);

  const commit = (next: CheckDay) => {
    setDay(next);
    saveCheckDay(next);
  };

  if (!sheet)
    return (
      <div className="cl-screen" role="dialog" aria-label="チェックリスト">
        <div className="cl-head">
          <button className="cl-small" onClick={onSwitch}>
            🔄 きりかえ
          </button>
          <button className="cl-small" onClick={onSettings}>
            せってい
          </button>
        </div>
        <div className="cl-teaser">チェックリストが まだ ありません。「せってい」でつくってね</div>
      </div>
    );
  const items = sheet.itemIds.flatMap((id) => data.checkItems.find((i) => i.id === id) ?? []);
  const done = new Set(checkedIds(cur, sheet));
  const currentId = currentItemId(cur, sheet);
  const all = isAllDone(cur, sheet);
  const reward = cur.reward[sheet.id];
  const claimed = reward?.claimed === true;
  const canReward = sheet.rewardEnabled;

  const onTap = (itemId: string, ev: React.MouseEvent) => {
    const was = done.has(itemId);
    let next = toggleCheck(cur, sheet, itemId);
    if (!was) {
      // チェックを入れたとき: 絵文字の種類・行の動き・効果音をそれぞれランダムに選ぶ(直前と同じものは避ける)
      const si = pickDifferent(EMOJI_SETS.length, lastSet.current, Math.random());
      const fi = pickDifferent(ROW_FX.length, lastFx.current, Math.random());
      const ai = pickDifferent(CHECK_SOUNDS.length, lastSound.current, Math.random());
      lastSet.current = si;
      lastFx.current = fi;
      lastSound.current = ai;
      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
      add(rect.right - rect.height * 0.7, rect.top + rect.height / 2, EMOJI_SETS[si]);
      setFx({ id: itemId, cls: ROW_FX[fi], n: Date.now() });
      if (data.settings.soundEffect) playSound(CHECK_SOUNDS[ai]);
    }
    const nowAll = isAllDone(next, sheet);
    if (nowAll && canReward && !next.reward[sheet.id]) {
      next = { ...next, reward: { ...next.reward, [sheet.id]: { claimed: false } } };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setRewardFor(sheet.id), 2600);
    } else if (!nowAll && next.reward[sheet.id] && !next.reward[sheet.id].claimed) {
      const { [sheet.id]: _drop, ...rest } = next.reward;
      next = { ...next, reward: rest };
      clearTimeout(timer.current);
    }
    commit(next);
  };

  const rewardSheet = rewardFor ? sheets.find((s) => s.id === rewardFor) : null;

  /** 地図をぬる(記録は子ども画面からでも書き込める) */
  const claim = () => {
    if (!rewardSheet) return;
    record((d) => ({ ...d, mapLog: [...d.mapLog, { id: newId(), prefCode: nextGet(d.mapLog), sheetId: rewardSheet.id, dateKey: today, at: new Date().toISOString() }] }));
    commit({ ...cur, reward: { ...cur.reward, [rewardSheet.id]: { claimed: true } } });
  };

  return (
    <div className="cl-screen" role="dialog" aria-label="チェックシート">
      <div className="cl-head">
        <button className="cl-small" onClick={onSwitch}>
          🔄 きりかえ
        </button>
        <div className="cl-head-r">
          <button className="cl-small" onClick={() => setPicking(true)} aria-haspopup="dialog">
            📋 リスト
          </button>
          <button className="cl-small" onClick={onSettings}>
            せってい
          </button>
        </div>
      </div>
      <div className="cl-title-row">
        <div className="cl-title">{sheet.name}</div>
      </div>
      {picking && (
        <div className="cl-pick-back" onClick={() => setPicking(false)}>
          <div className="cl-pick" role="dialog" aria-label="リストをえらぶ" onClick={(e) => e.stopPropagation()}>
            <div className="cl-pick-title">リストを えらぶ</div>
            <div className="cl-pick-list" role="tablist">
              {sheets.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === sheet.id}
                  className={s.id === sheet.id ? 'on' : ''}
                  onClick={() => {
                    setSheetId(s.id);
                    setPicking(false);
                  }}
                >
                  {s.id === sheet.id ? '✅ ' : ''}
                  {s.name}
                </button>
              ))}
            </div>
            <button className="cl-small" onClick={() => setPicking(false)}>
              とじる
            </button>
          </div>
        </div>
      )}
      <div className="cl-stars" role="img" aria-label={`${items.length}つのうち${done.size}つできた`}>
        {items.map((it) => (
          <svg key={it.id} viewBox="0 0 24 24" aria-hidden="true">
            <polygon points="12,2 15,9 22,9.5 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9.5 9,9" fill={done.has(it.id) ? '#f5b700' : '#ffffff'} stroke={done.has(it.id) ? '#d99a00' : '#c9c4e6'} strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        ))}
      </div>
      <div className="cl-rows">
        {items.map((it) => {
          const isDone = done.has(it.id);
          const isCur = it.id === currentId;
          return (
            <button
              key={fx?.id === it.id ? `${it.id}-${fx.n}` : it.id}
              type="button"
              className={`cl-row${isDone ? ' done' : ''}${isCur ? ' cur' : ''}${fx?.id === it.id ? ` ${fx.cls}` : ''}`}
             
              aria-pressed={isDone}
              onClick={(e) => onTap(it.id, e)}
            >
              <span className="cl-pic">
                <ImageFrame display={{ ...it, borderWidth: Math.min(it.borderWidth, 8) }} fallbackText={it.name.slice(0, 3)} />
              </span>
              <span className="cl-name">{it.name}</span>
              <span className="cl-mark">
                {isDone && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="cl-foot">
        {all && canReward && !claimed ? (
          <button className="cl-big" onClick={() => setRewardFor(sheet.id)}>
            ごほうびを もらう
          </button>
        ) : all ? (
          <div className="cl-teaser ok">ぜんぶ できたね!</div>
        ) : canReward ? (
          <div className="cl-teaser">ぜんぶ できたら ちずを ぬれるよ</div>
        ) : null}
        <button className="cl-small" onClick={() => onOpenBook()}>
          にほんちずを みる
        </button>
      </div>
      <BurstLayer bursts={bursts} />
      {rewardSheet && <RewardCard onClaim={claim} onClose={() => setRewardFor(null)} />}
    </div>
  );
}

// ---- 県のカード(名産・とくしょく) ----
export function PrefCard({ pref }: { pref: Pref }) {
  // 県ごとに文章の長さが違っても枠の高さが変わらないよう、全県ぶんを透明に重ねて一番大きい枠に合わせる
  return (
    <div className="cl-pref-slot">
      <PrefCardView pref={pref} />
      <div className="cl-pref-ghosts" aria-hidden="true" inert>
        {PREFS.map((p) => (
          <PrefCardView key={p.id} pref={p} ghost />
        ))}
      </div>
    </div>
  );
}

function PrefCardView({ pref, ghost }: { pref: Pref; ghost?: boolean }) {
  const { data } = useStore();
  const img = ghost ? undefined : data.prefImages[pref.id];
  return (
    <div className="cl-pref" data-pref={ghost ? undefined : pref.id}>
      <div className="cl-pref-pic">{img ? <ImageFrame display={plainImage(img)} fallbackText={pref.emoji} panelColor="transparent" /> : <span className="cl-pref-emoji">{pref.emoji}</span>}</div>
      <div className="cl-pref-text">
        <div className="cl-pref-name">
          {pref.name}
          <span className="cl-pref-kana">{pref.kana}</span>
        </div>
        <div className="cl-pref-items">
          {pref.items.map((it) => (
            <span key={it}>{it}</span>
          ))}
        </div>
        {CAPITALS[pref.code] && (
          <div className="cl-pref-cap">
            🏛️ けんちょうしょざいち: <b>{CAPITALS[pref.code].name}</b>
            <span>({CAPITALS[pref.code].kana})</span>
          </div>
        )}
        <div className="cl-pref-feature">{pref.feature}</div>
      </div>
    </div>
  );
}

// ---- ごほうび: 地図をぬる ----
function RewardCard({ onClaim, onClose }: { onClaim: () => void; onClose: () => void }) {
  const { data } = useStore();
  const [claimed, setClaimed] = useState<number | null>(null);
  const { bursts, add } = useBursts();
  const before = useRef(mapState(data.mapLog));
  // 47県ぬり終えていたら、今回から新しい周(白地図)
  const fresh = before.current.complete;
  const state = mapState(data.mapLog);
  const nextPref = before.current.next;
  const shown = claimed != null ? state.filled : fresh ? [] : state.filled;
  const pref = claimed != null ? prefByCode(claimed) : nextPref;

  useEffect(() => {
    if (data.settings.soundEffect) playSound('done');
  }, [data.settings.soundEffect]);

  const doClaim = () => {
    onClaim();
    setClaimed(nextPref.code);
    if (data.settings.soundEffect) playSound('sticker');
    const w = window.innerWidth;
    const h = window.innerHeight;
    [0, 300, 600].forEach((d, i) => setTimeout(() => add(w * (0.3 + 0.2 * i), h * 0.35, EMOJI_SETS[(i * 2) % EMOJI_SETS.length]), d + 300));
  };

  return (
    <div className="cl-reward" role="dialog" aria-label="ごほうび">
      <div className="cl-reward-banner">{claimed != null ? `${pref?.name} を ぬったよ!` : 'ぜんぶ できたね!'}</div>
      <div className="cl-reward-body">
        <div className="cl-reward-map">
          <JapanMap filled={shown} target={claimed == null ? nextPref.code : undefined} animate={claimed ?? undefined} label="日本地図" />
        </div>
        <div className="cl-reward-side">
          {claimed == null ? (
            <>
              <div className="cl-reward-ask">
                {fresh && <div>2しゅうめ! ちずが しろに もどったよ</div>}
                <div>
                  きょうは <b>どこ</b>を ぬるかな?
                </div>
                <div className="cl-reward-hint">ひかっている ところだよ</div>
              </div>
              <button className="cl-big" onClick={doClaim}>
                ちずを ぬる
              </button>
            </>
          ) : (
            <>
              {pref && <PrefCard pref={pref} />}
              <div className="cl-reward-no">
                {state.complete ? 'ぜんぶ ぬれた! コンプリート!' : `${state.filled.length} / ${PREF_COUNT} けん ぬれたよ`}
              </div>
              <button className="cl-big" onClick={onClose}>
                とじる
              </button>
            </>
          )}
        </div>
      </div>
      <BurstLayer bursts={bursts} />
    </div>
  );
}

// ---- 日本地図(ぬった県を見る) ----
export function MapBook({ onClose, highlight }: { onClose: () => void; highlight?: number }) {
  const { data } = useStore();
  const st = useMemo(() => mapState(data.mapLog), [data.mapLog]);
  const [sel, setSel] = useState<number | undefined>(highlight ?? st.filled[st.filled.length - 1]);
  const pref = sel != null ? prefByCode(sel) : undefined;
  return (
    <div className="cl-screen cl-book" role="dialog" aria-label="にほんちず">
      <div className="cl-head">
        <div className="cl-title">にほんちず</div>
        <button className="cl-small" onClick={onClose}>
          もどる
        </button>
      </div>
      <div className="cl-book-sum">
        ぬれた {st.filled.length} / {PREF_COUNT}　{st.round > 1 ? `(${st.round}しゅうめ)` : ''}
      </div>
      <div className="cl-book-body">
        <div className="cl-book-map">
          <JapanMap filled={st.filled} selected={sel} onPick={setSel} label="日本地図" />
        </div>
        <div className="cl-book-side">
          {st.filled.length === 0 && <div className="cl-teaser">チェックを ぜんぶ おわらせると、ほっかいどうから ぬれるよ</div>}
          {pref && <PrefCard pref={pref} />}
          <div className="cl-chips">
            {st.filled.map((c) => {
              const p = prefByCode(c)!;
              return (
                <button key={c} className={c === sel ? 'on' : ''} onClick={() => setSel(c)}>
                  {p.emoji} {p.name}
                </button>
              );
            })}
          </div>
          <div className="cl-credit">地図データ: @svg-maps/japan (CC BY 4.0)</div>
        </div>
      </div>
    </div>
  );
}
