import { useState } from 'react';
import { ImageFrame } from '../components/ImageFrame';
import { Banner, Confirm, Field, Modal } from '../components/ui';
import { useStore } from '../data/store';
import { newId } from '../defaults';
import type { Checksheet } from '../types';

const blankSheet = (): Checksheet => ({ id: newId(), name: '', itemIds: [], rewardEnabled: true });

/** チェックリスト(登録済みの「チェック項目」を選んで並べたもの) */
export function ChecksheetSection() {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<{ draft: Checksheet; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Checksheet | null>(null);
  const nameOf = (id: string) => data.checkItems.find((i) => i.id === id)?.name ?? '';

  return (
    <div className="panel">
      <h2>チェックリスト</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        「チェック項目」タブで登録した項目を選んで、「あさの じゅんび」のようなリストを作ります。アプリを開いたとき「チェックリスト」から選べます。全部チェックできると、日本地図を1県ぬれます。
      </p>
      <div className="row-end" style={{ marginTop: 0, marginBottom: 10 }}>
        <button className="btn btn-primary" onClick={() => setEditing({ draft: blankSheet(), isNew: true })}>
          ＋ チェックリストを作る
        </button>
      </div>
      {data.checkItems.length === 0 && <Banner kind="warn">先に「チェック項目」タブで、項目を登録してください。</Banner>}
      {data.checksheets.length === 0 && <Banner kind="info">まだチェックリストがありません。</Banner>}
      <div className="list">
        {data.checksheets.map((c) => (
          <div key={c.id} className="list-item">
            <div className="name">
              {c.name || '(名前なし)'}
              <div className="hint">
                {c.itemIds.length}こ: {c.itemIds.map(nameOf).filter(Boolean).join('・')}
                {c.rewardEnabled ? ' ・ ごほうびあり' : ''}
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => setEditing({ draft: structuredClone(c), isNew: false })}>
              編集
            </button>
            <button className="btn btn-sm" onClick={() => setEditing({ draft: { ...structuredClone(c), id: newId(), name: `${c.name}のコピー` }, isNew: true })}>
              複製
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
          title="チェックリストを削除しますか？"
          danger
          confirmLabel="削除する"
          message={<p>「{deleting.name}」を削除します。チェック項目は残ります。地図の進み具合も残ります。</p>}
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
  const err = !c.name.trim() ? '名前を入れてください' : c.itemIds.length === 0 ? '項目を1つ以上選んでください' : null;
  const chosen = new Set(c.itemIds);

  const move = (i: number, dir: -1 | 1) =>
    setC((x) => {
      const ids = [...x.itemIds];
      const j = i + dir;
      if (j < 0 || j >= ids.length) return x;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return { ...x, itemIds: ids };
    });

  return (
    <Modal
      title={initial.name ? 'チェックリストの編集' : 'チェックリストを作る'}
      onClose={onCancel}
      wide
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            キャンセル
          </button>
          <button className="btn btn-primary" disabled={!!err} onClick={() => onSave({ ...c, name: c.name.trim() })}>
            保存
          </button>
        </>
      }
    >
      <Field label="リストの名前">
        <input type="text" value={c.name} onChange={(ev) => setC({ ...c, name: ev.target.value })} placeholder="あさの じゅんび" />
      </Field>

      <h3>項目を選ぶ(チェックを入れた順に並びます)</h3>
      {data.checkItems.length === 0 ? (
        <Banner kind="warn">チェック項目がまだありません。保存せずに閉じて、「チェック項目」タブで登録してください。</Banner>
      ) : (
        <div className="check-grid" data-testid="pick-items">
          {data.checkItems.map((it) => (
            <label key={it.id} className={`check-pick${chosen.has(it.id) ? ' on' : ''}`}>
              <input type="checkbox" checked={chosen.has(it.id)} onChange={(ev) => setC({ ...c, itemIds: ev.target.checked ? [...c.itemIds, it.id] : c.itemIds.filter((x) => x !== it.id) })} />
              <span className="pick-pic">
                <ImageFrame display={{ ...it, borderWidth: Math.min(it.borderWidth, 12) }} fallbackText={it.name.slice(0, 2)} />
              </span>
              <span>{it.name}</span>
            </label>
          ))}
        </div>
      )}

      <h3>ならび順</h3>
      {c.itemIds.length === 0 && <p className="muted">まだ選んでいません。</p>}
      <div className="list">
        {c.itemIds.map((id, i) => (
          <div key={id} className="list-item">
            <div className="name">
              {i + 1}. {data.checkItems.find((x) => x.id === id)?.name}
            </div>
            <button className="btn btn-sm" aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button className="btn btn-sm" aria-label="下へ" disabled={i === c.itemIds.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
          </div>
        ))}
      </div>

      <label className="check" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={c.rewardEnabled} onChange={(ev) => setC({ ...c, rewardEnabled: ev.target.checked })} />
        ぜんぶ できたら 日本地図をぬる
      </label>
      {err && <Banner kind="warn">{err}</Banner>}
    </Modal>
  );
}
