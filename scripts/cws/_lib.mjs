/**
 * Chrome Web Store Publish API 用の共通ヘルパ。
 *
 * - .env.local から CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN /
 *   CWS_ITEM_ID を読み出し
 * - refresh_token から access_token をその場で取得
 * - CWS API への fetch wrapper を提供
 *
 * docs:
 *   - OAuth: https://developers.google.com/identity/protocols/oauth2/native-app
 *   - CWS API: https://developer.chrome.com/docs/webstore/using-api
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

/** .env.local を読んで KEY=VALUE の Map を返す */
export function loadEnv() {
  const path = resolve(repoRoot, '.env.local');
  if (!existsSync(path)) {
    throw new Error(`.env.local not found at ${path}`);
  }
  const text = readFileSync(path, 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[m[1]] = value;
  }
  return env;
}

export function requireEnv(env, ...keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars in .env.local: ${missing.join(', ')}`);
  }
}

/**
 * refresh_token を access_token に交換する。CWS API の各呼び出し前に呼ぶ。
 * access_token は短命 (~1h) なので毎回取り直す方が運用がシンプル。
 */
export async function getAccessToken(env) {
  requireEnv(env, 'CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN');
  const body = new URLSearchParams({
    client_id: env.CWS_CLIENT_ID,
    client_secret: env.CWS_CLIENT_SECRET,
    refresh_token: env.CWS_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`token refresh ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('refresh response missing access_token');
  return data.access_token;
}

/**
 * CWS Publish API endpoint への fetch wrapper。
 * `path` は `/items/{id}` 等の相対パス。
 */
export async function cwsApi(env, path, init = {}) {
  const accessToken = await getAccessToken(env);
  const url = `https://www.googleapis.com${path}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'x-goog-api-version': '2',
    ...(init.headers ?? {}),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`CWS API ${init.method ?? 'GET'} ${path} → ${res.status}: ${detail.slice(0, 500)}`);
  }
  // submit / publish 等は 200 + JSON、upload は 200 + JSON、たまに空 body のことも
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}
