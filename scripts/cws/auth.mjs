/**
 * Chrome Web Store Publish API の refresh token を取得する 1 回限りの helper。
 *
 * 使い方:
 *   1. .env.local に CWS_CLIENT_ID と CWS_CLIENT_SECRET を入れておく
 *   2. `node scripts/cws/auth.mjs` を実行
 *   3. ブラウザで Google にログイン → 同意画面で許可
 *   4. localhost にリダイレクトされて自動で code を拾う
 *   5. refresh_token が表示されるので .env.local の CWS_REFRESH_TOKEN に貼る
 *
 * その後、scripts/cws/status.mjs / upload.mjs / submit.mjs から使い回せる。
 */

import { createServer } from 'node:http';
import { loadEnv, requireEnv } from './_lib.mjs';

const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

async function main() {
  const env = loadEnv();
  requireEnv(env, 'CWS_CLIENT_ID', 'CWS_CLIENT_SECRET');

  // ephemeral local server で OAuth callback を受ける
  const port = await new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  const redirectUri = `http://127.0.0.1:${port}`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', env.CWS_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent'); // refresh_token を必ず再発行

  console.log('=== CWS OAuth refresh token 取得 ===');
  console.log('');
  console.log('以下の URL をブラウザで開いて Google にログイン → 許可してください:');
  console.log('');
  console.log(authUrl.toString());
  console.log('');
  console.log(`(localhost:${port} にリダイレクトされたら自動で code を拾います)`);

  // localhost で code を待つ
  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url, redirectUri);
      const c = u.searchParams.get('code');
      const e = u.searchParams.get('error');
      if (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`OAuth error: ${e}`);
        server.close();
        reject(new Error(`OAuth error: ${e}`));
        return;
      }
      if (c) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>OK</h1><p>code を受け取りました。ターミナルに戻ってください。</p>');
        server.close();
        resolve(c);
      } else {
        res.writeHead(404);
        res.end('no code');
      }
    });
    server.listen(port, '127.0.0.1');
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timeout (10 min)'));
    }, 10 * 60 * 1000);
  });

  console.log('');
  console.log('code 受信、token と交換中...');

  const body = new URLSearchParams({
    code,
    client_id: env.CWS_CLIENT_ID,
    client_secret: env.CWS_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`token exchange ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.refresh_token) {
    throw new Error('refresh_token が返されませんでした (consent screen で再度許可してから retry)');
  }

  console.log('');
  console.log('=== 取得成功 ===');
  console.log('');
  console.log('以下を .env.local の CWS_REFRESH_TOKEN= 行に貼り付けてください:');
  console.log('');
  console.log(data.refresh_token);
  console.log('');
  console.log('access_token (短命、参考表示):', data.access_token.slice(0, 40) + '...');
}

main().catch((e) => {
  console.error('fatal:', e?.message ?? e);
  process.exit(1);
});
