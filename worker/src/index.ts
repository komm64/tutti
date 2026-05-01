/**
 * Tutti Report Proxy — Cloudflare Workers
 *
 * 拡張から `POST /` でエラー報告を受けて、GitHub Issues API に転送する relay。
 * GitHub Personal Access Token (PAT) は worker secret として保管し、拡張側
 * (= 公開コード)には絶対に入れない。
 *
 * 拡張側からの想定 payload:
 *   {
 *     "title": "短いタイトル(自由記述)",
 *     "body":  "本文。logs / version / UA を prefill 済の Markdown を想定",
 *     "version": "0.4.10"  // optional, body にも入ってる前提
 *   }
 *
 * Deploy:
 *   wrangler secret put GITHUB_TOKEN  # PAT (repo:public_repo scope だけで足りる)
 *   wrangler deploy
 *
 * 本ファイルだけ TS で書いてある。デプロイ時に wrangler が ESM 形式で bundle する。
 */

interface Env {
  GITHUB_TOKEN: string;
  /** デフォルト "komm64/tutti"。テスト時に切り替えられるよう env で持つ */
  GITHUB_REPO?: string;
  /** デフォルト 6 (= 1 IP / 6 秒)。spam 防止 throttle 値 */
  RATE_LIMIT_SECONDS?: string;
  /** Cloudflare KV namespace (オプション、なければ rate limit はスキップ) */
  RATE_LIMIT?: KVNamespace;
}

interface ReportPayload {
  title: string;
  body: string;
  version?: string;
}

const MAX_TITLE = 200;
const MAX_BODY = 50_000;

const corsHeaders: Record<string, string> = {
  // 拡張から fetch する。chrome-extension://<ID> や popup ページからの origin を
  // ホワイトリストする厳密化はやってもいいが、worker の用途的に "post-only relay"
  // なので緩めの CORS で許可しても被害は title/body のフォーマット的に GitHub
  // issue 1 件ぶんのみ(rate limit + GitHub 側のレートリミットで吸収)
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'method not allowed' }, 405);
    }

    if (!env.GITHUB_TOKEN) {
      return jsonResponse({ error: 'server not configured (no GITHUB_TOKEN)' }, 500);
    }
    const repo = env.GITHUB_REPO ?? 'komm64/tutti';

    // rate limit (KV namespace が bind されてる場合のみ)
    const ip = req.headers.get('CF-Connecting-IP') ?? 'anonymous';
    const limitSec = Number(env.RATE_LIMIT_SECONDS ?? '6');
    if (env.RATE_LIMIT) {
      const lastTs = await env.RATE_LIMIT.get(`ip:${ip}`);
      if (lastTs && Date.now() - Number(lastTs) < limitSec * 1000) {
        return jsonResponse({ error: 'rate limited, try again later' }, 429);
      }
      await env.RATE_LIMIT.put(`ip:${ip}`, String(Date.now()), { expirationTtl: 3600 });
    }

    // 本文 size cap (worker 自体は 100MB まで受けるが、ここで明示的に絞る)
    let payload: Partial<ReportPayload>;
    try {
      const text = await req.text();
      if (text.length > 200_000) {
        return jsonResponse({ error: 'payload too large' }, 413);
      }
      payload = JSON.parse(text) as Partial<ReportPayload>;
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400);
    }

    const title = (payload.title ?? '').trim();
    const body = (payload.body ?? '').trim();
    if (!title || !body) {
      return jsonResponse({ error: 'title and body are required' }, 400);
    }

    // GitHub Issue 作成
    const githubBody = {
      title: `[Tutti Beta] ${title}`.slice(0, MAX_TITLE),
      body: body.slice(0, MAX_BODY),
      labels: ['beta', 'auto-reported'],
    };

    const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tutti-report-proxy',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(githubBody),
    });

    if (!ghRes.ok) {
      const detail = await ghRes.text().catch(() => '');
      return jsonResponse(
        { error: `github API ${ghRes.status}`, detail: detail.slice(0, 500) },
        502,
      );
    }

    const issue = (await ghRes.json()) as { html_url?: string; number?: number };
    return jsonResponse({
      ok: true,
      issueUrl: issue.html_url,
      issueNumber: issue.number,
    });
  },
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
