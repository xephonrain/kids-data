import { useRef, useState } from 'react';
import { ImageFrame } from '../components/ImageFrame';
import { Banner, Confirm, Field, Modal, Segmented, SliderField } from '../components/ui';
import { deleteImage } from '../data/images';
import { useStore } from '../data/store';
import { newActivity } from '../defaults';
import type { Activity, ImageDisplay, SwitchModeSetting } from '../types';
import { ImageEditor } from './ImageEditor';

const MODE_OPTIONS: { value: SwitchModeSetting; label: string }[] = [
  { value: 'inherit', label: 'プリセットに合わせる' },
  { value: 'auto', label: '自動で切り替え' },
  { value: 'manual', label: 'おわったよで切り替え' },
];

export function ActivitiesSection() {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<{ draft: Activity; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);

  const usedBy = (id: string) => data.presets.filter((p) => p.items.some((i) => i.activityId === id));

  const doDelete = (a: Activity) => {
    update((d) => ({
      ...d,
      activities: d.activities.filter((x) => x.id !== a.id),
      // その活動を使っている時間割項目も取り除く(参照整合性)
      presets: d.presets.map((p) => (p.items.some((i) => i.activityId === a.id) ? { ...p, items: p.items.filter((i) => i.activityId !== a.id) } : p)),
      // チェックシートの項目は名前だけ残す
      checksheets: d.checksheets.map((c) => (c.items.some((i) => i.activityId === a.id) ? { ...c, items: c.items.map((i) => (i.activityId === a.id ? { ...i, activityId: null } : i)) } : c)),
    }));
    setDeleting(null);
  };

  return (
    <div className="panel">
      <h2>やることの設定</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        「あさごはん」「はみがき」など、やることを登録します。登録した活動は、いくつものプリセットで使いまわせます。
      </p>
      <div className="row-end" style={{ marginTop: 0, marginBottom: 10 }}>
        <button className="btn btn-primary" onClick={() => setEditing({ draft: { ...newActivity(''), borderColor: data.theme.colors.illustrationFrame.color, borderOpacity: data.theme.colors.illustrationFrame.opacity }, isNew: true })}>
          ＋ 新しい活動
        </button>
      </div>
      {data.activities.length === 0 && <Banner kind="info">まだ活動がありません。「＋ 新しい活動」から登録してください。</Banner>}
      <div className="list">
        {[...data.activities]
          .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
          .map((a) => (
            <div key={a.id} className="list-item">
              <div className="thumb">
                <ImageFrame display={{ ...a, borderWidth: Math.min(a.borderWidth, 16) }} fallbackText={a.name.slice(0, 2)} />
              </div>
              <div className="name">
                {a.name}
                <div className="hint">
                  {usedBy(a.id).length > 0 ? `${usedBy(a.id).length}個のプリセットで使用中` : 'どのプリセットでも未使用'}
                  {a.flashEnabled ? ` ・ 終了${a.flashMinutes}分前から点滅` : ''}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setEditing({ draft: structuredClone(a), isNew: false })}>
                編集
              </button>
              <button className="btn btn-sm" onClick={() => setDeleting(a)}>
                削除
              </button>
            </div>
          ))}
      </div>

      {editing && (
        <ActivityEditor
          initial={editing.draft}
          isNew={editing.isNew}
          onCancel={() => setEditing(null)}
          onSave={(a) => {
            update((d) => ({
              ...d,
              activities: editing.isNew ? [...d.activities, a] : d.activities.map((x) => (x.id === a.id ? a : x)),
            }));
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <Confirm
          title="活動を削除しますか？"
          danger
          confirmLabel="削除する"
          onCancel={() => setDeleting(null)}
          onConfirm={() => doDelete(deleting)}
          message={
            <>
              <p>「{deleting.name}」を削除します。</p>
              {usedBy(deleting.id).length > 0 ? (
                <Banner kind="warn">
                  次のプリセットで使われています。削除すると、これらの時間割からも取り除かれます:
                  <br />
                  {usedBy(deleting.id)
                    .map((p) => `「${p.name}」(${p.items.filter((i) => i.activityId === deleting.id).length}件)`)
                    .join('、')}
                </Banner>
              ) : (
                <p className="muted">どのプリセットでも使われていません。</p>
              )}
            </>
          }
        />
      )}
    </div>
  );
}

function ActivityEditor({ initial, isNew, onSave, onCancel }: { initial: Activity; isNew: boolean; onSave: (a: Activity) => void; onCancel: () => void }) {
  const { userId } = useStore();
  const [a, setA] = useState<Activity>(initial);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const uploaded = useRef<string[]>([]);
  const dirty = JSON.stringify(a) !== JSON.stringify(initial);
  const patch = (p: Partial<Activity>) => setA((x) => ({ ...x, ...p }));
  const nameOk = a.name.trim().length > 0 && a.name.trim().length <= 60;
  // 保存しなかった(未参照の)アップロード画像は片付ける
  const cleanup = (keep: string | null) => uploaded.current.filter((p) => p !== keep).forEach((p) => void deleteImage(p).catch(() => undefined));
  const cancel = () => {
    cleanup(null);
    onCancel();
  };

  return (
    <Modal
      title={isNew ? '新しい活動' : `「${initial.name}」を編集`}
      wide
      onClose={() => (dirty ? setConfirmCancel(true) : cancel())}
      footer={
        <>
          <button className="btn" onClick={() => (dirty ? setConfirmCancel(true) : cancel())}>
            キャンセル
          </button>
          <button className="btn btn-primary" disabled={!nameOk} onClick={() => {
              cleanup(a.imagePath);
              onSave({ ...a, name: a.name.trim() });
            }}>
            保存
          </button>
        </>
      }
    >
      <div className="two-col">
        <div>
          <Field label="活動の名前(ひらがな・漢字・カタカナ・英数字など自由)">
            <input type="text" className="grow" value={a.name} maxLength={60} onChange={(e) => patch({ name: e.target.value })} placeholder="例: あさごはん" autoFocus />
          </Field>
          {!nameOk && a.name.length > 0 && <Banner kind="error">名前は1〜60文字で入力してください</Banner>}

          <h3>点滅(終了が近いことを知らせる)</h3>
          <Field label="点滅">
            <Segmented label="点滅" value={a.flashEnabled ? 'on' : 'off'} onChange={(v) => patch({ flashEnabled: v === 'on' })} options={[{ value: 'off', label: 'オフ' }, { value: 'on', label: 'オン' }]} />
          </Field>
          {a.flashEnabled && (
            <>
              <SliderField label="点滅を始める時間(終了の何分前から)" value={a.flashMinutes} min={1} max={60} unit="分前" onChange={(flashMinutes) => patch({ flashMinutes })} />
              <div className="field">
                <label>点滅時の「あと○ふん」の背景色(空なら配色設定の色)</label>
                <div className="co-row">
                  <input type="color" value={a.flashBgColor ?? '#ffe3a8'} onChange={(e) => patch({ flashBgColor: e.target.value, flashBgOpacity: a.flashBgOpacity ?? 100 })} aria-label="点滅時の背景色" />
                  <input type="range" min={0} max={100} value={a.flashBgOpacity ?? 100} onChange={(e) => patch({ flashBgOpacity: Number(e.target.value), flashBgColor: a.flashBgColor ?? '#ffe3a8' })} aria-label="点滅時の背景の不透明度" />
                  <span className="unit">{a.flashBgOpacity ?? 100}%</span>
                  <button type="button" className="btn btn-sm" onClick={() => patch({ flashBgColor: null, flashBgOpacity: null })}>
                    配色設定にもどす
                  </button>
                </div>
              </div>
            </>
          )}

          <h3>終わりの切り替え</h3>
          <Field label="この活動の切り替え方式" hint="時間割で個別に指定した場合は、そちらが優先されます。">
            <select value={a.switchMode} onChange={(e) => patch({ switchMode: e.target.value as SwitchModeSetting })}>
              {MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div>
          <ImageEditor value={a} name={a.name} userId={userId} onChange={(p: Partial<ImageDisplay>) => patch(p)} onUploaded={(path) => uploaded.current.push(path)} />
        </div>
      </div>

      {confirmCancel && (
        <Confirm
          title="変更を破棄しますか？"
          message="保存していない変更があります。"
          confirmLabel="破棄する"
          danger
          onCancel={() => setConfirmCancel(false)}
          onConfirm={() => {
            setConfirmCancel(false);
            cancel();
          }}
        />
      )}
    </Modal>
  );
}
