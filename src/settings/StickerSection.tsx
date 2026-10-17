import { useRef, useState } from 'react';
import { ImageFrame } from '../components/ImageFrame';
import { Banner, Confirm } from '../components/ui';
import { deleteImage, uploadImage } from '../data/images';
import { useStore } from '../data/store';
import { newId, nowIso } from '../defaults';
import { stickerCounts, stickerDisplay } from '../lib/checklist';
import type { Sticker } from '../types';

export function StickerSection() {
  const { data, update, userId } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [deleting, setDeleting] = useState<Sticker | null>(null);
  const counts = stickerCounts(data);
  const unnamed = data.stickers.filter((s) => !s.name.trim()).length;

  /** 複数の画像を一気に登録する。名前は空のまま(あとから付けられる) */
  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = [...files];
    setMsg(null);
    setBusy({ done: 0, total: list.length });
    const added: Sticker[] = [];
    const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      try {
        const path = await uploadImage(userId, list[i]);
        added.push({ id: newId(), imagePath: path, name: '', createdAt: nowIso() });
      } catch (e) {
        failed.push(`${list[i].name}(${e instanceof Error ? e.message : '失敗'})`);
      }
      setBusy({ done: i + 1, total: list.length });
    }
    if (added.length > 0) {
      const ok = update((d) => ({ ...d, stickers: [...d.stickers, ...added] }));
      if (!ok) {
        added.forEach((s) => void deleteImage(s.imagePath).catch(() => undefined));
        setBusy(null);
        setMsg({ kind: 'error', text: 'ロックされているため登録できませんでした' });
        return;
      }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
    setMsg(failed.length ? { kind: 'warn', text: `${added.length}まい登録しました。登録できなかった画像: ${failed.join('、')}` } : { kind: 'ok', text: `${added.length}まい登録しました。下の一覧で名前をつけられます(名前は空のままでもOK)。` });
  };

  const rename = (id: string, name: string) => update((d) => ({ ...d, stickers: d.stickers.map((s) => (s.id === id ? { ...s, name } : s)) }));

  return (
    <div className="panel">
      <h2>シール</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        チェックシートを全部できたときにもらえるシールです。画像は複数まとめて選べます。名前はあとから、いつでも付けられます。
      </p>
      <div className="row-end" style={{ marginTop: 0, marginBottom: 10 }}>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden data-testid="sticker-files" onChange={(e) => void addFiles(e.target.files)} />
        <button className="btn btn-primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          ＋ 画像をまとめて追加
        </button>
      </div>
      {busy && (
        <Banner kind="info">
          登録中… {busy.done} / {busy.total}
        </Banner>
      )}
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      {data.stickers.length === 0 && !busy && <Banner kind="info">まだシールがありません。「＋ 画像をまとめて追加」から選んでください。</Banner>}
      {data.stickers.length > 0 && (
        <p className="muted" style={{ marginBottom: 8 }}>
          全{data.stickers.length}まい ・ 名前なし{unnamed}まい ・ もらった記録 {data.stickerLog.length}かい
        </p>
      )}
      <div className="sticker-grid">
        {data.stickers.map((s, i) => (
          <div key={s.id} className="sticker-card">
            <div className="sticker-thumb">
              <ImageFrame display={stickerDisplay(s.imagePath)} fallbackText="シール" />
            </div>
            <input type="text" aria-label={`シール${i + 1}の名前`} value={s.name} placeholder="なまえ(あとで)" maxLength={20} onChange={(e) => rename(s.id, e.target.value)} />
            <div className="hint">もらった: {counts.get(s.id) ?? 0}かい</div>
            <button className="btn btn-sm" onClick={() => setDeleting(s)}>
              削除
            </button>
          </div>
        ))}
      </div>

      {deleting && (
        <Confirm
          title="シールを削除しますか？"
          danger
          confirmLabel="削除する"
          message={<p>{deleting.name ? `「${deleting.name}」` : 'このシール'}を削除します。{(counts.get(deleting.id) ?? 0) > 0 ? 'シール帳にはったぶんも消えます。' : ''}</p>}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const t = deleting;
            if (update((d) => ({ ...d, stickers: d.stickers.filter((s) => s.id !== t.id), stickerLog: d.stickerLog.filter((g) => g.stickerId !== t.id) }))) void deleteImage(t.imagePath).catch(() => undefined);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
