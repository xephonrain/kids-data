import { useState } from 'react';
import { Banner } from '../components/ui';
import { encodeCode } from '../data/github';
import type { GhState } from '../data/githubSync';
import { useStore } from '../data/store';

export function statusLabel(mode: 'github' | 'local', gh: GhState): string {
  if (mode === 'local') return 'この端末のみ';
  switch (gh.status) {
    case 'syncing':
      return 'GitHubと同期中…';
    case 'offline':
      return 'オフライン';
    case 'error':
      return '同期エラー';
    case 'conflict':
      return '内容がぶつかっています';
    default:
      return gh.dirty ? 'GitHubに未保存の変更あり' : 'GitHubに保存済み';
  }
}

export function SyncSection({ onDisconnect }: { onDisconnect?: () => void }) {
  const { gh, mode, syncNow, resolveConflict, remoteSummary, data } = useStore();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const conn = (() => {
    try {
      return JSON.parse(localStorage.getItem('kt:conn:v1') ?? 'null') as { mode: string; repo?: string; token?: string } | null;
    } catch {
      return null;
    }
  })();

  const showCode = () => {
    if (conn?.mode === 'github' && conn.repo && conn.token) setCode(encodeCode({ repo: conn.repo, token: conn.token }));
  };
  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const remote = remoteSummary();

  if (mode === 'local') {
    return (
      <div className="panel">
        <h2>保存先</h2>
        <Banner kind="warn">データはこの端末の中だけに保存されています(ほかの端末とは共有されません)。ほかの端末でも使うには、いったん接続を解除して、GitHubのコードを入れ直してください。</Banner>
        {onDisconnect && (
          <button className="btn" onClick={onDisconnect}>
            接続を解除して、コード入力画面にもどる
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>GitHubとの同期</h2>
      <table className="table">
        <tbody>
          <tr>
            <th>保存先</th>
            <td>{conn?.repo ?? ''}(非公開リポジトリ)</td>
          </tr>
          <tr>
            <th>状態</th>
            <td>
              <strong>{statusLabel(mode, gh)}</strong>
            </td>
          </tr>
          <tr>
            <th>最後にGitHubと合わせた時刻</th>
            <td>{gh.lastSyncedAt ? new Date(gh.lastSyncedAt).toLocaleString('ja-JP') : '(まだありません)'}</td>
          </tr>
          <tr>
            <th>この端末の内容</th>
            <td>
              活動{data.activities.length}件 / プリセット{data.presets.length}件
            </td>
          </tr>
        </tbody>
      </table>
      <p className="hint">設定を変えると数秒後に自動でGitHubへ保存されます。ほかの端末の変更は、アプリを開いたときや画面に戻ったときに取り込まれます。</p>
      {gh.status === 'offline' && <Banner kind="warn">インターネットに接続できません。保存済みの予定で表示を続けます。変更はこの端末に残り、つながったら自動で送信されます。</Banner>}
      {gh.status === 'error' && <Banner kind="error">同期できませんでした: {gh.error}</Banner>}

      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="btn btn-primary"
          disabled={busy || gh.status === 'syncing' || gh.status === 'conflict'}
          onClick={async () => {
            setBusy(true);
            await syncNow();
            setBusy(false);
          }}
        >
          今すぐ同期
        </button>
      </div>

      {gh.status === 'conflict' && (
        <>
          <h3>この端末とGitHubで、別々に変更されています</h3>
          <p className="muted">どちらの内容を残すか選んでください。選ぶまで、勝手には上書きしません。</p>
          <table className="table">
            <tbody>
              <tr>
                <th>この端末</th>
                <td>
                  活動{data.activities.length}件 / プリセット{data.presets.length}件 / 臨時変更{data.overrides.length}件
                </td>
              </tr>
              <tr>
                <th>GitHub</th>
                <td>{remote ? `活動${remote.activities}件 / プリセット${remote.presets}件 / 臨時変更${remote.overrides}件` : '(取得できません)'}</td>
              </tr>
            </tbody>
          </table>
          {gh.error && <Banner kind="error">{gh.error}</Banner>}
          <div className="row">
            <button className="btn" onClick={() => void resolveConflict('remote')}>
              GitHubの内容にする(この端末の変更は消えます)
            </button>
            <button className="btn btn-primary" onClick={() => void resolveConflict('local')}>
              この端末の内容で上書き
            </button>
          </div>
        </>
      )}

      <h3>ほかの端末で使う</h3>
      <p className="muted">ほかの端末の最初の画面にこのコードを入れると、同じ予定がひらきます。コードにはGitHubへの書き込み権限が含まれます。他の人に見せないでください。</p>
      {!code ? (
        <button className="btn" onClick={showCode}>
          コードを表示する
        </button>
      ) : (
        <div className="field">
          <textarea readOnly rows={4} value={code} onFocus={(e) => e.currentTarget.select()} style={{ width: '100%', wordBreak: 'break-all' }} aria-label="ほかの端末用のコード" />
          <div className="row">
            <button className="btn btn-sm" onClick={() => void copy()}>
              {copied ? 'コピーしました' : 'コピー'}
            </button>
            <button className="btn btn-sm" onClick={() => (setCode(null), setCopied(false))}>
              かくす
            </button>
          </div>
        </div>
      )}

      {onDisconnect && (
        <>
          <h3>この端末の接続</h3>
          <p className="muted">解除すると、この端末のコード(トークン)を消して最初の画面にもどります。GitHub上のデータは消えません。</p>
          <button className="btn" onClick={onDisconnect}>
            この端末の接続を解除する
          </button>
        </>
      )}
    </div>
  );
}
