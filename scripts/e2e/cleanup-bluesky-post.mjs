import { chromium } from 'playwright';

const [postUrl] = process.argv.slice(2);
if (!postUrl) {
  console.error('Usage: node scripts/e2e/cleanup-bluesky-post.mjs <post-url>');
  process.exit(2);
}

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  {
    headless: false,
    args: [
      `--disable-extensions-except=${process.env.E2E_EXT_DIR}`,
      `--load-extension=${process.env.E2E_EXT_DIR}`,
      '--no-first-run',
    ],
  },
);

let extId;
for (let i = 0; i < 50; i += 1) {
  for (const worker of ctx.serviceWorkers()) {
    const match = worker.url().match(/^chrome-extension:\/\/([a-z]+)\//);
    if (match) { extId = match[1]; break; }
  }
  if (extId) break;
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (!extId) throw new Error('extension id not detected');

const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/options.html`);
let session = await page.evaluate(async () => {
  const creds = (await chrome.storage.local.get('apiCredentials'))['apiCredentials']?.bluesky;
  if (!creds?.identifier || !creds?.appPassword) return null;
  const pds = creds.pdsHost || 'https://bsky.social';
  const sessRes = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: creds.identifier, password: creds.appPassword }),
  });
  if (!sessRes.ok) throw new Error(`auth ${sessRes.status}`);
  const sess = await sessRes.json();
  return { accessJwt: sess.accessJwt, did: sess.did, pds };
});
if (!session) {
  const bsky = await ctx.newPage();
  await bsky.goto('https://bsky.app/', { waitUntil: 'domcontentloaded' });
  session = await bsky.evaluate(() => {
    const visit = (value) => {
      if (!value || typeof value !== 'object') return null;
      if (typeof value.accessJwt === 'string' && typeof value.did === 'string') {
        return { accessJwt: value.accessJwt, did: value.did, pds: value.service || 'https://bsky.social' };
      }
      for (const child of Object.values(value)) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    for (let i = 0; i < localStorage.length; i += 1) {
      try {
        const found = visit(JSON.parse(localStorage.getItem(localStorage.key(i))));
        if (found) return found;
      } catch {}
    }
    return null;
  });
  await bsky.close();
}
const result = await page.evaluate(async ({ url, session }) => {
  if (!session?.accessJwt || !session?.did) return 'failed: no Bluesky session';
  const rkey = url.match(/\/post\/([^/?#]+)/)?.[1];
  if (!rkey) return 'failed: no rkey';
  const didDoc = await fetch(`https://plc.directory/${session.did}`).then((res) => res.json());
  const pds = didDoc.service?.find((service) => service.id === '#atproto_pds')?.serviceEndpoint ?? session.pds;
  const delRes = await fetch(`${pds}/xrpc/com.atproto.repo.deleteRecord`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessJwt}` },
    body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', rkey }),
  });
  return delRes.ok ? 'deleted' : `failed: delete ${delRes.status}`;
}, { url: postUrl, session });

console.log(result);
await ctx.close();
process.exit(result === 'deleted' ? 0 : 1);
