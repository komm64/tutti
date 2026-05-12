# Platform support matrix

Tutti が対応する 11 ネットワークの **single source of truth**。
README / CWS listing / 各 adapter コード間で表記がずれないよう、ここを
唯一の正確な現状とみなす。

各 adapter の `src/adapters/<id>.ts` を読まなくても、ここを見れば
「何が動いて、何がまだ実投稿確認できていないか」が分かるようにする。

> 更新ルール: adapter 追加 / 制約変更 / 検証状態が動いたら **必ずこの
> ファイルを先に更新**。README / CWS listing 等はここから参照する。

## 凡例

- ✅: 対応・確認済
- ⚠️: 実装はあるが、autoPost ON での実投稿検証は浅い (preview dry-run まで)
- —: 非対応 (adapter に kind が含まれない / 制約により送れない)
- **DOM**: SNS の Web 投稿ページを Playwright 風に DOM 操作する経路
- **API**: SNS の公式 API を直接叩く経路 (credentials 登録時のみ有効)
- **multi-step**: 複数モーダルの wizard 型 UI 用 (P12 framework `executeMultiStepFlow`)
- **foreground tab**: heavy SPA を動かすために active=true でタブを開く必要がある
  (`requiresForegroundTab: true`)

## 全体マトリクス

| network | text | image | shortVideo | longVideo | path | multi-step | fg tab | API |
|---|:---:|:---:|:---:|:---:|---|:---:|:---:|:---:|
| X | ✅ | ✅ | ✅ | ✅ | DOM | — | — | — |
| Bluesky | ✅ | ✅ | ✅ | — | DOM + API | — | — | ✅ |
| Threads | ✅ | ✅ | ✅ | ✅ | DOM | — | — | — |
| Mastodon | ✅ | ✅ | ✅ | ✅ | DOM + API | — | — | ✅ |
| Misskey | ✅ | ✅ | ✅ | ✅ | DOM + API | — | — | ✅ |
| Tumblr | ✅ | ✅ | ✅ | ✅ | DOM | — | — | — |
| Pixiv | — | ✅ | — | — | DOM | ✅ | ✅ | — |
| TikTok | — | — | ✅ | — | DOM | ✅ | ✅ | — |
| YouTube (Shorts) | — | — | ✅ | — | DOM | ✅ | ✅ | — |
| Instagram | — | ⚠️ | ⚠️ | — | DOM | ✅ | ✅ | — |
| DeviantArt | — | ⚠️ | — | — | DOM | ✅ | ✅ | — |

## 投稿系制約 (adapter コードから抜粋、2026-05-13 時点)

| network | charLimit | maxImages | maxBytesPerImage | maxBytes (video) | maxDurationS |
|---|---:|---:|---:|---:|---:|
| X | 280 | 4 | 5 MB | 512 MB | unlimited |
| Bluesky | 300 | 4 | 1 MB | 80 MiB | 60 |
| Threads | 500 | 10 | 8 MB | 1 GB | unlimited |
| Mastodon (mastodon.social) | 500 | 4 | 8 MB | 40 MB | unlimited |
| Misskey (misskey.io) | 3000 | 16 | 100 MB | 100 MB | unlimited |
| Tumblr | 4096 | 10 | 10 MB | 100 MB | unlimited |
| Pixiv | 1000 (caption) | 200 | 30 MB | — | — |
| TikTok | 2200 (caption) | — | — | 287 MB | 180 |
| YouTube (Shorts) | 5000 (description) | — | — | 2 GB | 60 |
| Instagram | 2200 (caption) | 10 | 30 MB | 100 MB | 60 |
| DeviantArt | 5000 | 1 | 30 MB | — | — |

- "unlimited" は **クライアント側で尺チェックしない** という意味。SNS 側で
  reject される可能性はある (= 任意 SNS 側 UI の error が popup に返される)
- Mastodon / Misskey は federated なのでインスタンスごとに上記制約が変わる。
  Settings からインスタンス URL を切り替えると値も切り替わる前提
- Bluesky の `maxBytes` は **80 MiB** に SI margin を加えた conservative 値。
  API probe (P17) で取れた実値があれば override される
- 動画 maxBytes は超過時に offscreen ffmpeg.wasm で **自動圧縮** される (P16)

## 検証状態 (autoPost 実投稿)

| network | preview (dry-run) | autoPost 実投稿 | 最終確認 | 備考 |
|---|:---:|:---:|---|---|
| X | ✅ | ✅ | v0.3.8 | inline compose 経路 (P11) |
| Bluesky | ✅ | ✅ | v0.4.x (P11) | DOM + API 両方 |
| Threads | ✅ | ✅ | v0.4.x (P11) | aria-label fallback |
| Mastodon | ✅ | ✅ | v0.4.x (P11) | confirmDialog alt-text 自動承認込 |
| Misskey | ✅ | ✅ | v0.4.x (P11) | drop モード |
| Tumblr | ✅ | ✅ | v0.4.x (P11) | components-drop-zone |
| Pixiv | ✅ | ✅ | v0.4.17 | tags 必須・hidden radio (P12-A.1〜.4) |
| TikTok | ✅ | ✅ | v0.4.18 / v0.4.26 | Draft.js clearing fix |
| YouTube (Shorts) | ✅ | ✅ | v0.4.25 | div#textbox×2 識別、Made for Kids 必須 |
| Instagram | ✅ | ⚠️ 未 | — | 4 段 modal wizard 完成、実投稿未検証 |
| DeviantArt | ✅ | ⚠️ 未 | — | upload modal 完成、実投稿未検証 |

## E2E coverage (`scripts/e2e/platforms/`)

実投稿 E2E スモークは self-hosted runner 前提 (anti-bot 対策で
GitHub-hosted では弾かれる)。現状の covered/uncovered:

| network | E2E module 存在 | runner | コメント |
|---|:---:|---|---|
| X | ✅ | self-hosted | `x.mjs` 完成、削除は未実装 |
| Bluesky | — | API 化候補 | API path があるので GitHub-hosted で回せる |
| Mastodon | — | API 化候補 | 同上 |
| Misskey | — | API 化候補 | 同上 |
| 残り 7 SNS | — | self-hosted | DOM のみなので self-hosted 必要 |

予定:
- API path (Bluesky / Mastodon / Misskey) は GitHub-hosted で nightly に
  credentials 経由で投稿→削除を走らせる workflow を別立て
- DOM-only network は `scripts/e2e/E2E-SETUP.md` の手順で self-hosted
  runner を立てて、selector PR 後 / nightly に走らせる

## Selector hot-fix 配信

すべての DOM-driven network は **`docs/selectors.json` の override** を受け取る:

1. SNS UI が変わって selector が刺さらなくなる
2. ユーザが popup の Report ボタンで diagnostics 付き issue を送る
3. `auto-triage.yml` が GitHub Action で Claude にバトンを渡し、新 selector
   候補の PR を `src/adapters/<network>.ts` と `docs/selectors.json` の
   両方に同時 patch
4. 人間レビュー → merge → GitHub Pages に publish
5. `Settings.selectorOverrideUrl` を有効にしている全ユーザに数分以内に届く

詳細: `CLAUDE.md` の P13 セクション、memory `auto_triage_pipeline.md`。

## 既知の不安定点 / 注意

- **Pixiv**: `R-18 / AI=Yes` の切替は hardcode (general / notAiGenerated)。
  Adult artist や AI artist 向けには options で expose する課題が残る
- **YouTube**: visibility=Public の自動設定は v0.4.25 で対応済。チャンネル
  未作成の Google アカウントは upload page に遷移できないので user に案内が必要
- **Instagram**: 4 段 modal を順次進む構造で、Crop/Edit step は no-op で
  通過。filter を当てたいユーザ向けには将来別 flow を作る
- **Tumblr**: `.components-drop-zone` を狙わないと block-type 選択メニューが
  出てしまう (textarea drop は NG)
- **TikTok**: Draft.js は既存 text の clearing が execCommand 経由
  (memory `contenteditable_clearing_strategies.md`)
- **Threads**: Meta 系で React Native Web ベース。aria-label の DOM 変更が
  比較的多い → selectors.json の hot-fix が効きやすい

## 関連ファイル

- 各 adapter: `src/adapters/<id>.ts`
- registry: `src/adapters/registry.ts`
- API クライアント: `src/api/{bluesky,mastodon,misskey}.ts`
- multi-step framework: `src/utils/step-runner.ts`
- selector hot-fix: `src/utils/selector-overrides.ts` + `docs/selectors.json`
- E2E runner: `scripts/e2e/run.mjs`, `scripts/e2e/E2E-SETUP.md`
