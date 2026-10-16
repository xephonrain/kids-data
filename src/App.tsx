import { useCallback, useEffect, useState } from 'react';
import { LockDialog } from './components/LockDialog';
import { SetupScreen } from './components/SetupScreen';
import { MainScreen } from './components/MainScreen';
import { clearConnection, loadConnection, type Connection } from './data/github';
import { DataProvider, useStore } from './data/store';
import { SettingsScreen } from './settings/SettingsScreen';

type View = 'main' | 'lock' | 'settings';

/**
 * メイン画面 → パスワード入力 → 設定画面 の遷移。
 * 「ロック解除」状態は設定画面を開いている間だけ有効で、閉じると自動でロックに戻る。
 * 状態はメモリ上だけに持つので、ページを再読み込みすると必ずロック状態から始まる。
 */
function Shell({ setUnlocked, onDisconnect }: { setUnlocked: (v: boolean) => void; onDisconnect?: () => void }) {
  const { data, update } = useStore();
  const [view, setView] = useState<View>('main');

  const go = useCallback(
    (v: View) => {
      setView(v);
      setUnlocked(v === 'settings');
    },
    [setUnlocked]
  );
  useEffect(() => () => setUnlocked(false), [setUnlocked]);

  return (
    <>
      <MainScreen onOpenSettings={() => go(data.settings.lockDisabled ? 'settings' : 'lock')} />
      {view === 'lock' && (
        <LockDialog
          settings={data.settings}
          onCreate={(rec) => update((d) => ({ ...d, settings: { ...d.settings, ...rec } }))}
          onUnlocked={() => go('settings')}
          onCancel={() => go('main')}
        />
      )}
      {view === 'settings' && (
        <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: '#f5f4fb', zIndex: 20 }}>
          <SettingsScreen onClose={() => go('main')} onDisconnect={onDisconnect} />
        </div>
      )}
    </>
  );
}

function WithLock({ conn, onDisconnect }: { conn: Connection; onDisconnect: () => void }) {
  const [unlocked, setUnlocked] = useState(false);
  const github = conn.mode === 'github' ? { repo: conn.repo, token: conn.token } : null;
  return (
    <DataProvider github={github} canEdit={unlocked}>
      <Shell setUnlocked={setUnlocked} onDisconnect={onDisconnect} />
    </DataProvider>
  );
}

export function App() {
  const [conn, setConn] = useState<Connection | null>(() => loadConnection());
  if (!conn) return <SetupScreen onDone={setConn} />;
  return (
    <WithLock
      key={conn.mode === 'github' ? conn.repo : 'local'}
      conn={conn}
      onDisconnect={() => {
        clearConnection();
        setConn(null);
      }}
    />
  );
}
