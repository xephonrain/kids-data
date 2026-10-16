import { useEffect, useState } from 'react';
import { Banner, Modal } from '../components/ui';
import { useStore } from '../data/store';
import { newId, nowIso } from '../defaults';
import { useNow } from '../hooks';
import { holidayName } from '../lib/holidays';
import { expiredOverrides, findPreset, resolvePreset, withDayOverride, type Resolution } from '../lib/presetResolver';
import { addDays, dateKey, formatDateJa } from '../lib/time';

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
          <span className="muted">{kind === 'today' ? (p ? '適用中' : '予定は表示されません') : p ? 'この予定が適用されます' : ''}</span>
        </div>
        {r.conflicts.length > 0 && <div className="warn">⚠ 同じ日に別のプリセットを指す臨時変更が{r.conflicts.length}件あり、いちばん新しい設定を採用しています</div>}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn btn-sm btn-primary" onClick={() => setPicking(kind)}>
            {kind === 'today' ? '今日のプリセットを変更' : '明日だけ変更'}
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

  const pickDate = picking === 'today' ? today : tomorrow;
  const current = picking ? data.overrides.find((o) => o.kind === picking && o.startDate === pickDate && o.endDate === pickDate) : null;
  const normal = picking ? findPreset(data, resolvePreset(pickDate, { ...data, overrides: data.overrides.filter((o) => o !== current) }).presetId) : null;

  return (
    <>
      <div className="st-cards">
        {card('today')}
        {card('tomorrow')}
      </div>
      {picking && (
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
              <button key={p.id} className="btn" style={{ textAlign: 'left', borderColor: current?.presetId === p.id ? '#6c63c9' : undefined, borderWidth: current?.presetId === p.id ? 2 : 1 }} onClick={() => choose(picking, p.id)}>
                {p.name} <span className="hint">({p.items.length}件){current?.presetId === p.id ? ' ← いま選択中' : ''}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
