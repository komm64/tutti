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
  /**
   * デフォルト 5。1 IP あたり 1 日 (UTC 区切り) に受け付ける報告数の上限。
   * 一人のユーザーの borked browser state による retry-loop / 一人での issue
   * tracker 偏らせ / Max sub quota の個人独占を防ぐ。
   */
  DAILY_LIMIT?: string;
  /** Cloudflare KV namespace (オプション、なければ rate limit はスキップ) */
  RATE_LIMIT?: KVNamespace;
  /**
   * 受け入れる Origin のホワイトリスト(カンマ区切り)。未設定だと
   * `chrome-extension://dophemlpjldcejjdjefpjbgngodopkfe` だけ許可。
   * 拡張 ID が変わったとき(Edge / Firefox 用に publish した場合等)、wrangler
   * secret 経由で増やせるよう env で持つ。
   */
  ALLOWED_ORIGINS?: string;
}

const DEFAULT_ALLOWED_ORIGIN = 'chrome-extension://dophemlpjldcejjdjefpjbgngodopkfe';

interface ReportPayload {
  title: string;
  body: string;
  version?: string;
}

const MAX_TITLE = 200;
// P13: diagnostics dump (selector audit + DOM snapshot) を含むので 80K に拡張。
// GitHub Issue body の硬い上限は 65535 char だが、ここは byte cap で
// それより前に worker 側で切る方針。GitHub 側 truncate に依存しない。
const MAX_BODY = 65_000;

function getAllowedOrigins(env: Env): string[] {
  if (env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [DEFAULT_ALLOWED_ORIGIN];
}

function buildCorsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  // Origin が allowed リストに居れば echo back、それ以外は CORS ヘッダ自体を付けない
  // (preflight も実 request も同じ判定を共有して spoofing 経路を作らない)
  const ok = !!origin && allowed.includes(origin);
  return {
    ...(ok ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin');
    const allowed = getAllowedOrigins(env);
    const corsHeaders = buildCorsHeaders(origin, allowed);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'method not allowed' }, 405, corsHeaders);
    }

    // chrome-extension からの fetch は必ず Origin を送る。allow リストに無い場合
    // (= 任意の Web ページ / 別拡張 / curl)は弾く。GitHub Issues 公開 spam を防止。
    if (!origin || !allowed.includes(origin)) {
      return jsonResponse({ error: 'forbidden origin' }, 403, corsHeaders);
    }

    if (!env.GITHUB_TOKEN) {
      return jsonResponse({ error: 'server not configured (no GITHUB_TOKEN)' }, 500, corsHeaders);
    }
    const repo = env.GITHUB_REPO ?? 'komm64/tutti';

    // rate limit (KV namespace が bind されてる場合のみ)
    //
    // 二段構え:
    //   1. 連打防止 (RATE_LIMIT_SECONDS、default 6 秒): 同一 IP の連続 retry-loop
    //   2. 日次上限 (DAILY_LIMIT、default 5 件/日): 一人のユーザーが特定の壊れ方で
    //      issue tracker を偏らせない / Max sub quota が個人に独占されない
    //
    // 日次キーは `daily:<IP>:<YYYY-MM-DD UTC>`、TTL 25h で自動削除。
    // (UTC 区切りなので 9:00 JST 跨ぎでリセット — 厳密より「だいたい 1 日」優先)
    const ip = req.headers.get('CF-Connecting-IP') ?? 'anonymous';
    const limitSec = Number(env.RATE_LIMIT_SECONDS ?? '6');
    const dailyLimit = Number(env.DAILY_LIMIT ?? '5');
    if (env.RATE_LIMIT) {
      const lastTs = await env.RATE_LIMIT.get(`ip:${ip}`);
      if (lastTs && Date.now() - Number(lastTs) < limitSec * 1000) {
        return jsonResponse({ error: 'rate limited, try again later' }, 429, corsHeaders);
      }
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
      const dailyKey = `daily:${ip}:${today}`;
      const dailyCount = Number((await env.RATE_LIMIT.get(dailyKey)) ?? '0');
      if (dailyCount >= dailyLimit) {
        return jsonResponse(
          { error: `daily limit reached (${dailyLimit} reports/day per IP). Try again tomorrow.` },
          429,
          corsHeaders,
        );
      }
      // ここで増やしておくと GitHub API 失敗でも消費。spam 抑止として妥当
      // (失敗 retry の手間を増やしたくないなら GitHub 成功後に inc に変更)
      await env.RATE_LIMIT.put(`ip:${ip}`, String(Date.now()), { expirationTtl: 3600 });
      await env.RATE_LIMIT.put(dailyKey, String(dailyCount + 1), { expirationTtl: 25 * 3600 });
    }

    // 本文 size cap (worker 自体は 100MB まで受けるが、ここで明示的に絞る)
    let payload: Partial<ReportPayload>;
    try {
      const text = await req.text();
      // 200K → 100K (diagnostics 含めても余裕で収まる)。spam で大量 text を
      // 突っ込まれない最低限の防御。
      if (text.length > 100_000) {
        return jsonResponse({ error: 'payload too large' }, 413, corsHeaders);
      }
      payload = JSON.parse(text) as Partial<ReportPayload>;
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, 400, corsHeaders);
    }

    const title = (payload.title ?? '').trim();
    const body = (payload.body ?? '').trim();
    if (!title || !body) {
      return jsonResponse({ error: 'title and body are required' }, 400, corsHeaders);
    }

    // GitHub Issue 作成
    // body に <!-- tutti-diagnostics-begin --> を含む = popup の自動診断が attach 済 →
    // 自宅サーバの triage daemon (scripts/triage-issue.mjs) が `needs-triage`
    // ラベル付き issue を polling して claude CLI で selector 提案 PR を作る (P13)。
    const hasDiagnostics = body.includes('<!-- tutti-diagnostics-begin -->');
    const labels = ['beta', 'auto-reported'];
    if (hasDiagnostics) labels.push('needs-triage');

    const githubBody = {
      title: `[Tutti Beta] ${title}`.slice(0, MAX_TITLE),
      body: body.slice(0, MAX_BODY),
      labels,
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
        corsHeaders,
      );
    }

    const issue = (await ghRes.json()) as { html_url?: string; number?: number };
    return jsonResponse({
      ok: true,
      issueUrl: issue.html_url,
      issueNumber: issue.number,
    }, 200, corsHeaders);
  },
};

function jsonResponse(data: unknown, status = 200, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
