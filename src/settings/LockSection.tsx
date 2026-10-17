import { useState, type FormEvent } from 'react';
import { Banner, Confirm } from '../components/ui';
import { setLockOff, useLockOff } from '../data/deviceLock';
import { useStore } from '../data/store';
import { MIN_PASSWORD_LENGTH, createLock, verifyLock } from '../lib/lock';

export function LockSection() {
  const { data, update } = useStore();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [askOff, setAskOff] = useState(false);
  const [busy, setBusy] = useState(false);

  const disabled = useLockOff();
  const toggleDisabled = async () => {
    setMsg(null);
    if (!disabled) return setAskOff(true);
    setLockOff(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (pw.length < MIN_PASSWORD_LENGTH) return setMsg({ kind: 'error', text: `新しいパスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` });
    if (pw !== pw2) return setMsg({ kind: 'error', text: '確認用のパスワードが一致しません' });
    setBusy(true);
    const ok = await verifyLock(cur, data.settings);
    if (!ok) {
      setBusy(false);
      return setMsg({ kind: 'error', text: '現在のパスワードが違います' });
    }
    const rec = await createLock(pw);
    update((d) => ({ ...d, settings: { ...d.settings, ...rec } }));
    setBusy(false);
    setCur('');
    setPw('');
    setPw2('');
    setMsg({ kind: 'ok', text: 'パスワードを変更しました' });
  };

  return (
    <div className="panel">
      <h2>パスワード・ロック</h2>
      <Banner kind="info">
        設定画面を開くときのパスワードです。お子さまの誤操作を防ぐための「画面のロック」で、GitHub上のデータを守る仕組み(トークンとリポジトリの非公開設定)とは別です。
        パスワードは暗号化(ハッシュ化)して保存し、そのままの形では保存しません。
      </Banner>
      <ul className="muted">
        <li>設定画面を閉じる・ページを再読み込みすると、自動でロックにもどります。</li>
        <li>パスワードを忘れたときの復旧方法は、README の「パスワードを忘れたとき」をご覧ください。</li>
      </ul>
      <label className="row" style={{ gap: 8, marginTop: 12 }}>
        <input type="checkbox" checked={disabled} onChange={() => void toggleDisabled()} />
        <span>この端末ではパスワードを使わない(設定画面をパスワードなしで開く)</span>
      </label>
      {disabled && <Banner kind="warn">この端末ではパスワードが無効です。ほかの端末には影響しません。チェックを外すと、この端末もパスワードで開くようになります。</Banner>}
      {askOff && (
        <Confirm
          title="この端末のパスワードを無効にしますか?"
          confirmLabel="無効にする"
          danger
          onCancel={() => setAskOff(false)}
          onConfirm={() => {
            setLockOff(true);
            setAskOff(false);
          }}
          message={<p>この端末だけ、パスワードなしで設定画面を開けるようになります(ほかの端末はそのままです)。お子さまが設定を変えてしまう可能性があります。</p>}
        />
      )}
      <form onSubmit={submit} style={{ maxWidth: 380, marginTop: 12 }}>
        <div className="field">
          <label htmlFor="curpw">現在のパスワード</label>
          <input id="curpw" type="password" autoComplete="off" value={cur} onChange={(e) => setCur(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="newpw">新しいパスワード({MIN_PASSWORD_LENGTH}文字以上)</label>
          <input id="newpw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="newpw2">新しいパスワード(もう一度)</label>
          <input id="newpw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
        <button className="btn btn-primary" disabled={busy || !cur || !pw}>
          パスワードを変更
        </button>
      </form>
    </div>
  );
}
