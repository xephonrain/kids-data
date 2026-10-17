import { useState } from 'react';
import { Banner, Confirm, Field, Modal } from '../components/ui';
import { useStore } from '../data/store';
import { newId } from '../defaults';
import { hhmmToMinutes, minutesToHHMM, WEEKDAY_NAMES } from '../lib/time';
import type { Checksheet } from '../types';

const blankSheet = (): Checksheet => ({ id: newId(), name: '', items: [], startMin: 6 * 60, endMin: 9 * 60, weekdays: [], rewardEnabled: true });

const whenText = (c: Checksheet) => `${c.weekdays.length === 0 || c.weekdays.length === 7 ? '毎日' : c.weekdays.map((w) => WEEKDAY_NAMES[w]).join('')} ・ ${minutesToHHMM(c.startMin)}〜${minutesToHHMM(c.endMin)}`;

export function ChecksheetSection() {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<{ draft: Checksheet; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Checksheet | null>(null);

  return (
    <div className="panel">
      <h2>チェックシート</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        「あさの じゅんび」のように、子どもが1つずつチェックしていく表です。決めた時間帯だけ、メイン画面にボタンが出ます。全部チェックできると、シールがもらえます。
      </p>
      <div className="row-end" style={{ marginTop: 0, marginBottom: 10 }}>
        <button className="btn btn-primary" onClick={() => setEditing({ draft: blankSheet(), isNew: true })}>
          ＋ チェックシートを作る
        </button>
      </div>
      {data.checksheets.length === 0 && <Banner kind="info">まだチェックシートがありません。</Banner>}
      {data.checksheets.length > 0 && data.stickers.length === 0 && <Banner kind="warn">ごほうびのシールが1まいもありません。「シール」タブで画像を登録すると、全部できたときにもらえます。</Banner>}
      <div className="list">
        {data.checksheets.map((c) => (
          <div key={c.id} className="list-item">
            <div className="name">
              {c.name || '(名前なし)'}
              <div className="hint">
                {c.items.length}こ ・ {whenText(c)}
                {c.rewardEnabled ? ' ・ ごほうびあり' : ''}
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => setEditing({ draft: structuredClone(c), isNew: false })}>
              編集
            </button>
            <button className="btn btn-sm" onClick={() => setDeleting(c)}>
              削除
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <SheetEditor
          initial={editing.draft}
          onCancel={() => setEditing(null)}
          onSave={(c) => {
            update((d) => ({ ...d, checksheets: editing.isNew ? [...d.checksheets, c] : d.checksheets.map((x) => (x.id === c.id ? c : x)) }));
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <Confirm
          title="チェックシートを削除しますか？"
          danger
          confirmLabel="削除する"
          message={<p>「{deleting.name}」を削除します。もらったシールの記録は残ります。</p>}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            update((d) => ({ ...d, checksheets: d.checksheets.filter((x) => x.id !== deleting.id) }));
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function SheetEditor({ initial, onSave, onCancel }: { initial: Checksheet; onSave: (c: Checksheet) => void; onCancel: () => void }) {
  const { data } = useStore();
  const [c, setC] = useState<Checksheet>(initial);
  const [start, setStart] = useState(minutesToHHMM(initial.startMin));
  const [end, setEnd] = useState(minutesToHHMM(initial.endMin));
  const [newName, setNewName] = useState('');
  const [pick, setPick] = useState('');

  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  const err = !c.name.trim() ? '名前を入れてください' : c.items.length === 0 ? '項目を1つ以上入れてください' : s === null || e === null ? '時間を「6:30」の形で入れてください' : e <= s ? '終わりの時間は、はじまりより後にしてください' : null;

  const move = (i: number, dir: -1 | 1) =>
    setC((x) => {
      const items = [...x.items];
      const j = i + dir;
      if (j < 0 || j >= items.length) return x;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...x, items };
    });

  return (
    <Modal
      title={initial.name ? 'チェックシートの編集' : 'チェックシートを作る'}
      onClose={onCancel}
      wide
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            キャンセル
          </button>
          <button className="btn btn-primary" disabled={!!err} onClick={() => onSave({ ...c, name: c.name.trim(), startMin: s as number, endMin: e as number })}>
            保存
          </button>
        </>
      }
    >
      <Field label="シートの名前">
        <input type="text" value={c.name} onChange={(ev) => setC({ ...c, name: ev.target.value })} placeholder="あさの じゅんび" />
      </Field>
      <div className="row">
        <Field label="表示をはじめる時間">
          <input type="text" inputMode="numeric" value={start} onChange={(ev) => setStart(ev.target.value)} placeholder="6:30" style={{ width: 110 }} />
        </Field>
        <Field label="表示を終わる時間">
          <input type="text" inputMode="numeric" value={end} onChange={(ev) => setEnd(ev.target.value)} placeholder="8:00" style={{ width: 110 }} />
        </Field>
      </div>
      <Field label="曜日(選ばなければ毎日)">
        <div className="row">
          {WEEKDAY_NAMES.map((n, w) => (
            <label key={w} className="check">
              <input
                type="checkbox"
                checked={c.weekdays.includes(w)}
                onChange={(ev) => setC({ ...c, weekdays: ev.target.checked ? [...c.weekdays, w].sort() : c.weekdays.filter((x) => x !== w) })}
              />
              {n}
            </label>
          ))}
        </div>
      </Field>

      <h3>チェックする項目(上から順番)</h3>
      <div className="list">
        {c.items.map((it, i) => (
          <div key={it.id} className="list-item">
            <div className="name">
              {it.name}
              <div className="hint">{it.activityId ? '「やること」から(画像も使います)' : 'このシートだけ'}</div>
            </div>
            <button className="btn btn-sm" aria-label={`${it.name}を上へ`} disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button className="btn btn-sm" aria-label={`${it.name}を下へ`} disabled={i === c.items.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button className="btn btn-sm" onClick={() => setC({ ...c, items: c.items.filter((x) => x.id !== it.id) })}>
              削除
            </button>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <select aria-label="やることから追加" value={pick} onChange={(ev) => setPick(ev.target.value)}>
          <option value="">「やること」から選ぶ…</option>
          {data.activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          className="btn btn-sm"
          disabled={!pick}
          onClick={() => {
            const a = data.activities.find((x) => x.id === pick);
            if (a) setC({ ...c, items: [...c.items, { id: newId(), name: a.name, activityId: a.id }] });
            setPick('');
          }}
        >
          追加
        </button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input type="text" aria-label="新しい項目の名前" value={newName} onChange={(ev) => setNewName(ev.target.value)} placeholder="新しく作る(例: もちものを もつ)" />
        <button
          className="btn btn-sm"
          disabled={!newName.trim()}
          onClick={() => {
            setC({ ...c, items: [...c.items, { id: newId(), name: newName.trim(), activityId: null }] });
            setNewName('');
          }}
        >
          追加
        </button>
      </div>

      <label className="check" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={c.rewardEnabled} onChange={(ev) => setC({ ...c, rewardEnabled: ev.target.checked })} />
        ぜんぶ できたら シールを出す
      </label>
      {err && <Banner kind="warn">{err}</Banner>}
    </Modal>
  );
}
