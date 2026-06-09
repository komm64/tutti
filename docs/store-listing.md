# Chrome Web Store listing draft

Reference document for Chrome Web Store submission. Each locale's text
(en / ja) is filled into the respective language listing in the Web Store
console (the same extension version can have per-language descriptions).

## Basic info

| 項目 | 値 |
|---|---|
| Extension name | Tutti |
| Category | Social & Communication / Productivity |
| Default language | English |
| Supported languages | 31 extension UI languages; Web Store listing text currently English / Japanese |
| Visibility | Public (or Unlisted for restricted initial distribution) |
| Pricing | Free |

## Short description (132 chars max)

### English

```
Cross-post once to your social networks. Auto-resize images, auto-split long text, preview before publishing — fully local.
```

### Japanese

```
複数 SNS への投稿を 1 クリックで。画像の自動リサイズ・長文の自動分割・公開前プレビュー対応、すべてブラウザ内で完結します。
```

## Full description

> **重要**: SNS 名の繰り返し列挙は Chrome Web Store の "excessive keywords"
> 違反になる (2026-05 v0.4.11 申請で reject、Yellow Argon)。本文では SNS 名は
> **1 箇所だけ** 自然な文として言及し、機能列挙では「networks」「SNS」と
> 一般化する。サポート一覧は最後の 1 行のみ。

### v0.4.11 resubmission — English

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
Privacy policy: https://tutti.komm64.com/privacy.html
```

### v0.4.11 resubmission — Japanese

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
プライバシーポリシー: https://tutti.komm64.com/privacy.html
```

### v0.4.81 update — English (current version with post-verify / auto-open / per-SNS resize / vertical letterbox)

```
Tutti is a Chrome extension that lets you publish to multiple social networks in a single click. Type once in Tutti's popup, pick which networks to send to, and Tutti handles the rest using your existing browser sessions.

What Tutti does

• Multi-network broadcast — one popup, send to multiple networks at the same time.
• Auto-thread split — text over a network's character limit is automatically split into a continuation thread, posted as a reply chain when the network supports it.
• Per-network image resize — each network receives an image scaled to its own size limit, so a strict 1 MB limit on one network doesn't lower the quality on a network that allows 30 MB.
• Local video compression — oversized videos are re-encoded in the browser via ffmpeg.wasm before posting. Optional 9:16 letterbox with blurred background for vertical-video networks.
• Post-verify — after posting, Tutti reads back the post page and flags silent failures (caption stripped, image missing, etc.) right in the popup.
• Auto-open on issue — when verify detects a problem, the post URL opens automatically so you can confirm immediately.
• Hashtag tag fields — `#hashtags` from the body are extracted and filled into the dedicated tag input on networks that use one.
• Live per-network progress — each row shows in-flight, completed, or failed status as it happens.
• Preview mode (default) — Tutti opens each compose page for review and stops just before clicking Post; flip Auto-post on when you're ready to publish for real.
• Persistent draft — closing and reopening the popup keeps your text, attached media, and selections.
• Built-in diagnostics + one-click bug report — for filing issues when a network changes its UI.

Why Tutti

• Local — works entirely from your browser, reusing existing logged-in sessions.
• Privacy-first — your post content never touches a third-party server.
• User-triggered — Tutti only posts when you click; no scheduled or automated posts.
• Responsible use — you are responsible for your content, accounts, and compliance with each platform's rules. Automation, repeated or duplicate content, unauthorized content, or missing sensitive-content labels may lead to platform enforcement.
• Free — no subscription, no paid API.

Currently supported networks: X, Bluesky, Threads, Mastodon, Misskey, Tumblr, Pixiv, DeviantArt, Instagram, TikTok, YouTube.

Source code: https://github.com/komm64/tutti
Privacy policy: https://tutti.komm64.com/privacy.html
Terms and disclaimer: https://tutti.komm64.com/terms.html
Support: https://tutti.komm64.com/support.html
```

### v0.4.81 update — Japanese

```
Tutti は複数 SNS への投稿を 1 クリックでこなす Chrome 拡張です。Tutti のポップアップに 1 度書いて、送信先を選ぶだけ。あとは Tutti がブラウザの既存ログインを使って各サービスに流します。

主な機能

• マルチ SNS 同時投稿 — 1 つのポップアップから選択先にまとめて送信。
• 文字数超過の自動スレッド分割 — 各サービスの上限を超える長文は自動で連投スレッドに分割。対応サービスではリプライチェーンとして連結。
• SNS ごとの画像リサイズ — 各サービスのサイズ上限に合わせて個別に縮小。1 MB 制限のあるサービスがあっても、30 MB まで許容するサービスでは高解像度を保ちます。
• 動画のローカル自動圧縮 — ffmpeg.wasm でブラウザ内再エンコード。縦動画 SNS 向けに 9:16 ぼかし背景 letterbox の任意整形にも対応。
• 投稿後 verify — 投稿後にポストページを読み取り、本文が消失していた / 画像が欠落していた などの silent failure をポップアップで通知。
• 問題検知時の自動オープン — verify が問題を検知したら投稿 URL を自動的に新タブで開いて確認を促します。
• ハッシュタグ自動振り分け — 本文の `#word` を抽出して、専用 tag 欄を持つサービスでは別フィールドにも自動入力。
• 各 SNS のライブ進捗 — リアルタイム状態表示、失敗時は原因もその場で表示。
• プレビューモード(初期値) — 公開直前で停止し、内容を確認できます。慣れたら自動投稿 ON で実投稿。
• 下書き・選択の永続化 — popup を閉じても本文・添付メディア・送信先が残ります。
• 内蔵 診断 + ワンクリック障害報告 — サービス UI 変更時の報告経路を内蔵。

なぜ Tutti

• ブラウザ完結 — 既存ログインセッションをそのまま再利用。
• プライバシー第一 — 投稿内容が第三者サーバーを経由しません。
• ユーザー操作起点 — クリックした瞬間だけ動作。スケジュール投稿はしません。
• 責任ある利用 — 投稿内容・アカウント・各サービスのルール遵守は利用者の責任です。自動化、重複または類似内容、権利のないコンテンツ、センシティブ表示不足などはプラットフォームによる制限対象になり得ます。
• 無料 — サブスクなし、有料 API 不使用。

対応 SNS: X, Bluesky, Threads, Mastodon, Misskey, Tumblr, Pixiv, DeviantArt, Instagram, TikTok, YouTube。

ソースコード: https://github.com/komm64/tutti
プライバシーポリシー: https://tutti.komm64.com/privacy.html
利用条件・免責事項: https://tutti.komm64.com/terms.html
サポート: https://tutti.komm64.com/support.html
```

## Keywords (search hints, Web Store input field)

Web Store に「キーワード」入力欄が別途あれば以下を使う。**description 本文には
入れない** (excessive keywords 違反になる)。

```
cross-post, crosspost, social media, multi-post, broadcast, クロスポスト, 同時投稿, マルチ SNS
```

## Screenshots (1280×800)

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

## Promo tile

- Small (Web Store 必須): `docs/promo-440x280.png`(同梱済み)
- Marquee 1400x560 (任意): 未作成

## Permission justifications (for review)

| 権限 | 説明 |
|---|---|
| `storage` | ユーザー設定 / 投稿履歴 / 下書き / SNS 選択をデバイス内に保存するため |
| `offscreen` | 動画の自動圧縮 (ffmpeg.wasm) を offscreen document で実行するため |
| `host_permissions`(各 SNS) | 各 SNS の投稿フォームの DOM 操作と compose URL 遷移のため。投稿経路でのみ使用 |
| `optional_host_permissions: https://*/*` | Mastodon / Misskey はユーザーが任意のインスタンスを指定可能。設定保存時にそのドメインのみを動的に要求し、それ以外には使わない |

## Pre-listing checklist

- [x] 全 SNS で実投稿確認(P12 で 11 SNS 全制覇、2026-05-02)
- [x] スクリーンショット 5 枚 1280×800(ja / en 両方)
- [x] プロモタイル 440×280
- [x] 拡張パッケージ zip 化 `npm run zip`
- [x] プライバシーポリシーを公開サイトで公開
- [x] Chrome Web Store 開発者登録 ($5 一回)
- [ ] 動画(任意、~30 秒のデモ)
- [x] **v0.4.11 申請 → 2026-05-02 reject (Yellow Argon: excessive keywords)**
- [x] **v0.4.43 description rewrite + 11 SNS 対応 で再申請 → 2026-05-XX 通過 (Unlisted)**
- [ ] **v0.4.81 update**: post-verify / auto-open / per-SNS resize / 動画 9:16 letterbox の機能追加分を反映

## Past reject history

| 日 | version | reason | 対応 |
|---|---|---|---|
| 2026-05-02 | 0.4.11 | Spam and Placement: Yellow Argon (excessive keywords — SNS 名の繰り返し列挙) | description 全面書き直し、SNS 名は最後の 1 行のみに集約 |
