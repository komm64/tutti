# Tutti

> クロスポストの面倒を全部肩代わりする Chrome 拡張機能 / All cross-posting hassle, handled.

複数の SNS に同じ投稿を一気に流す Chrome 拡張機能です。
文字数オーバーは自動でスレッド分割、画像は各 SNS の制約に自動リサイズ、
動画は尺・サイズを判定してから送信します。
**投稿内容は第三者サーバーを一切経由しません。**

🔒 [プライバシーポリシー](https://komm64.github.io/tutti/)

<!-- スクショ追加予定 (1280×800)
![popup](./docs/screenshots/popup.png)
-->

## できること

- 📤 **マルチ SNS 同時投稿** — 一度書けば、選んだ全ての SNS にワンクリック
- ✂️ **文字数オーバーの自動スレッド分割** — `(1/N)` 形式で連番付きの逐次投稿
- 🖼️ **画像最大 4 枚 + 自動リサイズ** — Bluesky の 1MB 等の厳しい制限にも自動でフィット
- 🎬 **動画送信** — 尺・サイズを判定して適合 SNS にだけ送る
- 📊 **ライブ進捗表示** — 各 SNS の投稿状況をリアルタイムで確認
- 🪪 **ログイン中アカウント表示** — popup で「いまどのアカウントから投稿されるか」が見える(誤爆防止)
- 📜 **投稿履歴** — 直近 20 件をローカルに保存
- 💾 **下書き自動保存** — popup を閉じてもテキストは消えない
- ⌨️ **Ctrl/Cmd + Enter で投稿**
- ⚙️ **Mastodon / Misskey インスタンス切り替え** — 設定画面から任意のインスタンスを指定可能
- 🌐 **多言語対応** — 日本語 / English

## 対応 SNS

11 ネットワーク対応。実機投稿で安定確認できているものを「Stable」、
adapter 実装は済んでいるが実投稿の動作確認が浅いものを「Experimental」と
区別しています。Experimental は preview (autoPost OFF) での検証から始めるのを推奨。

### Stable (実投稿確認済)

| ネットワーク | text | image | shortVideo | longVideo | 経路 |
|---|:---:|:---:|:---:|:---:|---|
| X (旧 Twitter) | ✅ | ✅ | ✅ | — | DOM |
| Bluesky | ✅ | ✅ | ✅ | — | API (DOM fallback) |
| Threads | ✅ | ✅ | ✅ | — | DOM |
| Mastodon | ✅ | ✅ | ✅ | — | API (DOM fallback) |
| Misskey | ✅ | ✅ | ✅ | — | API (DOM fallback) |
| Tumblr | ✅ | ✅ | ✅ | ✅ | DOM |
| Pixiv | — | ✅ | — | — | DOM (multi-step) |
| TikTok | — | — | ✅ | — | DOM (multi-step) |
| YouTube (Shorts) | — | — | ✅ | — | DOM (multi-step) |

### Experimental (adapter のみ・autoPost 実投稿は未検証)

| ネットワーク | text | image | shortVideo | longVideo | 経路 |
|---|:---:|:---:|:---:|:---:|---|
| Instagram | — | ✅ | ✅ | — | DOM (multi-step) |
| DeviantArt | — | ✅ | — | — | DOM (multi-step) |

「経路」の意味:
- **DOM**: SNS の Web 投稿ページを自動操作する経路 (anti-bot 対策の影響を受けやすい)
- **API**: 公式 API を直接叩く経路。credentials を Settings に登録すると有効。
  失敗時は DOM にフォールバックしない (= 明示的に user へ通知)
- **multi-step**: 複数モーダルの wizard 型 UI 用 (P12 framework)

## インストール

### Chrome Web Store

準備中。

### 開発版

[Releases](https://github.com/komm64/tutti/releases) から最新の zip をダウンロードして:

1. 解凍
2. `chrome://extensions/`(Brave なら `brave://extensions/`)を開く
3. 「デベロッパーモード」を ON
4. 「パッケージ化されていない拡張機能を読み込む」→ 解凍したフォルダを選択

## プライバシー

投稿テキスト・画像・動画は**ユーザーのブラウザ内でのみ**処理され、
第三者のサーバーには送信されません。
詳細は[プライバシーポリシー](https://komm64.github.io/tutti/)。

## ライセンス

[All Rights Reserved](./LICENSE) — © 2026 komm64

ソースコードは透明性のため公開していますが、再配布・再利用・改変は許可していません。

---

## 開発(コントリビューター・コードレビュー向け)

このセクションは、コードを読んで動作を確認したい方や、
issue / PR を出してくださる方向けの情報です。

### 技術スタック

- [WXT](https://wxt.dev/) — Vite ベースの MV3 拡張ビルドツール
- TypeScript (strict + `noUncheckedIndexedAccess`)
- Svelte 5 (runes)
- Tailwind CSS v4
- Vitest

### コマンド

```bash
npm install
npm run dev          # Chrome 用 HMR 開発サーバー
npm run dev:firefox  # Firefox 用
npm run build        # 本番ビルド (.output/chrome-mv3/)
npm run zip          # Chrome Web Store 提出用 zip
npm run compile      # 型チェック
npm test             # 単体テスト
```

### ディレクトリ構成

```
entrypoints/
  background.ts                  - service worker (orchestrator)
  popup/                         - popup UI (Svelte 5)
  options/                       - 設定画面 (Svelte 5)
  offscreen/                     - 動画整形用 offscreen document
  {x,bluesky,threads,mastodon,misskey,tumblr,pixiv,tiktok,youtube,
   instagram,deviantart}.content.ts
                                 - 各 SNS 用 content script
src/
  messages.ts                    - メッセージ型定義
  storage.ts                     - chrome.storage 集約 API
  adapters/                      - 各 SNS のメタ情報・URL・selectors
  utils/                         - 共通ユーティリティ
public/
  icon/                          - 拡張アイコン
  _locales/{ja,en}/messages.json - 翻訳
docs/
  index.html                     - GitHub Pages 用プライバシーページ
  store-listing.md               - Web Store 申請ドラフト
```
