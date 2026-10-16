import { useEffect, useRef, useState, type FormEvent } from 'react';
import { GhClient, decodeCode, isValidRepo, saveConnection, type Connection, type GhConfig } from '../data/github';
import { Banner } from './ui';

async function verify(cfg: GhConfig): Promise<string | null> {
  try {
    const info = await new GhClient(cfg).check();
    if (!info.canPush) return 'このトークンには書き込み権限がありません(Contents: Read and write が必要です)';
    if (!info.private) return 'このリポジトリは公開(Public)です。設定や画像が誰でも読めてしまうため、非公開(Private)のリポジトリを使ってください';
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** 最初の画面。コードを入れるとつながり、この端末では次回から自動で開く */
/** 連携リンク(…/#c=コード)で開かれたときのコード。履歴にトークンを残さないよう、読んだらすぐURLから消す */
function takeLinkCode(): string | null {
  try {
    const m = location.hash.match(/^#c=(kt1\.[A-Za-z0-9_-]+)$/);
    if (!m) return null;
    history.replaceState(null, '', location.pathname + location.search);
    return m[1];
  } catch {
    return null;
  }
}

export function SetupScreen({ onDone }: { onDone: (c: Connection) => void }) {
  const [linkCode] = useState(takeLinkCode);
  const [code, setCode] = useState(linkCode ?? '');
  const [first, setFirst] = useState(false);
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async (cfg: GhConfig) => {
    setBusy(true);
    setError(null);
    const err = await verify(cfg);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    const c: Connection = { mode: 'github', ...cfg };
    saveConnection(c);
    onDone(c);
  };

  // 連携リンクから開いたときは、自動でつなぐ(失敗したらコード欄に残して理由を表示)
  const started = useRef(false);
  useEffect(() => {
    if (!linkCode || started.current) return;
    started.current = true;
    const cfg = decodeCode(linkCode);
    if (!cfg) {
      setError('連携リンクが正しくありません。もう一度リンクをコピーするか、コードを貼り付けてください');
      return;
    }
    void connect(cfg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    const cfg = decodeCode(code);
    if (!cfg) {
      setError('コードの形式が正しくありません。最初の端末で表示した「kt1.」から始まるコードを、そのまま貼り付けてください');
      return;
    }
    void connect(cfg);
  };

  const submitFirst = (e: FormEvent) => {
    e.preventDefault();
    const r = repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    if (!isValidRepo(r)) {
      setError('リポジトリ名は「ユーザー名/リポジトリ名」の形で入力してください');
      return;
    }
    void connect({ repo: r, token: token.trim() });
  };

  return (
    <div className="center-screen">
      <div className="card login">
        <h1>いまなにするの？</h1>
        {!first ? (
          <form onSubmit={submitCode}>
            <p className="muted">保護者の方: コードを入れると、予定をひらけます。いちど入れると、この端末では次回から自動でひらきます。</p>
            <div className="field">
              <label htmlFor="code">コード</label>
              <input id="code" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="kt1.…" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            {error && <Banner kind="error">{error}</Banner>}
            <button className="btn btn-primary btn-block" disabled={busy || !code.trim()} type="submit">
              {busy ? 'つないでいます…' : 'ひらく'}
            </button>
            <button type="button" className="btn btn-block" onClick={() => (setFirst(true), setError(null))}>
              はじめて使う(コードをつくる)
            </button>
            <button
              type="button"
              className="btn btn-block"
              onClick={() => {
                const c: Connection = { mode: 'local' };
                saveConnection(c);
                onDone(c);
              }}
            >
              この端末だけで使う(GitHubを使わない)
            </button>
          </form>
        ) : (
          <form onSubmit={submitFirst}>
            <p className="muted">GitHubの<strong>非公開(Private)</strong>リポジトリを保存先にします。作り方は README の「はじめての設定」にあります。つながると、ほかの端末用のコードが設定画面に表示されます。</p>
            <div className="field">
              <label htmlFor="repo">リポジトリ(ユーザー名/リポジトリ名)</label>
              <input id="repo" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="aki/kids-timer-data" value={repo} onChange={(e) => setRepo(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tok">アクセストークン</label>
              <input id="tok" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
              <div className="hint">そのリポジトリだけに「Contents: Read and write」を許可したトークン。この端末のブラウザ内にだけ保存されます。</div>
            </div>
            {error && <Banner kind="error">{error}</Banner>}
            <button className="btn btn-primary btn-block" disabled={busy || !repo.trim() || !token.trim()} type="submit">
              {busy ? 'つないでいます…' : 'つなぐ'}
            </button>
            <button type="button" className="btn btn-block" onClick={() => (setFirst(false), setError(null))}>
              もどる
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
