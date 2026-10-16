import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MIN_PASSWORD_LENGTH, createLock, verifyLock } from '../lib/lock';
import type { AppSettings } from '../types';
import { Banner, Modal } from './ui';

interface Props {
  settings: AppSettings;
  /** 初回のパスワード登録 */
  onCreate: (rec: { lockSalt: string; lockHash: string; lockIterations: number }) => void;
  onUnlocked: () => void;
  onCancel: () => void;
}

const MAX_FAILS = 5;
const COOLDOWN_MS = 30_000;

/** 設定画面を開くときのパスワード入力。パスワード未設定なら、はじめに決める */
export function LockDialog({ settings, onCreate, onUnlocked, onCancel }: Props) {
  const hasLock = !!settings.lockHash;
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fails = useRef(0);
  const blockedUntil = useRef(0);
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const waitSec = Math.max(0, Math.ceil((blockedUntil.current - Date.now()) / 1000));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!hasLock) {
      if (pw.length < MIN_PASSWORD_LENGTH) return setError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`);
      if (pw !== pw2) return setError('確認用のパスワードが一致しません');
      setBusy(true);
      onCreate(await createLock(pw));
      setBusy(false);
      onUnlocked();
      return;
    }
    if (Date.now() < blockedUntil.current) return;
    setBusy(true);
    const ok = await verifyLock(pw, settings);
    setBusy(false);
    if (ok) {
      fails.current = 0;
      onUnlocked();
    } else {
      fails.current += 1;
      setPw('');
      if (fails.current >= MAX_FAILS) {
        fails.current = 0;
        blockedUntil.current = Date.now() + COOLDOWN_MS;
        setError('まちがいが続いたため、30秒待ってからもう一度入力してください');
      } else {
        setError('パスワードが違います');
      }
    }
  };

  return (
    <Modal title={hasLock ? 'せってい(保護者用)' : 'はじめに、設定用のパスワードを決めてください'} onClose={onCancel}>
      <form onSubmit={submit} className="lock-form">
        {!hasLock && <p className="muted">お子さまが設定を変えてしまわないための、画面のロックです。{MIN_PASSWORD_LENGTH}文字以上で決めてください。</p>}
        <div className="field">
          <label htmlFor="lockpw">{hasLock ? 'パスワード' : '新しいパスワード'}</label>
          <input id="lockpw" type="password" autoFocus autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} disabled={waitSec > 0} />
        </div>
        {!hasLock && (
          <div className="field">
            <label htmlFor="lockpw2">もう一度入力</label>
            <input id="lockpw2" type="password" autoComplete="off" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
        )}
        {error && <Banner kind="error">{error}</Banner>}
        {waitSec > 0 && <Banner kind="warn">あと{waitSec}秒お待ちください</Banner>}
        <div className="row-end">
          <button type="button" className="btn" onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || waitSec > 0 || pw.length === 0}>
            {hasLock ? 'ひらく' : '決定'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
