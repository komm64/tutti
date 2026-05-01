# Tutti Report Proxy (Cloudflare Workers)

Tutti 拡張から受け取ったエラー報告を GitHub Issues に転送する relay。

## なぜ必要か

- 拡張機能はバックエンドを持たないので、ユーザーから自動でエラー送信できない
- かといって GitHub Issue ページを開かせるだけだと、非エンジニアユーザーは
  そのまま閉じる
- 本 worker は HTTPS POST で報告を受けて、GitHub Issues API に転送する
  軽量 relay。worker 側で GitHub PAT を保管するので、拡張のコードには
  PAT を一切含めない(流出回避)

## デプロイ手順

```bash
cd worker
npm install
wrangler login   # 初回のみ、CF アカウントとブラウザ OAuth
wrangler secret put GITHUB_TOKEN  # repo:Issues:write スコープの PAT を貼る
wrangler deploy
```

deploy 後に表示される URL (`https://tutti-report.<account>.workers.dev`) を
`entrypoints/popup/App.svelte` の `REPORT_ENDPOINT` 定数に埋める。

## rate limit を有効化したい場合

```bash
wrangler kv namespace create RATE_LIMIT
# 出力された id を wrangler.toml の [[kv_namespaces]] にコピー
wrangler deploy
```

KV bind が無いと rate limit はスキップされる(spam 来たら enable する想定)。

## Test

```bash
curl -X POST https://tutti-report.<account>.workers.dev \
  -H 'Content-Type: application/json' \
  -d '{"title":"manual smoke test","body":"hello from curl"}'
# → {"ok":true, "issueUrl":"...", "issueNumber":N}
```

## エンドポイント仕様

```
POST /
Content-Type: application/json

{
  "title": "短いタイトル",
  "body":  "Markdown 本文(version, UA, 直近ログ等を含む想定)"
}

→ 200 { ok: true, issueUrl: "...", issueNumber: N }
→ 400 { error: "..." }
→ 429 { error: "rate limited" }
→ 502 { error: "github API ..." }
```
