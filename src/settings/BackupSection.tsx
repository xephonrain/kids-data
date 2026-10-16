import { useRef, useState } from 'react';
import { Banner, Confirm } from '../components/ui';
import { MAX_BACKUP_BYTES, buildBackup, collectImagePaths, parseBackup, planRestore, summarizeBackup, type BackupFile } from '../data/backup';
import { dataUrlToBlob, imageToDataUrl, uploadImage } from '../data/images';
import { useStore } from '../data/store';
import { nowIso } from '../defaults';

export function BackupSection() {
  const { data, update, userId } = useStore();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok' | 'warn'; text: string } | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { file, missingImages } = await buildBackup(data, imageToDataUrl);
      const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `いまなにするの-バックアップ-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      const mb = (blob.size / 1024 / 1024).toFixed(1);
      setMsg(
        missingImages.length
          ? { kind: 'warn', text: `バックアップを書き出しました(${mb}MB)。ただし ${missingImages.length}枚の画像は取得できず、含まれていません(オフライン中などの可能性があります)。` }
          : { kind: 'ok', text: `バックアップを書き出しました(${mb}MB)。` }
      );
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'バックアップに失敗しました' });
    } finally {
      setBusy(false);
    }
  };

  const onPick = async (f: File | undefined) => {
    setMsg(null);
    if (!f) return;
    if (f.size > MAX_BACKUP_BYTES) return setMsg({ kind: 'error', text: `ファイルが大きすぎます(${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)}MBまで)` });
    try {
      setPending(parseBackup(await f.text()));
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : '読み込めませんでした' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const doRestore = async (b: BackupFile) => {
    setPending(null);
    setBusy(true);
    setMsg(null);
    try {
      // 画像を先に再アップロードして、新しい保存先パスに置き換える
      const map: Record<string, string> = {};
      const failed: string[] = [];
      for (const oldPath of collectImagePaths(b.data)) {
        const dataUrl = b.images[oldPath];
        if (!dataUrl) continue;
        try {
          map[oldPath] = await uploadImage(userId, await dataUrlToBlob(dataUrl));
        } catch {
          failed.push(oldPath);
        }
      }
      const { data: restored, warnings } = planRestore(data, b, map, nowIso());
      const ok = update(() => restored);
      if (!ok) throw new Error('設定を変更できる状態ではありません');
      setMsg({
        kind: warnings.length || failed.length ? 'warn' : 'ok',
        text: `復元しました(活動${restored.activities.length}・プリセット${restored.presets.length}・臨時変更${restored.overrides.length})。${warnings.length ? ` 注意: ${[...new Set(warnings)].join(' / ')}` : ''}`,
      });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : '復元に失敗しました' });
    } finally {
      setBusy(false);
    }
  };

  const sum = pending ? summarizeBackup(pending) : null;

  return (
    <div className="panel">
      <h2>バックアップ・復元</h2>
      <p className="muted">活動・画像・プリセット・曜日/祝日/臨時の設定・配色・点滅設定を、1つのJSONファイルに保存できます(画像も同梱)。</p>
      <ul className="muted">
        <li>パスワード(ロック)の情報はバックアップに含まれず、復元しても今のパスワードのままです。</li>
        <li>復元すると、今ある設定はバックアップの内容に置き換わります(実行前に確認します)。</li>
        <li>ファイルサイズの目安: 画像1枚あたり100〜300KB。読み込めるのは{Math.round(MAX_BACKUP_BYTES / 1024 / 1024)}MBまでです。</li>
      </ul>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => void doExport()}>
          {busy ? '処理中…' : 'バックアップを書き出す'}
        </button>
        <label className="btn" style={{ cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>
          バックアップから復元…
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" disabled={busy} onChange={(e) => void onPick(e.target.files?.[0])} />
        </label>
      </div>
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      {pending && sum && (
        <Confirm
          title="現在の設定を、バックアップの内容で置き換えますか？"
          danger
          confirmLabel="置き換えて復元"
          onCancel={() => setPending(null)}
          onConfirm={() => void doRestore(pending)}
          message={
            <>
              <p>
                バックアップ: 活動{sum.activities}・プリセット{sum.presets}・臨時変更{sum.overrides}・画像{sum.images}枚
                {sum.exportedAt && `(${new Date(sum.exportedAt).toLocaleString('ja-JP')} 作成)`}
              </p>
              <p>
                今の設定: 活動{data.activities.length}・プリセット{data.presets.length}・臨時変更{data.overrides.length}
              </p>
              <Banner kind="warn">バックアップに含まれない活動・プリセットは削除されます。念のため、先に今の設定をバックアップしておくと安心です。</Banner>
            </>
          }
        />
      )}
    </div>
  );
}
