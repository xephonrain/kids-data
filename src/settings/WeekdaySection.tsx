import { useMemo, useState } from 'react';
import { Banner, Field } from '../components/ui';
import { useStore } from '../data/store';
import { newId, nowIso } from '../defaults';
import { useNow } from '../hooks';
import { HOLIDAY_MAX_YEAR, holidaysOfYear } from '../lib/holidays';
import { findOverrideConflicts, findPreset, resolvePreset } from '../lib/presetResolver';
import { WEEKDAY_NAMES, addDays, dateKey, formatDateJa } from '../lib/time';
import type { DateOverride } from '../types';

export function WeekdaySection() {
  const { data, update } = useStore();
  const now = useNow(60_000);
  const today = dateKey(now);
  const s = data.settings;
  const options = (
    <>
      <option value="">(なし)</option>
      {data.presets.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </>
  );
  const setSettings = (patch: Partial<typeof s>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  const specials = data.overrides.filter((o) => o.kind === 'special').sort((a, b) => a.startDate.localeCompare(b.startDate));
  const conflicts = findOverrideConflicts(data.overrides);

  const [start, setStart] = useState(addDays(today, 7));
  const [end, setEnd] = useState(addDays(today, 7));
  const [pid, setPid] = useState('');
  const [label, setLabel] = useState('');
  const dateErr = end < start ? '終了日が開始日より前になっています' : null;

  const addSpecial = () => {
    if (!pid || dateErr) return;
    const t = nowIso();
    const o: DateOverride = { id: newId(), kind: 'special', startDate: start, endDate: end, presetId: pid, label: label.trim(), createdAt: t, updatedAt: t, version: 0 };
    update((d) => ({ ...d, overrides: [...d.overrides, o] }));
    setLabel('');
  };

  const upcoming = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);
  const holidays = useMemo(() => {
    const y = Number(today.slice(0, 4));
    const out: [string, string][] = [];
    for (const yy of [y, y + 1]) if (yy <= HOLIDAY_MAX_YEAR) holidaysOfYear(yy).forEach((name, d) => d >= today && out.push([d, name]));
    return out.sort((a, b) => a[0].localeCompare(b[0])).slice(0, 8);
  }, [today]);

  return (
    <div className="panel">
      <h2>曜日・祝日の設定</h2>
      <Banner kind="info">
        使うプリセットは、次の優先順位で決まります: ①日付を指定した臨時変更(明日だけの変更・特別な日) → ②祝日 → ③曜日 → ④デフォルト
      </Banner>

      <h3>曜日ごとのプリセット</h3>
      <div className="two-col">
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
          <Field key={wd} label={`${WEEKDAY_NAMES[wd]}曜日`}>
            <select
              value={s.weekdayPresets[wd] ?? ''}
              onChange={(e) => {
                const arr = [...s.weekdayPresets];
                arr[wd] = e.target.value || null;
                setSettings({ weekdayPresets: arr });
              }}
            >
              {options}
            </select>
          </Field>
        ))}
      </div>

      <h3>祝日・デフォルト</h3>
      <div className="two-col">
        <Field label="祝日に使うプリセット" hint="日本の祝日(振替休日・国民の休日を含む)を自動で判定します。">
          <select value={s.holidayPresetId ?? ''} onChange={(e) => setSettings({ holidayPresetId: e.target.value || null })}>
            {options}
          </select>
        </Field>
        <Field label="通常のデフォルト" hint="どの設定にも当てはまらない日に使います。">
          <select value={s.defaultPresetId ?? ''} onChange={(e) => setSettings({ defaultPresetId: e.target.value || null })}>
            {options}
          </select>
        </Field>
      </div>
      <p className="hint">これからの祝日: {holidays.map(([d, n]) => `${formatDateJa(d)} ${n}`).join(' / ') || '(2000〜2099年の範囲外)'}</p>

      <h3>特別な日(日付を指定)</h3>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="開始日">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="終了日(1日だけなら同じ日)">
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="プリセット">
          <select value={pid} onChange={(e) => setPid(e.target.value)}>
            <option value="">えらんでください</option>
            {data.presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="メモ(任意)">
          <input type="text" value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} placeholder="例: 運動会" />
        </Field>
        <button className="btn btn-primary" style={{ marginBottom: 12 }} disabled={!pid || !!dateErr || !start || !end} onClick={addSpecial}>
          追加
        </button>
      </div>
      {dateErr && <Banner kind="error">{dateErr}</Banner>}
      <div className="list">
        {specials.length === 0 && <p className="muted">特別な日はまだありません。</p>}
        {specials.map((o) => (
          <div key={o.id} className="list-item">
            <span className="tag special">{o.startDate === o.endDate ? formatDateJa(o.startDate) : `${formatDateJa(o.startDate)}〜${formatDateJa(o.endDate)}`}</span>
            <div className="name">
              {findPreset(data, o.presetId)?.name ?? '(削除されたプリセット)'} {o.label && <span className="hint">{o.label}</span>}
              {o.endDate < today && <span className="hint"> (終了済み)</span>}
            </div>
            <button className="btn btn-sm" onClick={() => update((d) => ({ ...d, overrides: d.overrides.filter((x) => x.id !== o.id) }))}>
              削除
            </button>
          </div>
        ))}
      </div>
      {conflicts.length > 0 && (
        <Banner kind="warn">
          ⚠ 期間が重なっていて、別のプリセットを指す臨時変更があります。重なった日は「いちばん新しく変更した設定」が使われます:
          <br />
          {conflicts.map(([a, b]) => `${a.startDate}${a.endDate !== a.startDate ? `〜${a.endDate}` : ''}(${findPreset(data, a.presetId)?.name}) と ${b.startDate}${b.endDate !== b.startDate ? `〜${b.endDate}` : ''}(${findPreset(data, b.presetId)?.name})`).join(' / ')}
        </Banner>
      )}

      <h3>これから2週間の予定(確認用)</h3>
      <table className="table">
        <tbody>
          {upcoming.map((d) => {
            const r = resolvePreset(d, data);
            return (
              <tr key={d}>
                <td>{formatDateJa(d)}</td>
                <td>
                  <strong>{findPreset(data, r.presetId)?.name ?? '(なし)'}</strong>
                </td>
                <td className="hint">{{ override: '臨時変更', holiday: '祝日', weekday: '曜日', default: 'デフォルト', none: '' }[r.source]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
