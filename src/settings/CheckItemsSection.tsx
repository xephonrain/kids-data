import { useRef, useState } from 'react';
import { ImageFrame } from '../components/ImageFrame';
import { Banner, Confirm, Field, Modal } from '../components/ui';
import { collectImagePaths } from '../data/backup';
import { deleteImage } from '../data/images';
import { useStore } from '../data/store';
import { newCheckItem } from '../defaults';
import type { CheckItem, ImageDisplay } from '../types';
import { ImageEditor } from './ImageEditor';

/** チェックリストで使う項目を、「やること」とは別に1つずつ登録する場所(名前と画像) */
export function CheckItemsSection() {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<{ draft: CheckItem; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<CheckItem | null>(null);
  const usedBy = (id: string) => data.checksheets.filter((c) => c.itemIds.includes(id));

  const doDelete = (it: CheckItem) => {
    const next = { ...data, checkItems: data.checkItems.filter((x) => x.id !== it.id) };
    // 同じ画像を他で使っているときは、画像ファイルは消さない
    const stillUsed = it.imagePath ? collectImagePaths(next).includes(it.imagePath) : true;
    const ok = update((d) => ({ ...d, checkItems: d.checkItems.filter((x) => x.id !== it.id), checksheets: d.checksheets.map((c) => (c.itemIds.includes(it.id) ? { ...c, itemIds: c.itemIds.filter((x) => x !== it.id) } : c)) }));
    if (ok && !stillUsed && it.imagePath) void deleteImage(it.imagePath).catch(() => undefined);
    setDeleting(null);
  };

  return (
    <div className="panel">
      <h2>チェック項目</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        「はみがき」「トイレ」など、チェックリストに並べる項目を1つずつ登録します(「やること」とは別です)。登録した項目は、「チェックリスト」タブでいくつものリストに選んで使えます。画像もここで登録します。
      </p>
      <div className="row-end" style={{ marginTop: 0, marginBottom: 10 }}>
        <button className="btn btn-primary" onClick={() => setEditing({ draft: { ...newCheckItem(''), borderColor: data.theme.colors.illustrationFrame.color, borderOpacity: data.theme.colors.illustrationFrame.opacity }, isNew: true })}>
          ＋ 新しい項目
        </button>
      </div>
      {data.checkItems.length === 0 && <Banner kind="info">まだ項目がありません。「＋ 新しい項目」から登録してください。</Banner>}
      <div className="list">
        {data.checkItems.map((it) => (
          <div key={it.id} className="list-item" data-checkitem={it.name}>
            <div className="thumb">
              <ImageFrame display={{ ...it, borderWidth: Math.min(it.borderWidth, 16) }} fallbackText={it.name.slice(0, 2)} />
            </div>
            <div className="name">
              {it.name}
              <div className="hint">{usedBy(it.id).length > 0 ? `${usedBy(it.id).length}個のリストで使用中` : 'どのリストでも未使用'}</div>
            </div>
            <button className="btn btn-sm" onClick={() => setEditing({ draft: structuredClone(it), isNew: false })}>
              編集
            </button>
            <button className="btn btn-sm" onClick={() => setDeleting(it)}>
              削除
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <ItemEditor
          initial={editing.draft}
          isNew={editing.isNew}
          onCancel={() => setEditing(null)}
          onSave={(it) => {
            update((d) => ({ ...d, checkItems: editing.isNew ? [...d.checkItems, it] : d.checkItems.map((x) => (x.id === it.id ? it : x)) }));
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <Confirm
          title="チェック項目を削除しますか？"
          danger
          confirmLabel="削除する"
          onCancel={() => setDeleting(null)}
          onConfirm={() => doDelete(deleting)}
          message={
            <>
              <p>「{deleting.name}」を削除します。</p>
              {usedBy(deleting.id).length > 0 && <Banner kind="warn">次のリストからも取り除かれます: {usedBy(deleting.id).map((c) => `「${c.name}」`).join('、')}</Banner>}
            </>
          }
        />
      )}
    </div>
  );
}

function ItemEditor({ initial, isNew, onSave, onCancel }: { initial: CheckItem; isNew: boolean; onSave: (i: CheckItem) => void; onCancel: () => void }) {
  const { userId } = useStore();
  const [it, setIt] = useState<CheckItem>(initial);
  const uploaded = useRef<string[]>([]);
  const patch = (p: Partial<CheckItem>) => setIt((x) => ({ ...x, ...p }));
  const nameOk = it.name.trim().length > 0 && it.name.trim().length <= 60;
  // 保存しなかったアップロード画像は片付ける
  const cleanup = (keep: string | null) => uploaded.current.filter((p) => p !== keep).forEach((p) => void deleteImage(p).catch(() => undefined));
  const cancel = () => {
    cleanup(null);
    onCancel();
  };
  return (
    <Modal
      title={isNew ? '新しいチェック項目' : `「${initial.name}」を編集`}
      wide
      onClose={cancel}
      footer={
        <>
          <button className="btn" onClick={cancel}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            disabled={!nameOk}
            onClick={() => {
              cleanup(it.imagePath);
              onSave({ ...it, name: it.name.trim() });
            }}
          >
            保存
          </button>
        </>
      }
    >
      <div className="two-col">
        <div>
          <Field label="項目の名前">
            <input type="text" className="grow" value={it.name} maxLength={60} onChange={(e) => patch({ name: e.target.value })} placeholder="例: はみがき" autoFocus />
          </Field>
          {!nameOk && it.name.length > 0 && <Banner kind="error">名前は1〜60文字で入力してください</Banner>}
        </div>
        <div>
          <ImageEditor value={it} name={it.name} userId={userId} onChange={(p: Partial<ImageDisplay>) => patch(p)} onUploaded={(path) => uploaded.current.push(path)} />
        </div>
      </div>
    </Modal>
  );
}
