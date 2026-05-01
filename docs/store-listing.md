# Chrome Web Store 申請ドラフト

Web Store の申請フォームから直接コピペできる形にまとめたもの。
各ロケール (en / ja) の文章は Chrome Web Store の言語別 listing にそれぞれ
入れる(同じ extension の同じバージョンに対して言語別の説明を保持できる)。

## 基本情報

| 項目 | 値 |
|---|---|
| Extension name | Tutti |
| Category | Social & Communication / Productivity |
| Default language | English |
| Supported languages | English / 日本語 |
| Visibility | Public(または最初は Unlisted で限定配布) |
| Pricing | Free |

## 短い説明 (132 chars max)

### English

```
Cross-post text and images to X, Bluesky, Threads, Tumblr, Mastodon, and Misskey from one popup. Preview-first, no backend.
```

### 日本語

```
X / Bluesky / Threads / Tumblr / Mastodon / Misskey へのクロスポストを 1 クリック。プレビュー安全、画像自動リサイズ、バックエンド不要。
```

## 詳細説明

### English

```
Tutti is a Chrome extension that takes the hassle out of cross-posting to multiple social networks. Compose once, broadcast to X, Bluesky, Threads, Tumblr, Mastodon, and Misskey simultaneously.

Key features
• Multi-network broadcast — one popup, six networks: X / Bluesky / Threads / Tumblr / Mastodon / Misskey
• Auto-thread split — text exceeding a network's char limit (X 280, Bluesky 300, Threads 500…) is automatically split into a thread with "(1/N)" prefixes
• Image attachment with auto-resize — up to 4 images per post, automatically resized via Canvas to fit each network's size cap (e.g. Bluesky's 1 MB)
• Video pass-through — duration and file size are validated against each network's constraints before posting
• Live per-network progress — each network row shows in-flight / done / failed status as it happens; failures display the cause inline
• Preview mode (Auto-post OFF, default) — Tutti opens each network's compose for review and stops just before clicking Post; turn Auto-post ON when you're ready to post for real
• Persistent draft & selection — closing and reopening the popup keeps your text, attached media, and selected networks intact
• Built-in diagnostics — one-click "Diagnose" dump for filing GitHub issues when a network changes its UI

Why Tutti
• No backend — works entirely from your browser, reusing existing logged-in sessions on each network
• Privacy-first — your post content never touches a third-party server
• User-triggered — Tutti only posts when you click; no scheduled or automated posts, avoiding account-suspension risk and Web Store policy issues
• Free — no subscription, no API costs (Tutti deliberately avoids X's $200/mo API to stay free)

How it works
Tutti drives each network's web compose page using the existing browser session. Posts go through the same path as if you had typed and clicked manually, just automated.

Notes
• Tutti relies on the web UI of each network. When a network ships a UI redesign, specific platforms may break temporarily — please file a report from the in-extension "Diagnose" button.
• Tumblr's image upload uses the editor's drop zone (Gutenberg-compatible).
• X uses the home-feed inline compose (not the /intent/post modal) to avoid draft-state leakage between forms.

Source code & issues: https://github.com/komm64/tutti
Privacy policy: https://komm64.github.io/tutti/
```

### 日本語

```
Tutti は X / Bluesky / Threads / Tumblr / Mastodon / Misskey への同時投稿を 1 クリックで行う Chrome 拡張です。一度書けば、選んだ全ての SNS に流せます。

主な機能
• マルチネットワーク同時投稿 — 1 つのポップアップから 6 ネットワークへ(X / Bluesky / Threads / Tumblr / Mastodon / Misskey)
• 自動スレッド分割 — 各 SNS の文字数上限(X 280 / Bluesky 300 / Threads 500…)を超える長文は「(1/N)」付きで自動的にスレッド化
• 画像の自動リサイズ — 1 投稿あたり最大 4 枚。Canvas で各 SNS のサイズ上限(Bluesky 1MB 等)に自動で収めます
• 動画パススルー — 尺・ファイルサイズを各 SNS の制約と照合してから投稿
• 各 SNS のライブ進捗 — SNS 行に「投稿中 / 完了 / 失敗」がリアルタイムで表示。失敗時は原因もその場で見えます
• プレビューモード(自動投稿 OFF、初期値) — 各 SNS の compose を開いて確認し Post 直前で停止。慣れてきたら自動投稿 ON で実投稿
• 下書き / 選択の永続化 — popup を閉じても本文・添付メディア・SNS 選択がそのまま残ります
• 内蔵 診断 ボタン — SNS の UI が変わった時に GitHub Issue に貼れる JSON をワンクリックで生成

なぜ Tutti
• バックエンド不要 — ブラウザの既存ログインセッションをそのまま使う
• プライバシー第一 — 投稿内容が第三者サーバーを経由しません
• ユーザー操作起点 — クリックした瞬間だけ動作。スケジュール投稿はしません(アカウント BAN リスクと Web Store ポリシー回避)
• 無料 — サブスク無し、API 課金無し(X の $200/月 API を意図的に避けて無料を維持)

仕組み
Tutti は各 SNS の Web 投稿ページをブラウザ内で自動操作します。あなたが手動で投稿フォームに入力 → Post を押す、と同じ経路を Tutti が代行するイメージです。

注意
• Tutti は各 SNS の Web UI に依存します。SNS 側で UI が大幅に変わると一部 SNS が一時的に動かなくなる可能性があります。拡張内の「診断」ボタンの出力を貼って Issue を立ててください。
• Tumblr の画像添付は Gutenberg エディタの drop zone 経由です。
• X はホーム画面の inline compose を使います(/intent/post の modal ではなく、draft 漏れ問題回避のため)。

ソースコード / Issues: https://github.com/komm64/tutti
プライバシーポリシー: https://komm64.github.io/tutti/
```

## キーワード(検索候補)

cross-post, crosspost, social media, multi-post, broadcast, X, Twitter, Bluesky, Threads, Tumblr, Mastodon, Misskey, クロスポスト, 同時投稿, マルチ SNS

## スクリーンショット (1280×800)

`docs/screenshots/` に同梱:

| ファイル | 用途 |
|---|---|
| `01-overview-1280x800.png` / `-en` | 全 6 SNS 対応・1 クリック投稿のメインピッチ |
| `02-write-1280x800.png` / `-en` | 文字数自動分割 |
| `03-image-1280x800.png` / `-en` | 画像添付 + 自動リサイズ |
| `04-progress-1280x800.png` / `-en` | 進捗 UI(SNS 行統合) |
| `05-safety-1280x800.png` / `-en` | プレビューモード(誤投稿防止) |

ロケール別 listing には言語マッチする方を貼る。

## プロモタイル

- Small (Web Store 必須): `docs/promo-440x280.png`(同梱済み)
- Marquee 1400x560 (任意): 未作成

## 権限の正当化(審査向け)

| 権限 | 説明 |
|---|---|
| `storage` | ユーザー設定 / 投稿履歴 / 下書き / SNS 選択をデバイス内に保存するため |
| `offscreen` | 将来機能(動画整形)で offscreen document に ffmpeg.wasm をロードするため |
| `host_permissions`(各 SNS) | 投稿フォームの DOM 操作と compose URL 遷移のため |
| `optional_host_permissions: https://*/*` | Mastodon / Misskey は federated でユーザーが任意のインスタンスを指定できるため。設定保存時にそのドメインのみを動的に要求し、それ以外には使わない |

## ストア掲載前チェックリスト

- [x] 全 SNS で実投稿確認(autoPost ON で 6/6 SNS 成功、2026-05-01)
- [x] スクリーンショット 5 枚 1280×800(ja / en 両方)
- [x] プロモタイル 440×280
- [x] 拡張パッケージ zip 化 `npm run zip` → `.output/tutti-0.4.8-chrome.zip`
- [ ] プライバシーポリシーを GitHub Pages で公開(Settings → Pages → main /docs)
- [ ] Chrome Web Store 開発者登録 ($5 一回)
- [ ] 動画(任意、~30 秒のデモ)
- [ ] Web Store ダッシュボードで申請(まずは Unlisted 推奨、5〜10 名でフィードバック取得後に Public 化)
