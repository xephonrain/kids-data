# 設計メモ

## 構成
- React + TypeScript + Vite(`base: './'` なので GitHub Pages のサブパスで動く)
- データ層は「ローカル優先」。画面は常にメモリ上の `AppData` を読み書きし、`SyncEngine` が Supabase と同期する。
- Supabase の環境変数が無い場合は **ローカル専用モード**(localStorage / IndexedDB のみ)。

## 時刻モデル
- 予定は「0時からの分」(end ≤ 1440)。残り時間は端末時計から毎tick計算(切り上げ)。
- 進行状態 `Progress {dateKey, presetId, itemId, held, finished}` は端末ごとに localStorage へ保存。日付・プリセットが変わるとリセット。
- 切替モード(自動/手動)の優先度: 予定項目 > 活動 > プリセット。

## プリセット決定の優先順位
日付指定(今日だけ/明日だけ/特別日) > 祝日 > 曜日別 > デフォルト。祝日は 2000〜2099 年を端末内で計算(春分・秋分、ハッピーマンデー、国民の休日、振替休日)。

## 保存と同期(GitHub)
- Supabase等のサーバーは使わない。設定は `kids-timer/data.json`、画像は `kids-timer/images/<uuid>.webp` として、利用者の**非公開リポジトリ**にGitHub Contents APIで保存する。
- 画面は常に端末内の `AppData`(`SyncEngine` + localStorage、画像はIndexedDB)を見る。`GithubSync` が、保存・取得・競合検出を行う。
- 競合検出: 端末側に「前回同期時のハッシュ」と「GitHub上のファイルsha」を保持。GitHubのshaが変わっていて、端末にも未保存の変更があれば競合として停止し、利用者に選ばせる。PUT時のsha不一致(409)は取得からやり直す。
- 画像のパスは一意で不変(`local/<uuid>.webp`)。端末にない画像はGitHubから取得してIndexedDBに保存する。
- 起動時・画面復帰・オンライン復帰・60秒ごとに同期。編集後は2.5秒のデバウンスで保存。

## 認証(コード)
- 最初の画面で「コード」(`kt1.` + base64url{リポジトリ, トークン})を入力すると接続し、接続情報は端末のlocalStorageに保存。次回からは入力なしで開く。
- トークンは利用者が入力したものだけ。ビルド・ソース・Actionsには含めない。最小権限(対象リポジトリのみ、Contents: Read and write)を案内。
- 接続時にリポジトリが非公開であることと書き込み権限を確認し、公開リポジトリは拒否する。
- 画面ロックのパスワード(PBKDF2-SHA256、210000回+salt)のハッシュは `data.json` に含めて端末間で共有。ロックはGitHubの認可の代わりではなく、誤操作防止。

## 画像
最大 1024px の WebP に縮小して端末に保存し、同期時にGitHubへ送る。表示設定(形・拡大・位置・枠)は非破壊で設定データに保存。
