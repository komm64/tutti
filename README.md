# Tutti

> クロスポストの面倒を全部肩代わりする Chrome 拡張機能 / All cross-posting hassle, handled.

X / Bluesky / Threads / Mastodon / Misskey / Tumblr に同じ投稿を一気に流す
Chrome 拡張機能です。文字数超過は各プラットフォームの上限に合わせて
自動でスレッド分割、画像は各 SNS の制約に自動リサイズ、動画は尺・サイズを
判定してから送信します。投稿内容は第三者サーバーを一切経由しません。

<!-- スクショは公開準備完了後に追加 (1280×800)
![popup screenshot](./docs/screenshots/popup.png)
-->

## 主な機能

- 📤 **マルチ SNS 同時投稿** — X / Bluesky / Threads / Mastodon / Misskey / Tumblr
- ✂️ **文字数オーバー時の自動スレッド分割** — 各プラットフォーム上限に
  合わせて単語境界で切り分け、`(1/N) ` 形式の連番で逐次投稿
- 🖼️ **画像添付 + 自動リサイズ** — 最大 4 枚、Bluesky の 1MB 制限等に
  自動でフィットさせる(Canvas + JPEG 変換)
- 🎬 **動画パススルー** — メタデータから尺・サイズを判定し、不適合な
  プラットフォームはスキップ
- 📊 **ライブ進捗表示** — 各プラットフォームの投稿状況をリアルタイム表示
- 🪪 **アカウント名表示** — 各 SNS でいまどのアカウントから投稿されるかを
  popup に表示(誤爆防止)
- 📜 **投稿履歴** — 直近 20 件をローカルに保存
- 💾 **下書き自動保存** — popup を閉じてもテキストは消えない
- ⌨️ **Ctrl/Cmd + Enter ショートカット**
- ⚙️ **Mastodon / Misskey インスタンス切り替え** — 設定画面から任意の
  インスタンスを指定可能
- 🌐 **多言語対応** — 日本語 / English

## 設計上の特徴

- **バックエンド不要** — ブラウザの既存ログインセッションをそのまま使う
- **プライバシー第一** — 投稿内容を第三者サーバーに送信しない
- **ユーザー操作起点** — クリックした瞬間だけ動作、自動投稿はしない
- **MV3 ネイティブ** — Chrome 拡張の最新仕様に準拠

## インストール

### 開発者向け(Chrome / Brave / Edge)

1. このリポジトリを clone
2. `npm install && npm run build`
3. ブラウザで `chrome://extensions/`(Brave なら `brave://extensions/`)を開く
4. 「デベロッパーモード」をオン
5. 「パッケージ化されていない拡張機能を読み込む」→ `.output/chrome-mv3/` を選択

### Chrome Web Store(準備中)

実機検証完了後に申請予定。

## 技術スタック

- [WXT](https://wxt.dev/) — Vite ベースの MV3 拡張ビルドツール
- TypeScript (strict + `noUncheckedIndexedAccess`)
- Svelte 5 (runes)
- Tailwind CSS v4
- Vitest (単体テスト)

## 開発

```bash
npm install
npm run dev          # Chrome 用 HMR 開発サーバー
npm run dev:firefox  # Firefox 用
npm run build        # 本番ビルド (.output/chrome-mv3/)
npm run zip          # Chrome Web Store 提出用 zip
npm run compile      # 型チェック (tsc --noEmit)
npm test             # 単体テスト
npm run test:watch   # watch モード
```

開発時は `chrome://extensions/` で「パッケージ化されていない拡張機能を
読み込む」から `.output/chrome-mv3/` を指定。

### ディレクトリ構成

```
entrypoints/
  background.ts                  - service worker (orchestrator)
  popup/                         - popup UI (Svelte 5)
  options/                       - 設定画面 (Svelte 5)
  offscreen/                     - 動画整形 offscreen document
  {x,bluesky,threads,mastodon,misskey,tumblr}.content.ts
                                 - 各 SNS 用 content script
src/
  messages.ts                    - メッセージ型定義
  storage.ts                     - chrome.storage 集約 API
  adapters/                      - 各 SNS のメタ情報・URL・selectors
  utils/
    dom.ts                       - waitForElement / findClickableByText 等
    post-flow.ts                 - SNS 共通の投稿フロー
    image.ts                     - 画像注入 (DataTransfer)
    image-resize.ts              - Canvas でリサイズ
    user-detect.ts               - ログイン中アカウント検出
    split.ts                     - 文字数オーバーの分割
public/
  icon/                          - 拡張アイコン
  _locales/{ja,en}/messages.json - 翻訳
docs/
  index.html                     - GitHub Pages 用プライバシーポリシー
  store-listing.md               - Web Store 申請ドラフト
```

## 国際化 (i18n)

ja / en の両方を `public/_locales/` に持つ。Chrome の `chrome.i18n` API で
ブラウザロケールに合わせて自動切替。

## プライバシーポリシー

[komm64.github.io/tutti](https://komm64.github.io/tutti/)

## ライセンス

[MIT](./LICENSE)
