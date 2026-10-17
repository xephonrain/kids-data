import { useState } from 'react';
import { Banner } from '../components/ui';
import { useStore } from '../data/store';
import { ActivitiesSection } from './ActivitiesSection';
import { BackupSection } from './BackupSection';
import { ChecksheetSection } from './ChecksheetSection';
import { ExtraSection } from './ExtraSection';
import { LockSection } from './LockSection';
import { PresetsSection } from './PresetsSection';
import { StickerSection } from './StickerSection';
import { SyncSection, statusLabel } from './SyncSection';
import { ThemeSection } from './ThemeSection';
import { TodayTomorrowCards } from './TodayTomorrowCards';
import { WeekdaySection } from './WeekdaySection';

const TABS = [
  { id: 'activities', label: 'やること' },
  { id: 'presets', label: 'プリセット' },
  { id: 'checksheet', label: 'チェックシート' },
  { id: 'sticker', label: 'シール' },
  { id: 'weekday', label: '曜日・祝日' },
  { id: 'theme', label: '配色' },
  { id: 'lock', label: 'パスワード・ロック' },
  { id: 'backup', label: 'バックアップ・復元' },
  { id: 'sync', label: '同期・通信' },
  { id: 'extra', label: '追加設定' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** 保護者用の設定画面。メイン画面(子ども向け)とは見た目を分けている */
export function SettingsScreen({ onClose, onDisconnect }: { onClose: () => void; onDisconnect?: () => void }) {
  const { gh, mode } = useStore();
  const [tab, setTab] = useState<Tab>('activities');

  const pillClass = mode === 'github' && gh.status === 'error' ? 'st-pill err' : mode === 'github' && (gh.status === 'offline' || gh.status === 'conflict') ? 'st-pill bad' : 'st-pill';

  return (
    <div className="st">
      <header className="st-head">
        <button className="btn" onClick={onClose}>
          ← もどる
        </button>
        <h1>
          せってい<span className="st-sub">(保護者用)</span>
        </h1>
        <button className={pillClass} style={{ border: 0, color: 'inherit', cursor: 'pointer' }} onClick={() => setTab('sync')} aria-label="同期の状態を見る">
          {statusLabel(mode, gh)}
        </button>
      </header>
      <main className="st-body">
        <TodayTomorrowCards />
        {mode === 'github' && gh.status === 'conflict' && (
          <Banner kind="warn">
            この端末とGitHubで内容がぶつかっています。
            <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setTab('sync')}>
              確認する
            </button>
          </Banner>
        )}
        <nav className="st-nav" aria-label="設定の項目">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        {tab === 'activities' && <ActivitiesSection />}
        {tab === 'presets' && <PresetsSection />}
        {tab === 'checksheet' && <ChecksheetSection />}
        {tab === 'sticker' && <StickerSection />}
        {tab === 'weekday' && <WeekdaySection />}
        {tab === 'theme' && <ThemeSection />}
        {tab === 'lock' && <LockSection />}
        {tab === 'backup' && <BackupSection />}
        {tab === 'sync' && <SyncSection onDisconnect={onDisconnect} />}
        {tab === 'extra' && <ExtraSection />}
      </main>
    </div>
  );
}
