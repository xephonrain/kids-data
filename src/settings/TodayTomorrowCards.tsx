import { useEffect, useState } from 'react';
import { Banner, Modal } from '../components/ui';
import { useStore } from '../data/store';
import { newId, nowIso } from '../defaults';
import { useNow } from '../hooks';
import { holidayName } from '../lib/holidays';
import { expiredOverrides, findPreset, resolvePreset, withDayOverride, type Resolution } from '../lib/presetResolver';
import { addDays, dateKey, formatDateJa, minutesToHHMM } from '../lib/time';
import { lengthOf, startFromNow } from '../lib/scheduleEdit';
import { sortedItems } from '../lib/schedule';
import type { Preset } from '../types';

const SOURCE_LABEL: Record<Resolution['source'], string> = {
  override: '臨時変更',
  holiday: '祝日の設定',
  weekday: '曜日の設定',
  default: 'デフォルト',
  none: '未設定',
};

/** 設定画面の上部に常時表示する「今日・明日のプリセット」 */
export function TodayTomorrowCards() {
  const { data, update } = useStore();
  const now = useNow(30_000);
  const today = dateKey(now);
  const tomorrow = addDays(today, 1);
  const [picking, setPicking] = useState<'today' | 'tomorrow' | null>(null);
  // 今日の変更の2段階目: 選んだプリセットの始め方
  const [startPick, setStartPick] = useState<{ preset: Preset; step: 'ask' | 'custom'; durations: Record<string, number> } | null>(null);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // 期限切れの「今日だけ・明日だけ」の変更は片付ける(翌々日以降に残らない)
  useEffect(() => {
    const stale = expiredOverrides(data.overrides, today).filter((o) => o.kind !== 'special');
    if (stale.length) update((d) => ({ ...d, overrides: d.overrides.filter((o) => !stale.some((s) => s.id === o.id)) }));
  }, [data.overrides, today, update]);

  const card = (kind: 'today' | 'tomorrow') => {
    const date = kind === 'today' ? today : tomorrow;
    const r = resolvePreset(date, data);
    const p = findPreset(data, r.presetId);
    const hol = holidayName(date);
    return (
      <div className={`daycard ${kind}`}>
        <h3>{kind === 'today' ? '今日のプリセット' : '明日のプリセット'}</h3>
        <div className="date">
          {formatDateJa(date)}
          {hol && <span className="tag ok" style={{ marginLeft: 8 }}>{hol}</span>}
        </div>
        <div className="pname">{p ? p.name : '(プリセットなし)'}</div>
        <div>
          <span className={`tag${r.source === 'override' ? ' special' : ''}`}>
            {r.source === 'override' ? (r.override?.kind === 'today' ? '今日だけの変更' : r.override?.kind === 'tomorrow' ? '明日だけの変更' : '特別な日の設定') : SOURCE_LABEL[r.source]}
          </span>
          {r.override?.customItems && r.override.customItems.length > 0 && <span className="tag special" style={{ marginLeft: 4 }}>今の時間から開始</span>}
          <span className="muted">{kind === 'today' ? (p ? '適用中' : '予定なし') : p ? 'この予定が適用されます' : ''}</span>
        </div>
        {r.conflicts.length > 0 && <div className="warn">⚠ 同じ日に別のプリセットを指す臨時変更が{r.conflicts.length}件あり、いちばん新しい設定を採用しています</div>}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn btn-sm btn-primary" onClick={() => setPicking(kind)}>
            {kind === 'today' ? '今日を変更' : '明日だけ変更'}
          </button>
        </div>
      </div>
    );
  };

  const choose = (kind: 'today' | 'tomorrow', presetId: string | null) => {
    const date = kind === 'today' ? today : tomorrow;
    update((d) => ({ ...d, overrides: withDayOverride(d.overrides, kind, date, presetId, newId(), nowIso()) }));
    setPicking(null);
  };

  const chooseToday = (presetId: string, customItems: import('../types').ScheduleItem[] | null) => {
    update((d) => ({ ...d, overrides: withDayOverride(d.overrides, 'today', today, presetId, newId(), nowIso(), customItems) }));
    setStartPick(null);
    setPicking(null);
  };

  const pickDate = picking === 'today' ? today : tomorrow;
  const current = picking ? data.overrides.find((o) => o.kind === picking && o.startDate === pickDate && o.endDate === pickDate) : null;
  const normal = picking ? findPreset(data, resolvePreset(pickDate, { ...data, overrides: data.overrides.filter((o) => o !== current) }).presetId) : null;

  return (
    <>
      <div className="st-cards">
        {card('today')}
        {card('tomorrow')}
      </div>
      {startPick && (() => {
        const items = sortedItems(startPick.preset);
        const asIs = startFromNow(items, nowMin);
        const custom = startFromNow(items, nowMin, startPick.durations);
        const choices = [5, 10, 15, 20, 30, 45, 60, 90, 120];
        return (
          <Modal
            title={`「${startPick.preset.name}」のはじめかた`}
            onClose={() => setStartPick(null)}
            footer={
              <>
                {startPick.step === 'custom' && (
                  <button className="btn btn-primary" onClick={() => chooseToday(startPick.preset.id, custom.items)}>
                    この長さで開始
                  </button>
                )}
                <button className="btn" onClick={() => (startPick.step === 'custom' ? setStartPick({ ...startPick, step: 'ask' }) : setStartPick(null))}>
                  もどる
                </button>
              </>
            }
          >
            {startPick.step === 'ask' ? (
              <div className="list">
                <button className="btn" style={{ textAlign: 'left' }} onClick={() => chooseToday(startPick.preset.id, null)}>
                  プリセットの時間で開始 <span className="hint">(プリセットに書かれた時刻のまま)</span>
                </button>
                <button
                  className="btn"
                  style={{ textAlign: 'left' }}
                  disabled={asIs.items.length === 0}
                  onClick={() => chooseToday(startPick.preset.id, asIs.items)}
                >
                  今の時間({minutesToHHMM(nowMin)})で開始・そのまま <span className="hint">(最初のやることが今から。長さはそのまま)</span>
                </button>
                <button className="btn" style={{ textAlign: 'left' }} disabled={items.length === 0} onClick={() => setStartPick({ ...startPick, step: 'custom' })}>
                  今の時間({minutesToHHMM(nowMin)})で開始・時間を変更 <span className="hint">(やることごとに長さをえらぶ)</span>
                </button>
                {(asIs.dropped > 0 || asIs.truncated) && <Banner kind="warn">今から始めると夜12時を超える分は、短くしたり除いたりされます。</Banner>}
              </div>
            ) : (
              <div className="list">
                <p className="muted">最初のやることは {minutesToHHMM(nowMin)} から。初期値はプリセットの長さです。</p>
                {items.map((it) => {
                  const cur = startPick.durations[it.id] ?? lengthOf(it);
                  const opts = Array.from(new Set([...choices, lengthOf(it)])).sort((a, b) => a - b);
                  const shown = custom.items.find((c) => c.id === it.id);
                  const act = it.kind === 'activity' ? data.activities.find((a) => a.id === it.activityId)?.name : it.free?.name;
                  return (
                    <div key={it.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <span>
                        {act ?? 'やること'}
                        <span className="hint"> {shown ? `${minutesToHHMM(shown.startMin)}〜${minutesToHHMM(shown.endMin)}` : '(24時を超えるため除外)'}</span>
                      </span>
                      <select aria-label={`${act ?? 'やること'}の長さ`} value={cur} onChange={(e) => setStartPick({ ...startPick, durations: { ...startPick.durations, [it.id]: Number(e.target.value) } })}>
                        {opts.map((m) => (
                          <option key={m} value={m}>
                            {m}分
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </Modal>
        );
      })()}
      {picking && !startPick && (
        <Modal
          title={picking === 'today' ? `今日(${formatDateJa(today)})のプリセットを変更` : `明日(${formatDateJa(tomorrow)})だけ別のプリセットにする`}
          onClose={() => setPicking(null)}
          footer={
            <>
              {current && (
                <button className="btn" onClick={() => choose(picking, null)}>
                  変更をやめて通常にもどす
                </button>
              )}
              <button className="btn" onClick={() => setPicking(null)}>
                閉じる
              </button>
            </>
          }
        >
          <Banner kind="info">
            {picking === 'today'
              ? '今日の残りの予定がえらんだプリセットに切り替わります。すでに終わった時間の活動はやり直しになりません。'
              : 'えらんだプリセットは明日だけに使われ、あさってからは いつもの設定にもどります。'}
            通常の曜日・祝日の設定は変わりません。
          </Banner>
          <p className="muted">通常は「{normal?.name ?? 'なし'}」です。</p>
          {data.presets.length === 0 && <Banner kind="warn">プリセットがありません。先に「プリセット」で作ってください。</Banner>}
          <div className="list">
            {data.presets.map((p) => (
              <button key={p.id} className="btn" style={{ textAlign: 'left', borderColor: current?.presetId === p.id ? '#6c63c9' : undefined, borderWidth: current?.presetId === p.id ? 2 : 1 }} onClick={() => (picking === 'today' ? setStartPick({ preset: p, step: 'ask', durations: {} }) : choose(picking, p.id))}>
                {p.name} <span className="hint">({p.items.length}件){current?.presetId === p.id ? ' ← いま選択中' : ''}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
