import { useMemo, useState } from 'react';
import { Banner, Confirm, Field, Modal } from '../components/ui';
import { useStore } from '../data/store';
import { defaultImageDisplay, newId, nowIso } from '../defaults';
import { hhmmToMinutes, minutesToHHMM, pad2 } from '../lib/time';
import { sortedItems } from '../lib/schedule';
import { setEnd, setStart } from '../lib/scheduleEdit';
import { hasErrors, validateItems } from '../lib/validate';
import type { Activity, FlashSetting, Preset, ScheduleItem, SwitchMode, SwitchModeSetting } from '../types';
import { ImageEditor } from './ImageEditor';
import { PresetSimulator } from './PresetSimulator';

function newPreset(name: string): Preset {
  const t = nowIso();
  return { id: newId(), name, defaultSwitchMode: 'auto', items: [], createdAt: t, updatedAt: t, version: 0 };
}

function itemLabel(it: ScheduleItem, activities: Activity[]): string {
  return it.kind === 'free' ? `${it.free?.name || '(名前なし)'}(設定外)` : (activities.find((a) => a.id === it.activityId)?.name ?? '(削除された活動)');
}

export function PresetsSection() {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<{ draft: Preset; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Preset | null>(null);
  const [creating, setCreating] = useState(false);
  const [simulating, setSimulating] = useState<Preset | null>(null);
  const [newName, setNewName] = useState('');

  const duplicate = (p: Preset) => {
    const t = nowIso();
    const copy: Preset = {
      ...structuredClone(p),
      id: newId(),
      name: `${p.name} のコピー`.slice(0, 60),
      items: p.items.map((i) => ({ ...structuredClone(i), id: newId() })),
      createdAt: t,
      updatedAt: t,
      version: 0,
    };
    update((d) => ({ ...d, presets: [...d.presets, copy] }));
  };

  const doDelete = (p: Preset) => {
    update((d) => ({
      ...d,
      presets: d.presets.filter((x) => x.id !== p.id),
      overrides: d.overrides.filter((o) => o.presetId !== p.id),
      settings: {
        ...d.settings,
        weekdayPresets: d.settings.weekdayPresets.map((id) => (id === p.id ? null : id)),
        holidayPresetId: d.settings.holidayPresetId === p.id ? null : d.settings.holidayPresetId,
        defaultPresetId: d.settings.defaultPresetId === p.id ? null : d.settings.defaultPresetId,
      },
    }));
    setDeleting(null);
  };

  const refs = (p: Preset) => {
    const s = data.settings;
    const out: string[] = [];
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    s.weekdayPresets.forEach((id, i) => id === p.id && out.push(`${days[i]}曜日の設定`));
    if (s.holidayPresetId === p.id) out.push('祝日の設定');
    if (s.defaultPresetId === p.id) out.push('通常のデフォルト');
    const o = data.overrides.filter((x) => x.presetId === p.id).length;
    if (o) out.push(`日付指定の臨時変更 ${o}件`);
    return out;
  };

  return (
    <div className="panel">
      <h2>プリセット管理</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        プリセットは「1日分の時間割」です。「いつもの平日」「休日」「おでかけの日」など、いくつでも作れます。
      </p>
      <div className="row-end" style={{ marginTop: 0, marginBottom: 10 }}>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          ＋ 新しいプリセット
        </button>
      </div>
      {data.presets.length === 0 && <Banner kind="info">まだプリセットがありません。先に「やることの設定」で活動を登録してから、プリセットを作ると便利です。</Banner>}
      <div className="list">
        {data.presets.map((p) => (
          <div key={p.id} className="list-item" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="name" style={{ minWidth: 200 }}>
              {p.name}
              <div className="hint">{p.items.length}件の予定</div>
              <Timeline items={p.items} activities={data.activities} />
            </div>
            <div className="row">
              <button className="btn btn-sm" onClick={() => setEditing({ draft: structuredClone(p), isNew: false })}>
                編集
              </button>
              <button className="btn btn-sm" onClick={() => setSimulating(p)}>
                動作確認
              </button>
              <button className="btn btn-sm" onClick={() => duplicate(p)}>
                複製
              </button>
              <button className="btn btn-sm" onClick={() => setDeleting(p)}>
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      {creating && (
        <Modal
          title="新しいプリセット"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreating(false)}>
                キャンセル
              </button>
              <button
                className="btn btn-primary"
                disabled={!newName.trim()}
                onClick={() => {
                  setCreating(false);
                  setEditing({ draft: newPreset(newName.trim()), isNew: true });
                  setNewName('');
                }}
              >
                つくる
              </button>
            </>
          }
        >
          <Field label="プリセットの名前">
            <input type="text" className="grow" value={newName} maxLength={60} autoFocus onChange={(e) => setNewName(e.target.value)} placeholder="例: いつもの平日" />
          </Field>
        </Modal>
      )}

      {editing && (
        <PresetEditor
          initial={editing.draft}
          isNew={editing.isNew}
          onCancel={() => setEditing(null)}
          onSave={(p) => {
            update((d) => ({ ...d, presets: editing.isNew ? [...d.presets, p] : d.presets.map((x) => (x.id === p.id ? p : x)) }));
            setEditing(null);
          }}
        />
      )}

      {simulating && <PresetSimulator preset={simulating} onClose={() => setSimulating(null)} />}
      {deleting && (
        <Confirm
          title="プリセットを削除しますか？"
          danger
          confirmLabel="削除する"
          onCancel={() => setDeleting(null)}
          onConfirm={() => doDelete(deleting)}
          message={
            <>
              <p>「{deleting.name}」(予定{deleting.items.length}件)を削除します。元に戻せません。</p>
              {refs(deleting).length > 0 && (
                <Banner kind="warn">
                  このプリセットを使っている次の設定は解除されます: {refs(deleting).join('、')}
                </Banner>
              )}
            </>
          }
        />
      )}
    </div>
  );
}

/** 0:00〜24:00の帯で時間割を確認する */
function Timeline({ items, activities }: { items: ScheduleItem[]; activities: Activity[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ position: 'relative', height: 14, background: '#f0eefb', borderRadius: 7, marginTop: 6, overflow: 'hidden', maxWidth: 420 }} aria-hidden>
      {items.map((it) => (
        <div
          key={it.id}
          title={`${minutesToHHMM(it.startMin)}〜${minutesToHHMM(it.endMin)} ${itemLabel(it, activities)}`}
          style={{ position: 'absolute', left: `${(it.startMin / 1440) * 100}%`, width: `${((it.endMin - it.startMin) / 1440) * 100}%`, top: 0, bottom: 0, background: it.kind === 'free' ? '#f2b94b' : '#6fbf9a', borderRight: '1px solid #fff' }}
        />
      ))}
    </div>
  );
}

function TimeInput({ minutes, onChange, allow24, label }: { minutes: number; onChange: (m: number) => void; allow24?: boolean; label: string }) {
  const is24 = minutes === 1440;
  return (
    <span className="row" style={{ gap: 6 }}>
      <input
        type="time"
        step={60}
        aria-label={label}
        disabled={is24}
        value={is24 ? '' : `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`}
        onChange={(e) => {
          const m = hhmmToMinutes(e.target.value);
          if (m !== null) onChange(m);
        }}
      />
      {allow24 && (
        <label className="unit" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={is24} onChange={(e) => onChange(e.target.checked ? 1440 : 1439)} /> 24:00まで
        </label>
      )}
    </span>
  );
}

const itemKey = (it: ScheduleItem) => JSON.stringify(it);

function PresetEditor({ initial, isNew, onSave, onCancel }: { initial: Preset; isNew: boolean; onSave: (p: Preset) => void; onCancel: () => void }) {
  const { data, userId } = useStore();
  const [p, setP] = useState<Preset>(() => ({ ...initial, items: sortedItems(initial) }));
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [freeEdit, setFreeEdit] = useState<string | null>(null);
  const [cascade, setCascade] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);

  const dirty = JSON.stringify({ ...p, items: sortedItems(p) }) !== JSON.stringify({ ...initial, items: sortedItems(initial) });
  const issues = useMemo(() => validateItems(p.items, data.activities), [p.items, data.activities]);
  const errors = hasErrors(issues);
  const nameOk = p.name.trim().length > 0;
  const sorted = sortedItems(p);

  const setItem = (id: string, patch: Partial<ScheduleItem>) => setP((x) => ({ ...x, items: x.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

  const editTime = (id: string, which: 'start' | 'end', m: number) => {
    const r = (which === 'start' ? setStart : setEnd)(p.items, id, m, cascade);
    setP((x) => ({ ...x, items: r.items }));
    setNotes(r.notes);
  };

  const addItem = (kind: 'activity' | 'free') => {
    const last = sorted.length ? sorted[sorted.length - 1].endMin : 8 * 60;
    const start = Math.min(last, 1410);
    const end = Math.min(start + 30, 1440);
    const first = data.activities[0];
    const it: ScheduleItem = {
      id: newId(),
      startMin: start,
      endMin: end,
      kind: kind === 'activity' && first ? 'activity' : 'free',
      activityId: kind === 'activity' && first ? first.id : null,
      free: kind === 'activity' && first ? null : { ...defaultImageDisplay(), name: 'じゆうじかん', borderColor: data.theme.colors.illustrationFrame.color },
      flash: 'inherit',
      flashMinutes: null,
      switchMode: 'inherit',
    };
    setP((x) => ({ ...x, items: [...x.items, it] }));
  };

  /** 並び替え: 隣の枠と「中身」を入れ替える(時刻の枠は動かさない) */
  const move = (idx: number, dir: -1 | 1) => {
    const a = sorted[idx];
    const b = sorted[idx + dir];
    if (!b) return;
    const content = (i: ScheduleItem) => ({ kind: i.kind, activityId: i.activityId, free: i.free, flash: i.flash, flashMinutes: i.flashMinutes, switchMode: i.switchMode });
    setP((x) => ({ ...x, items: x.items.map((i) => (i.id === a.id ? { ...i, ...content(b) } : i.id === b.id ? { ...i, ...content(a) } : i)) }));
  };

  const changes = useMemo(() => {
    const before = new Map(initial.items.map((i) => [i.id, itemKey(i)]));
    const after = new Map(p.items.map((i) => [i.id, itemKey(i)]));
    let added = 0;
    let removed = 0;
    let changed = 0;
    after.forEach((k, id) => (!before.has(id) ? added++ : before.get(id) !== k ? changed++ : 0));
    before.forEach((_k, id) => !after.has(id) && removed++);
    return { added, removed, changed };
  }, [initial.items, p.items]);

  const tryCancel = () => (dirty ? setConfirmCancel(true) : onCancel());
  const freeItem = freeEdit ? p.items.find((i) => i.id === freeEdit) : null;

  return (
    <Modal
      wide
      title={isNew ? `「${p.name}」を作る` : `「${initial.name}」を編集`}
      onClose={tryCancel}
      footer={
        <>
          <button className="btn" disabled={errors || p.items.length === 0} onClick={() => setSimulating(true)} style={{ marginRight: 'auto' }}>
            動作確認
          </button>
          <button className="btn" onClick={tryCancel}>
            キャンセル
          </button>
          <button className="btn btn-primary" disabled={errors || !nameOk || (!dirty && !isNew)} onClick={() => setConfirmSave(true)}>
            保存
          </button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 8 }}>
        <Field label="プリセット名(名前変更)">
          <input type="text" value={p.name} maxLength={60} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </Field>
        <Field label="終了時の切り替え(このプリセットの初期値)">
          <select value={p.defaultSwitchMode} onChange={(e) => setP({ ...p, defaultSwitchMode: e.target.value as SwitchMode })}>
            <option value="auto">自動で切り替え(終了時刻になったら次へ)</option>
            <option value="manual">おわったよで切り替え(ボタンを押すまで次へ行かない)</option>
          </select>
        </Field>
      </div>

      <Timeline items={p.items} activities={data.activities} />
      <h3>時間割</h3>

      {issues.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {issues.map((i, n) => (
            <Banner key={n} kind={i.level === 'error' ? 'error' : 'warn'}>
              {i.level === 'error' ? '⛔ ' : '⚠ '}
              {i.message}
            </Banner>
          ))}
        </div>
      )}

      <label className="row" style={{ marginBottom: 8, gap: 8 }}>
        <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />
        <span>時刻を変えたら、以降のやることも同じ分だけ自動でずらす(長さは変わりません)</span>
      </label>
      {notes.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {notes.map((n, i) => (
            <Banner key={i} kind="warn">{n}</Banner>
          ))}
        </div>
      )}
      <div className="list">
        {sorted.map((it, idx) => {
          const bad = issues.some((x) => x.itemId === it.id && x.level === 'error');
          return (
            <div key={it.id} className={`sched-row${bad ? ' bad' : ''}`}>
              <div className="times">
                <TimeInput label="開始時刻" minutes={it.startMin} onChange={(m) => editTime(it.id, 'start', m)} />
                <span>〜</span>
                <TimeInput label="終了時刻" minutes={it.endMin} allow24 onChange={(m) => editTime(it.id, 'end', m)} />
              </div>
              <div className="row">
                <select
                  aria-label="活動"
                  value={it.kind === 'free' ? '__free' : (it.activityId ?? '')}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__free') setItem(it.id, { kind: 'free', activityId: null, free: it.free ?? { ...defaultImageDisplay(), name: 'じゆうじかん', borderColor: data.theme.colors.illustrationFrame.color } });
                    else setItem(it.id, { kind: 'activity', activityId: v, free: null });
                  }}
                >
                  {it.kind === 'activity' && !data.activities.some((a) => a.id === it.activityId) && <option value={it.activityId ?? ''}>(削除された活動)</option>}
                  {data.activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  <option value="__free">設定外の表示(自由な表示)</option>
                </select>
                {it.kind === 'free' && it.free && (
                  <>
                    <input type="text" aria-label="表示名" value={it.free.name} maxLength={60} onChange={(e) => setItem(it.id, { free: { ...it.free!, name: e.target.value } })} placeholder="例: じゆうじかん" />
                    <button className="btn btn-sm" type="button" onClick={() => setFreeEdit(it.id)}>
                      画像・形の設定
                    </button>
                  </>
                )}
              </div>
              <div className="opts">
                <label className="unit">
                  点滅{' '}
                  <select value={it.flash} onChange={(e) => setItem(it.id, { flash: e.target.value as FlashSetting })}>
                    <option value="inherit">活動の設定に合わせる</option>
                    <option value="on">オン</option>
                    <option value="off">オフ</option>
                  </select>
                </label>
                {it.flash !== 'off' && (
                  <label className="unit">
                    終了{' '}
                    <input
                      type="number"
                      className="num"
                      min={1}
                      max={1440}
                      placeholder="活動"
                      value={it.flashMinutes ?? ''}
                      onChange={(e) => setItem(it.id, { flashMinutes: e.target.value === '' ? null : Math.max(1, Math.min(1440, Math.round(Number(e.target.value)) || 1)) })}
                    />{' '}
                    分前から
                  </label>
                )}
                <label className="unit">
                  切り替え{' '}
                  <select value={it.switchMode} onChange={(e) => setItem(it.id, { switchMode: e.target.value as SwitchModeSetting })}>
                    <option value="inherit">活動・プリセットに合わせる</option>
                    <option value="auto">自動</option>
                    <option value="manual">おわったよで</option>
                  </select>
                </label>
                <span className="row" style={{ marginLeft: 'auto' }}>
                  <button className="btn btn-sm" aria-label="上へ" disabled={idx === 0} onClick={() => move(idx, -1)}>
                    ↑
                  </button>
                  <button className="btn btn-sm" aria-label="下へ" disabled={idx === sorted.length - 1} onClick={() => move(idx, 1)}>
                    ↓
                  </button>
                  <button className="btn btn-sm" onClick={() => setP((x) => ({ ...x, items: x.items.filter((i) => i.id !== it.id) }))}>
                    削除
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => addItem('activity')}>
          ＋ 活動を追加
        </button>
        <button className="btn" onClick={() => addItem('free')}>
          ＋ 設定外の表示を追加
        </button>
      </div>
      <p className="hint">↑↓は、となりの枠と「やること」を入れ替えます(時刻はそのまま)。終了時刻と次の開始時刻が同じ(すき間なし)はOKです。すき間は「よていはないよ」と表示されます。</p>

      {freeItem?.free && (
        <Modal title={`「${freeItem.free.name || '設定外の表示'}」の画像・形`} onClose={() => setFreeEdit(null)} footer={<button className="btn btn-primary" onClick={() => setFreeEdit(null)}>とじる</button>}>
          <ImageEditor value={freeItem.free} name={freeItem.free.name} userId={userId} onChange={(patch) => setItem(freeItem.id, { free: { ...freeItem.free!, ...patch } })} />
        </Modal>
      )}

      {simulating && <PresetSimulator preset={p} onClose={() => setSimulating(false)} />}

      {confirmSave && (
        <Modal
          title="この内容で保存しますか？"
          onClose={() => setConfirmSave(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmSave(false)}>
                もどる
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setConfirmSave(false);
                  onSave({ ...p, name: p.name.trim(), items: sortedItems(p) });
                }}
              >
                保存する
              </button>
            </>
          }
        >
          <p>
            「{p.name.trim()}」 予定{p.items.length}件
            {!isNew && `(追加 ${changes.added} ・ 変更 ${changes.changed} ・ 削除 ${changes.removed})`}
          </p>
          <table className="table">
            <tbody>
              {sorted.map((it) => (
                <tr key={it.id}>
                  <td>
                    {minutesToHHMM(it.startMin)}〜{minutesToHHMM(it.endMin)}
                  </td>
                  <td>{itemLabel(it, data.activities)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {issues.some((i) => i.level === 'warning') && <Banner kind="warn">警告があります(保存はできます)。</Banner>}
        </Modal>
      )}

      {confirmCancel && (
        <Confirm title="変更を破棄しますか？" message="保存していない変更があります。" confirmLabel="破棄する" danger onCancel={() => setConfirmCancel(false)} onConfirm={onCancel} />
      )}
    </Modal>
  );
}

