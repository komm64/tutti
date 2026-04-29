# Tutti

> クロスポストの面倒を全部肩代わりする Chrome 拡張機能

X / Bluesky / Threads / Mastodon に同じ投稿を一気に流す。文字数超過は
プラットフォームごとに自動でスレッド分割。動画は尺・サイズ制約を
チェックして適合プラットフォームのみに送信。バックエンド不要、
投稿内容は第三者サーバーを一切経由しない。

## 主な機能

- 📤 **マルチ SNS 同時投稿** — X / Bluesky / Threads / Mastodon
- ✂️ **文字数オーバー時の自動スレッド分割** — 各プラットフォームの上限に
  合わせて単語境界で切り分け、`(1/N) ` 形式の連番で逐次投稿
- 🖼️ **画像添付** — 最大 4 枚、`DataTransfer` 経由で各 SNS の compose
  フォームへ注入
- 🎬 **動画パススルー** — 尺・ファイルサイズを動画メタデータから読み取り、
  プラットフォーム制約を超える場合は当該プラットフォームをスキップ
- 📜 **投稿履歴** — 直近 20 件をローカルに保存(第三者送信なし)
- ⚙️ **Mastodon インスタンス切り替え** — 設定画面から任意のインスタンスを
  指定可能(動的に host_permissions を要求)

## なぜ Tutti なのか

- **バックエンド不要** — X API の月 $200 を回避し、ブラウザの既存セッションを
  そのまま使う。サーバー代ゼロ、indie 向き
- **プライバシー第一** — 投稿内容が開発者のサーバーを経由しない
  (Buffer / Hootsuite との明確な差別化点)
- **ユーザー操作起点** — 自動投稿はしない。BAN リスクを下げ、
  Web Store の Spam 審査もクリアしやすい
- **「面倒の肩代わり」が本丸** — 「最小機能」が目的ではなく、毎日
  ユーザーが踏んでいる小さな摩擦を全部消す

詳しい背景は [CONCEPT.md](./CONCEPT.md) を参照。

## 技術スタック

- [WXT](https://wxt.dev/) — Vite ベースの MV3 拡張ビルドツール
- TypeScript (strict + `noUncheckedIndexedAccess`)
- Svelte 5 (runes)
- Tailwind CSS v4

## 開発

```bash
npm install
npm run dev          # Chrome 用 HMR 開発サーバー
npm run dev:firefox  # Firefox 用
npm run build        # 本番ビルド (.output/chrome-mv3/)
npm run zip          # Chrome Web Store 提出用 zip
npm run compile      # 型チェック (tsc --noEmit)
```

開発時は `chrome://extensions/` で「パッケージ化されていない拡張機能を
読み込む」から `.output/chrome-mv3/` を指定。

## ロードマップ

P1〜P8 と Threads 対応・アイコン・プライバシーポリシーまで完了済み。
動画整形(letterbox+blur, ffmpeg.wasm)は骨格のみ。
詳細は [CLAUDE.md](./CLAUDE.md) の「次のステップ」を参照。

## ライセンス

[MIT](./LICENSE)

## 関連

- [komm64/reecho](https://github.com/komm64) ── 同じく音楽用語からの命名
