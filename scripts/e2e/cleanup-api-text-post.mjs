import { chromium } from 'playwright';

const [platform, postUrl] = process.argv.slice(2);
if (!platform || !postUrl) {
  console.error('Usage: node scripts/e2e/cleanup-api-text-post.mjs <mastodon|misskey> <post-url>');
  process.exit(2);
}

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  { headless: false, args: ['--no-first-run'] },
);
const page = await ctx.newPage();
const origin = new URL(postUrl).origin;
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);
const result = await page.evaluate(async ({ platformName, url }) => {
  const id = url.split('/').filter(Boolean).at(-1);
  if (!id) return 'failed: post id missing';
  if (platformName === 'mastodon') {
    const script = document.querySelector('script#initial-state')?.textContent ?? '{}';
    const token = JSON.parse(script)?.meta?.access_token;
    if (!token) return 'failed: Mastodon token missing';
    const response = await fetch(`/api/v1/statuses/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok ? 'deleted' : `failed: Mastodon delete ${response.status}`;
  }
  const account = JSON.parse(localStorage.getItem('account') ?? '{}');
  const token = account.token ?? account.i;
  if (!token) return 'failed: Misskey token missing';
  const response = await fetch('/api/notes/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ i: token, noteId: id }),
  });
  return response.ok ? 'deleted' : `failed: Misskey delete ${response.status}`;
}, { platformName: platform, url: postUrl });
console.log(result);
await ctx.close();
