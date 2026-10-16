import { useState } from 'react';
import { Banner } from '../components/ui';
import { useStore } from '../data/store';
import { useNow } from '../hooks';
import { findPreset, resolvePreset } from '../lib/presetResolver';
import { dateKey } from '../lib/time';

const PROGRESS_KEY = 'kt:progress:v1';

export function ExtraSection() {
  const { data, mode } = useStore();
  const now = useNow(30_000);
  const [msg, setMsg] = useState<string | null>(null);
  const today = dateKey(now);
  const r = resolvePreset(today, data);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="panel">
      <h2>追加設定</h2>

      <h3>この端末の表示</h3>
      <div className="row">
        <button
          className="btn"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen?.().catch(() => setMsg('この端末・ブラウザでは全画面にできません(ホーム画面に追加すると全画面で使えます)'));
          }}
        >
          全画面の切り替え
        </button>
        <button
          className="btn"
          onClick={() => {
            try {
              localStorage.removeItem(PROGRESS_KEY);
            } catch {
              /* noop */
            }
            setMsg('今日の進み具合をリセットしました。メイン画面に戻ると、いまの時刻の予定から表示されます。');
          }}
        >
          今日の進み具合をリセット
        </button>
      </div>
      {msg && <Banner kind="info">{msg}</Banner>}
      <p className="hint">「おわったよ」「まだおわってなかった」の進み具合は、この端末にだけ保存され、翌日に自動でリセットされます。</p>

      <h3>時刻の表示</h3>
      <p className="muted">現在時刻は「○じ○ふん」の形式で表示します(いまはこの形式のみ)。</p>

      <h3>状態の確認</h3>
      <table className="table">
        <tbody>
          <tr>
            <th>端末の日時</th>
            <td>{now.toLocaleString('ja-JP')}</td>
          </tr>
          <tr>
            <th>タイムゾーン</th>
            <td>{tz}</td>
          </tr>
          <tr>
            <th>今日のプリセット</th>
            <td>{findPreset(data, r.presetId)?.name ?? '(なし)'}</td>
          </tr>
          <tr>
            <th>保存先</th>
            <td>{mode === 'github' ? 'GitHub(非公開リポジトリ)+ この端末' : 'この端末のみ'}</td>
          </tr>
        </tbody>
      </table>
      <p className="hint">端末の時刻やタイムゾーンを変えると、時計・残り時間・予定は変更後の時刻にすぐ合わせて表示されます。</p>
    </div>
  );
}
