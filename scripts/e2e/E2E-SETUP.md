# Tutti E2E real-post smoke test

実投稿テストは **2 系統** に分けて運用する。

| 系統 | 走る場所 | 対象 SNS | 投稿経路 | trigger |
|---|---|---|---|---|
| **API smoke** | GitHub-hosted runner (Ubuntu) | Bluesky / Mastodon / Misskey | 公式 API 直叩き (`src/api/`) | nightly + workflow_dispatch |
| **DOM smoke** | self-hosted runner (Ubuntu+xvfb / Surface) | X / Threads / Tumblr / Pixiv / TikTok / YouTube / Instagram / DeviantArt | Playwright で拡張 load → DOM 操作 | workflow_dispatch のみ (anti-bot 配慮) |

API smoke は credentials が repo secrets にあれば毎晩自動で回る (= cheap)。
DOM smoke は anti-bot 対策で self-hosted runner 必須 (= 手動 trigger 中心)。

---

## API smoke (GitHub-hosted runner)

### 目的

公式 API のある SNS については、UI 変更の影響を受けない API path が
壊れていないか毎晩確認する。auto-triage で selector が直されても
API path に regression が無いか確かめる役目も兼ねる。

### 必要な repo secrets

```
E2E_BLUESKY_IDENTIFIER  = tutti-test.bsky.social のようなテスト垢 handle
E2E_BLUESKY_PASSWORD    = Settings → App Passwords で発行した password

E2E_MASTODON_INSTANCE   = https://mastodon.social (末尾スラッシュなし)
E2E_MASTODON_TOKEN      = /settings/applications で発行 (scope: write:statuses, write:media)

E2E_MISSKEY_INSTANCE    = https://misskey.io
E2E_MISSKEY_TOKEN       = Settings → API → アクセストークン (scope: write:notes, write:drive)
```

セットしない SNS は workflow 内で skip される (= CI 失敗ではない、部分セットでも通る)。

### ローカル実行

```bash
export E2E_BLUESKY_IDENTIFIER=...
export E2E_BLUESKY_PASSWORD=...
# (他の SNS は同様、もしくは抜けば skip)
npm run test:e2e-api
```

vitest が `scripts/e2e-api/` 配下の `*.test.ts` を実行、各 SNS で
post → URL 検証 → deleteRecord で cleanup。テスト垢の timeline に
投稿は残らない。

### 失敗時の動き

workflow が fail → 通知 → 中身を確認:
- API regression (= `src/api/<sns>.ts` 側の bug)
- credentials の期限切れ (Mastodon の token は revoke 可能)
- SNS API の仕様変更 (rare、API は DOM より stable)

---

## DOM smoke (self-hosted runner)

### 目的

auto-triage が出した PR の selector を、`docs/selectors.json` に流す前に
**実際の SNS で投稿が通るか** を自動検証する。GitHub-hosted runner では
SNS 側の anti-bot に弾かれるので、自宅環境を self-hosted runner にする。

## 二段運用 (Ubuntu + Surface)

| マシン | 役割 | 表示 | いつ走らせる |
|---|---|---|---|
| **Ubuntu CLI 自宅サーバ** | 自動 / 夜間 | Xvfb (仮想 display) | scheduled / nightly / auto-triage 後 |
| **Surface** | 手動デバッグ / 視覚確認 | 実 display | 失敗時に再現確認、新 SNS 追加時の動作確認 |

両方とも同じ workflow を `runner` input で選んで動かす。

## セットアップ (Ubuntu CLI)

```bash
# 1. self-hosted runner 登録
#    GitHub → komm64/tutti → Settings → Actions → Runners → New self-hosted runner
#    "Linux x64" 選択 → 表示されるコマンドをコピーして実行
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-linux-x64-2.XXX.X.tar.gz -L <url-from-github>
tar xzf actions-runner-linux-x64-2.XXX.X.tar.gz
./config.sh --url https://github.com/komm64/tutti --token <token> --labels self-hosted,linux,ubuntu --name tutti-ubuntu

# 2. systemd で常駐
sudo ./svc.sh install
sudo ./svc.sh start

# 3. 必要パッケージ
sudo apt update
sudo apt install -y xvfb chromium-browser nodejs npm
# (Node 20 が apt repo に無ければ NodeSource か nvm で 20 を入れる)

# 4. Playwright + Chromium
cd /home/<user>/actions-runner/_work/tutti/tutti
npx playwright install chromium    # ← Playwright 内蔵 Chromium DL

# 5. Chrome user-data dir 作成 + テスト垢ログイン
#    self-hosted runner が使う persistent profile。anti-bot 回避のため
#    実機ログイン状態を保持する。
export E2E_USER_DATA_DIR=/home/<user>/.config/tutti-e2e-chrome
xvfb-run -a npx playwright open --user-data-dir=$E2E_USER_DATA_DIR https://x.com/login
# → ブラウザが立ち上がるので test 垢でログイン (Surface などからリモートで
#   X11 forward 経由 / もしくは VNC で操作)
# → 1 度ログインすれば cookie が persist、以降の自動 run でログイン不要
```

## セットアップ (Surface — Windows)

```powershell
# 1. self-hosted runner 登録
mkdir C:\actions-runner
cd C:\actions-runner
# GitHub の "Windows x64" コマンドをコピー実行
.\config.cmd --url https://github.com/komm64/tutti --token <token> --labels self-hosted,windows,surface --name tutti-surface

# 2. サービス登録
.\svc.cmd install
.\svc.cmd start

# 3. Node 20+ (https://nodejs.org/ から MSI)
# 4. Playwright Chromium
cd C:\actions-runner\_work\tutti\tutti
npx playwright install chromium

# 5. Chrome user-data dir + ログイン (実 display で素直に操作可能)
$env:E2E_USER_DATA_DIR = "$env:USERPROFILE\.tutti-e2e-chrome"
npx playwright open --user-data-dir=$env:E2E_USER_DATA_DIR https://x.com/login
# → ブラウザ立ち上がるので普通にログイン
```

## 実行 (どちらでも同じ)

GitHub Actions UI から手動 trigger:

```
GitHub → komm64/tutti → Actions → "E2E real-post smoke" → Run workflow
  - platforms: x  (or x,bluesky,...)
  - runner: ubuntu  (or surface)
```

ローカルから手動実行:

```bash
# Ubuntu (Xvfb 経由)
xvfb-run -a npm run e2e -- --platforms x

# Surface
npm run e2e -- --platforms x
```

## 警告

- **テスト垢を使う**: 本垢使うと ban で生活直撃。X / Bluesky 等は
  test@komm64.com 系の sub アカウントで運用
- **頻度を抑える**: 各 SNS 1 日 数件まで。auto-triage PR 後だけ走らす想定
- **YouTube / IG 慎重に**: anti-bot 強い。失敗続いたら自動的に当該 platform を
  E2E から外す (= 人間検証に戻す)
- **投稿 cleanup**: テスト投稿は最後に必ず削除する。timeline / feed が test 垢で
  汚染されるが、本垢には影響しない
- **失敗時 artifact**: スクショと console log を保存して PR にコメント posting
