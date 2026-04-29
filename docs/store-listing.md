# Chrome Web Store 申請ドラフト

申請時にこのファイルからコピペできるようにまとめておく。

## 基本情報

| 項目 | 値 |
|---|---|
| Extension name | Tutti |
| Category | Social & Communication / Productivity |
| Language | English (Japanese 含む) |
| Visibility | Public |
| Pricing | Free |

## 短い説明 (132 chars max)

### 英語

```
Cross-post text, images, and video to X, Bluesky, Threads, Mastodon, and Misskey from one popup. No backend, no data leaves your browser.
```
(132 chars)

### 日本語

```
X / Bluesky / Threads / Mastodon / Misskey へのクロスポストを 1 クリック。文字数オーバーは自動分割、画像も自動リサイズ。バックエンド不要、データ第三者送信ゼロ。
```

## 詳細説明

### 英語

```
Tutti is a browser extension that takes the hassle out of cross-posting to multiple social networks. Compose once, broadcast to X, Bluesky, Threads, Mastodon, and Misskey simultaneously.

Key features:
• Multi-SNS broadcast — one popup, all networks
• Auto-thread split — text exceeding a platform's char limit is automatically split into a thread with "(1/N)" prefixes
• Image attachment — up to 4 images per post, automatically resized to fit each platform's limit (e.g. Bluesky's 1MB cap)
• Video pass-through — duration and file size validated against each platform's constraints
• Live progress — see each platform's post status in real time
• Post history — last 20 posts kept locally for reference
• Draft auto-save — text persists across popup closes
• Per-account display — see which account you're posting as on each network (avoids cross-account mistakes)
• Mastodon & Misskey instance switching — configurable in settings

Why Tutti?
• No backend — works directly from your browser, reusing your existing logged-in sessions
• Privacy-first — your post content never touches a third-party server
• User-driven — only posts when you click; no scheduled or automated posts (avoids account bans and Web Store policy issues)
• Free — no subscription, no API costs

Tutti relies on the web compose pages of each network. UI changes on the SNS side may temporarily break specific platforms; please report issues on GitHub.

Source code & issues: https://github.com/komm64/tutti
Privacy policy: https://komm64.github.io/tutti/#privacy
```

### 日本語

```
Tutti は X / Bluesky / Threads / Mastodon / Misskey への同時投稿を 1 クリックで行う Chrome 拡張です。一度書けば、選んだ全ての SNS に流せます。

主な機能:
• マルチ SNS 同時投稿 — 1 つのポップアップから全ネットワークへ
• 自動スレッド分割 — プラットフォームの文字数上限を超える長文は "(1/N)" 形式で自動的にスレッド化
• 画像添付 — 1 投稿あたり最大 4 枚、各プラットフォームの上限(Bluesky 1MB 等)に合わせて自動リサイズ
• 動画パススルー — 尺・ファイルサイズを各プラットフォームの制約と照合
• ライブ進捗 — 各プラットフォームの投稿状況をリアルタイム表示
• 投稿履歴 — 直近 20 件をローカルに保存
• 下書き自動保存 — ポップアップを閉じてもテキストは消えません
• アカウント表示 — 各ネットワークでどのアカウントから投稿されるかを popup で確認(誤爆防止)
• Mastodon / Misskey インスタンス切替 — 設定画面から任意のインスタンスを指定可能

なぜ Tutti?
• バックエンド不要 — ブラウザの既存ログインセッションをそのまま使う
• プライバシー第一 — 投稿内容が第三者サーバーを経由しません
• ユーザー操作起点 — クリックした瞬間だけ動作。スケジュール投稿はしません(アカウント BAN リスクと Web Store ポリシー回避)
• 無料 — サブスク無し、API 課金無し

各 SNS の Web 投稿ページに依存します。SNS 側の UI 更新で一部プラットフォームが一時的に動かなくなることがあります。GitHub に Issue を立ててください。

ソースコード & Issues: https://github.com/komm64/tutti
プライバシーポリシー: https://komm64.github.io/tutti/#privacy
```

## キーワード(検索候補)

cross-post, crosspost, X, Twitter, Bluesky, Threads, Mastodon, Misskey, social media, broadcast, multi-post, クロスポスト, 同時投稿

## スクリーンショット要件

Chrome Web Store: 1280×800 または 640×400、最低 1 枚、推奨 5 枚。

撮影候補:
1. popup の通常状態 (テキスト + プラットフォーム選択 + 全アカウント検出済み)
2. 文字数超過時の "N posts" 表示 + オレンジ警告
3. 画像添付 + リサイズ済みプレビュー
4. 投稿履歴パネル
5. 設定画面 (Mastodon / Misskey インスタンス)

## プロモタイル

- Small: 440×280 必須
- Marquee: 1400×560 任意

ロゴ + 「クロスポストの面倒を全部肩代わり」コピーで作成予定。

## 権限の正当化(審査向け)

| 権限 | 説明 |
|---|---|
| `storage` | ユーザー設定 / 投稿履歴 / 下書きをデバイス内に保存するため |
| `offscreen` | 将来機能(動画整形)で offscreen document に ffmpeg.wasm をロードするため |
| `host_permissions` (各 SNS) | 投稿フォームの DOM 操作と compose URL 遷移のため |
| `optional_host_permissions: https://*/*` | Mastodon / Misskey は federated でユーザーが任意のインスタンスを指定できるため。設定保存時にそのドメインのみを動的に要求し、それ以外には使わない |

## ストア掲載前チェックリスト

- [ ] 全 SNS で投稿成功を実機確認
- [ ] スクリーンショット 5 枚撮影
- [ ] プロモタイル作成 (440x280)
- [ ] プライバシーポリシーを GitHub Pages 等で公開
- [ ] 動画 (オプション、~30 秒のデモ)
- [ ] Chrome Web Store 開発者登録 ($5)
- [ ] 拡張パッケージ zip 化 (`npm run zip`)
