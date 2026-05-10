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
Cross-post once to your social networks. Auto-resize images, auto-split long text, preview before publishing — fully local.
```

### 日本語

```
複数 SNS への投稿を 1 クリックで。画像の自動リサイズ・長文の自動分割・公開前プレビュー対応、すべてブラウザ内で完結します。
```

## 詳細説明

> **重要**: SNS 名の繰り返し列挙は Chrome Web Store の "excessive keywords"
> 違反になる (2026-05 v0.4.11 申請で reject、Yellow Argon)。本文では SNS 名は
> **1 箇所だけ** 自然な文として言及し、機能列挙では「networks」「SNS」と
> 一般化する。サポート一覧は最後の 1 行のみ。

### v0.4.11 再申請 (現状) — English

```
Tutti is a Chrome extension that lets you publish to multiple social networks in a single click. Type once in Tutti's popup, pick which networks to send to, and Tutti handles the rest using your existing browser sessions.

What Tutti does

• Multi-network broadcast — one popup, send to multiple networks at the same time.
• Auto-thread split — text exceeding a network's character limit is automatically split into a continuation thread with "(1/N)" prefixes.
• Image attachment with auto-resize — up to 4 images per post, scaled via Canvas to fit each network's per-image size cap.
• Video pass-through — duration and file size are validated against each network's limits before posting.
• Live per-network progress — each row shows in-flight, completed, or failed status as it happens, with the cause inlined on failure.
• Preview mode (default) — Tutti opens each compose page for review and stops just before clicking Post; flip Auto-post on when you're ready to publish for real.
• Persistent draft — closing and reopening the popup keeps your text, attached media, and selections.
• Built-in diagnostics — one-click dump for filing issues when a network changes its UI.

Why Tutti

• Local — works entirely from your browser, reusing existing logged-in sessions.
• Privacy-first — your post content never touches a third-party server.
• User-triggered — Tutti only posts when you click; no scheduled or automated posts.
• Free — no subscription, no paid API.

How it works
Tutti drives each network's web compose page using your existing browser session. Posts go through the same path as if you had typed and clicked manually, just automated.

Currently supported networks: X, Bluesky, Threads, Mastodon, Misskey, Tumblr.

Source code: https://github.com/komm64/tutti
Privacy policy: https://komm64.github.io/tutti/
```

### v0.4.11 再申請 (現状) — 日本語

```
Tutti は複数 SNS への投稿を 1 クリックでこなす Chrome 拡張です。Tutti のポップアップに 1 度書いて、送信先の SNS を選ぶだけ。あとは Tutti がブラウザの既存ログインを使って各 SNS に流します。

主な機能

• マルチ SNS 同時投稿 — 1 つのポップアップから選択した SNS にまとめて送信。
• 文字数超過の自動スレッド分割 — 各 SNS の文字数上限を超える長文は「(1/N)」付きで自動的に連投スレッドに分割。
• 画像の自動リサイズ — 1 投稿あたり最大 4 枚。Canvas で各 SNS のサイズ上限に自動で収めます。
• 動画パススルー — 尺とファイルサイズを各 SNS の制約と照合してから投稿。
• 各 SNS のライブ進捗 — SNS 行に「投稿中 / 完了 / 失敗」がリアルタイムで表示。失敗時は原因もその場で見えます。
• プレビューモード(初期値) — 各 SNS の compose を開いて確認し Post 直前で停止。慣れてきたら自動投稿 ON で実投稿。
• 下書き・選択の永続化 — popup を閉じても本文・添付メディア・送信先選択がそのまま残ります。
• 内蔵 診断 ボタン — SNS の UI が変わった時に開発者へ送る JSON ダンプをワンクリックで生成。

なぜ Tutti

• ブラウザ完結 — 各 SNS の既存ログインセッションをそのまま再利用。
• プライバシー第一 — 投稿内容が第三者サーバーを経由しません。
• ユーザー操作起点 — クリックした瞬間だけ動作。スケジュール投稿はしません。
• 無料 — サブスクなし、有料 API 不使用。

仕組み
Tutti は各 SNS の Web 投稿ページを既存ログインのまま自動操作します。手動で入力 → Post を押すのと同じ経路を Tutti が代行するイメージです。

対応 SNS: X, Bluesky, Threads, Mastodon, Misskey, Tumblr。

ソースコード: https://github.com/komm64/tutti
プライバシーポリシー: https://komm64.github.io/tutti/
```

### v0.4.43+ update 用 — English (5 SNS 追加 + ffmpeg auto-compress 等を含む将来版)

承認後の update 時に置き換える draft (今回は使わない、参考として保管):

```
Tutti is a Chrome extension that lets you publish to multiple social networks in a single click. Type once in Tutti's popup, pick which networks to send to, and Tutti handles the rest using your existing browser sessions.

What Tutti does

• Multi-network broadcast — one popup, send to multiple networks at the same time.
• Auto-thread split — text exceeding a network's character limit is automatically split into a continuation thread.
• Image attachment with auto-resize — up to 4 images per post, scaled via Canvas to fit each network's per-image size cap.
• Video pass-through with on-device compression — duration and file size are validated against each network's limits; oversized videos are re-encoded locally with ffmpeg.wasm before posting.
• Live per-network progress — each row shows in-flight, completed, or failed status as it happens.
• Preview mode (default) — Tutti opens each compose page for review and stops just before clicking Post.
• Persistent draft — closing and reopening the popup keeps your text, attached media, and selections.
• Built-in diagnostics — one-click dump for filing issues when a network changes its UI.

Why Tutti

• Local — works entirely from your browser.
• Privacy-first — your post content never touches a third-party server.
• User-triggered — Tutti only posts when you click.
• Free — no subscription, no paid API.

Currently supported networks: X, Bluesky, Threads, Mastodon, Misskey, Tumblr, Pixiv, DeviantArt, Instagram, TikTok, YouTube.

Source code: https://github.com/komm64/tutti
Privacy policy: https://komm64.github.io/tutti/
```

### v0.4.43+ update 用 — 日本語

```
Tutti は複数 SNS への投稿を 1 クリックでこなす Chrome 拡張です。Tutti のポップアップに 1 度書いて、送信先の SNS を選ぶだけ。

主な機能

• マルチ SNS 同時投稿 — 1 つのポップアップから選択した SNS にまとめて送信。
• 文字数超過の自動スレッド分割 — 各 SNS の文字数上限を超える長文は自動で連投スレッドに分割。
• 画像の自動リサイズ — 1 投稿あたり最大 4 枚、各 SNS の上限に自動で収めます。
• 動画のローカル自動圧縮 — ffmpeg.wasm でブラウザ内再エンコード(生ファイルをサーバに送信しません)。
• 各 SNS のライブ進捗 — リアルタイム状態表示、失敗時は原因もその場で表示。
• プレビューモード(初期値) — 公開直前で停止し、内容を確認できます。
• 下書き・選択の永続化 — popup を閉じても本文・添付メディア・送信先選択が残ります。
• 内蔵 診断 ボタン — SNS の UI が変わった時の報告に使えます。

なぜ Tutti

• ブラウザ完結 — 各 SNS の既存ログインをそのまま再利用。
• プライバシー第一 — 投稿内容が第三者サーバーを経由しません。
• ユーザー操作起点 — クリックした瞬間だけ動作。
• 無料 — サブスクなし、有料 API 不使用。

対応 SNS: X, Bluesky, Threads, Mastodon, Misskey, Tumblr, Pixiv, DeviantArt, Instagram, TikTok, YouTube。

ソースコード: https://github.com/komm64/tutti
プライバシーポリシー: https://komm64.github.io/tutti/
```

## キーワード(検索候補、Web Store 入力欄)

Web Store に「キーワード」入力欄が別途あれば以下を使う。**description 本文には
入れない** (excessive keywords 違反になる)。

```
cross-post, crosspost, social media, multi-post, broadcast, クロスポスト, 同時投稿, マルチ SNS
```

## スクリーンショット (1280×800)

`docs/screenshots/` に同梱:

| ファイル | 用途 |
|---|---|
| `01-overview-1280x800.png` / `-en` | マルチ SNS 同時投稿のメインピッチ |
| `02-write-1280x800.png` / `-en` | 文字数自動分割 |
| `03-image-1280x800.png` / `-en` | 画像添付 + 自動リサイズ |
| `04-progress-1280x800.png` / `-en` | 進捗 UI(SNS 行統合) |
| `05-safety-1280x800.png` / `-en` | プレビューモード(誤投稿防止) |

ロケール別 listing には言語マッチする方を貼る。

> **TODO**: 11 SNS 対応 (P12-D/E で TikTok / YouTube 等追加) のスクショ更新。
> 旧スクショは「6 SNS チェックボックス」で映ってる可能性あり。

## プロモタイル

- Small (Web Store 必須): `docs/promo-440x280.png`(同梱済み)
- Marquee 1400x560 (任意): 未作成

## 権限の正当化(審査向け)

| 権限 | 説明 |
|---|---|
| `storage` | ユーザー設定 / 投稿履歴 / 下書き / SNS 選択をデバイス内に保存するため |
| `offscreen` | 動画の自動圧縮 (ffmpeg.wasm) を offscreen document で実行するため |
| `host_permissions`(各 SNS) | 各 SNS の投稿フォームの DOM 操作と compose URL 遷移のため。投稿経路でのみ使用 |
| `optional_host_permissions: https://*/*` | Mastodon / Misskey はユーザーが任意のインスタンスを指定可能。設定保存時にそのドメインのみを動的に要求し、それ以外には使わない |

## ストア掲載前チェックリスト

- [x] 全 SNS で実投稿確認(P12 で 11 SNS 全制覇、2026-05-02)
- [x] スクリーンショット 5 枚 1280×800(ja / en 両方)
- [x] プロモタイル 440×280
- [x] 拡張パッケージ zip 化 `npm run zip`
- [x] プライバシーポリシーを GitHub Pages で公開
- [x] Chrome Web Store 開発者登録 ($5 一回)
- [ ] 動画(任意、~30 秒のデモ)
- [x] **v0.4.11 申請 → 2026-05-02 reject (Yellow Argon: excessive keywords)**
- [ ] **v0.4.43 で description rewrite + 11 SNS 対応 + privacy 改善 を再申請**

## 過去の reject 履歴

| 日 | version | reason | 対応 |
|---|---|---|---|
| 2026-05-02 | 0.4.11 | Spam and Placement: Yellow Argon (excessive keywords — SNS 名の繰り返し列挙) | description 全面書き直し、SNS 名は最後の 1 行のみに集約 |
