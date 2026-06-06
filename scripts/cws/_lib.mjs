/**
 * Chrome Web Store Publish API 用の共通ヘルパ。
 *
 * - .env.local から CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN /
 *   CWS_ITEM_ID / CWS_PUBLISHER_ID を読み出し
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
const DEFAULT_CWS_PUBLISHER_ID = '904784e0-1a6f-46a5-bdd9-06e6aa66511d';

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

export function getPublisherId(env) {
  return env.CWS_PUBLISHER_ID || DEFAULT_CWS_PUBLISHER_ID;
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

export async function cwsV2Api(env, path, init = {}) {
  const accessToken = await getAccessToken(env);
  const url = `https://chromewebstore.googleapis.com/v2${path}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers ?? {}),
  };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(`CWS API v2 ${init.method ?? 'GET'} ${path} -> ${res.status}: ${detail.slice(0, 1000)}`);
  }
  return data;
}

export async function cwsV2UploadApi(env, path, bytes) {
  const accessToken = await getAccessToken(env);
  const url = `https://chromewebstore.googleapis.com/upload/v2${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/zip',
    },
    body: bytes,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(`CWS upload API v2 POST ${path} -> ${res.status}: ${detail.slice(0, 1000)}`);
  }
  return data;
}
