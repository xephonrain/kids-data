// 子ども向け: チェックシート / ごほうび / シール帳。チェックするたびに、演出と効果音をランダムに組み合わせて出す。

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { loadCheckDay, saveCheckDay } from '../data/localCache';
import { useStore } from '../data/store';
import { newId } from '../defaults';
import { checkedIds, currentItemId, ensureCheckDay, isAllDone, nextStickerNumber, pickDifferent, pickSticker, stickerCounts, stickerDisplay, toggleCheck, type CheckDay } from '../lib/checklist';
import { CHECK_SOUNDS, playSound } from '../lib/sound';
import { dateKey } from '../lib/time';
import type { Checksheet } from '../types';
import { ImageFrame } from './ImageFrame';

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
      return { emoji: set[Math.floor(Math.random() * set.length)], dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist - 6, rot: r(-60, 60), size: r(4, 8), delay: r(0, 0.15) };
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
    setTimeout(() => setBursts((b) => b.filter((q) => q.id !== id)), 2000);
  }, []);
  return { bursts, add };
}

// ---- チェックシート ----
export function ChecklistScreen({ sheets, onClose, onOpenBook }: { sheets: Checksheet[]; onClose: () => void; onOpenBook: (highlight?: string) => void }) {
  const { data, record } = useStore();
  const today = dateKey(new Date());
  const [day, setDay] = useState<CheckDay>(() => loadCheckDay(today));
  const [sheetId, setSheetId] = useState(sheets[0]?.id ?? '');
  const [rewardFor, setRewardFor] = useState<string | null>(null);
  const [fx, setFx] = useState<{ id: string; cls: string; n: number } | null>(null);
  const { bursts, add } = useBursts();
  const lastSound = useRef(-1);
  const lastSet = useRef(-1);
  const lastFx = useRef(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const sheet = sheets.find((s) => s.id === sheetId) ?? sheets[0];
  const cur = ensureCheckDay(day, today);

  const commit = (next: CheckDay) => {
    setDay(next);
    saveCheckDay(next);
  };

  if (!sheet) return null;
  const done = new Set(checkedIds(cur, sheet));
  const currentId = currentItemId(cur, sheet);
  const all = isAllDone(cur, sheet);
  const reward = cur.reward[sheet.id];
  const claimed = reward?.claimed === true;
  const canReward = sheet.rewardEnabled && data.stickers.length > 0;

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
      const st = pickSticker(data.stickers, data.stickerLog, Math.random());
      if (st) {
        next = { ...next, reward: { ...next.reward, [sheet.id]: { stickerId: st.id, claimed: false } } };
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setRewardFor(sheet.id), 1100);
      }
    } else if (!nowAll && next.reward[sheet.id] && !next.reward[sheet.id].claimed) {
      const { [sheet.id]: _drop, ...rest } = next.reward;
      next = { ...next, reward: rest };
      clearTimeout(timer.current);
    }
    commit(next);
  };

  const rewardSheet = rewardFor ? sheets.find((s) => s.id === rewardFor) : null;
  const rewardInfo = rewardSheet ? cur.reward[rewardSheet.id] : null;
  const rewardSticker = rewardInfo ? data.stickers.find((s) => s.id === rewardInfo.stickerId) : null;

  const claim = () => {
    if (!rewardSheet || !rewardInfo || !rewardSticker) return;
    record((d) => ({ ...d, stickerLog: [...d.stickerLog, { id: newId(), stickerId: rewardSticker.id, sheetId: rewardSheet.id, dateKey: today, at: new Date().toISOString() }] }));
    commit({ ...cur, reward: { ...cur.reward, [rewardSheet.id]: { ...rewardInfo, claimed: true } } });
    if (data.settings.soundEffect) playSound('sticker');
    setRewardFor(null);
    onOpenBook(rewardSticker.id);
  };

  return (
    <div className="cl-screen" role="dialog" aria-label="チェックシート">
      <div className="cl-head">
        <div className="cl-title">{sheet.name}</div>
        <button className="cl-small" onClick={onClose}>
          もどる
        </button>
      </div>
      {sheets.length > 1 && (
        <div className="cl-tabs" role="tablist">
          {sheets.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === sheet.id} className={s.id === sheet.id ? 'on' : ''} onClick={() => setSheetId(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="cl-stars" role="img" aria-label={`${sheet.items.length}つのうち${done.size}つできた`}>
        {sheet.items.map((it) => (
          <svg key={it.id} viewBox="0 0 24 24" aria-hidden="true">
            <polygon points="12,2 15,9 22,9.5 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9.5 9,9" fill={done.has(it.id) ? '#f5b700' : '#ffffff'} stroke={done.has(it.id) ? '#d99a00' : '#c9c4e6'} strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        ))}
      </div>
      <div className="cl-rows">
        {sheet.items.map((it) => {
          const act = it.activityId ? data.activities.find((a) => a.id === it.activityId) : null;
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
                <ImageFrame display={act ? { ...act, borderWidth: 5 } : null} fallbackText={it.name.slice(0, 3)} />
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
          <div className="cl-teaser">ぜんぶ できたら シールが もらえるよ</div>
        ) : null}
        {data.stickers.length > 0 && (
          <button className="cl-small" onClick={() => onOpenBook()}>
            シールちょうを みる
          </button>
        )}
      </div>
      <BurstLayer bursts={bursts} />
      {rewardSheet && rewardSticker && (
        <RewardCard stickerId={rewardSticker.id} number={nextStickerNumber(data.stickerLog)} onClaim={claim} />
      )}
    </div>
  );
}

// ---- ごほうび ----
function RewardCard({ stickerId, number, onClaim }: { stickerId: string; number: number; onClaim: () => void }) {
  const { data } = useStore();
  const st = data.stickers.find((s) => s.id === stickerId);
  const { bursts, add } = useBursts();
  useEffect(() => {
    if (data.settings.soundEffect) playSound('done');
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ids = [0, 350, 700].map((d, i) => setTimeout(() => add(w * (0.25 + 0.25 * i), h * 0.3, EMOJI_SETS[(i * 2 + Math.floor(Math.random() * 2)) % EMOJI_SETS.length]), d));
    return () => ids.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!st) return null;
  return (
    <div className="cl-reward" role="dialog" aria-label="ごほうび">
      <div className="cl-reward-banner">ぜんぶ できたね!</div>
      <div className="cl-reward-card">
        <div className="cl-reward-img">
          <ImageFrame display={stickerDisplay(st.imagePath)} fallbackText="シール" />
        </div>
        {st.name && <div className="cl-reward-name">{st.name}</div>}
        <div className="cl-reward-no">シールちょうの {number}まいめ</div>
      </div>
      <button className="cl-big" onClick={onClaim}>
        シールちょうに はる
      </button>
      <BurstLayer bursts={bursts} />
    </div>
  );
}

// ---- シール帳 ----
export function StickerBook({ onClose, highlight }: { onClose: () => void; highlight?: string }) {
  const { data } = useStore();
  const counts = useMemo(() => stickerCounts(data), [data]);
  const got = data.stickers.filter((s) => counts.has(s.id)).length;
  return (
    <div className="cl-screen cl-book" role="dialog" aria-label="シールちょう">
      <div className="cl-head">
        <div className="cl-title">シールちょう</div>
        <button className="cl-small" onClick={onClose}>
          もどる
        </button>
      </div>
      <div className="cl-book-sum">
        あつめた {got} / {data.stickers.length}　(はったシール {data.stickerLog.length}まい)
      </div>
      <div className="cl-book-grid">
        {data.stickers.map((s) => {
          const n = counts.get(s.id) ?? 0;
          return (
            <div key={s.id} className={`cl-sticker${n ? '' : ' locked'}${highlight === s.id ? ' new' : ''}`} data-got={n ? '1' : '0'}>
              <div className="cl-sticker-img">
                <ImageFrame display={stickerDisplay(s.imagePath)} fallbackText="?" panelColor="transparent" />
                {n > 1 && <span className="cl-count">×{n}</span>}
              </div>
              <div className="cl-sticker-name">{n ? s.name || ' ' : '?'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
