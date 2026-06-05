import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  { headless: false, args: ['--no-first-run'] },
);
const page = await ctx.newPage();
await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3000);
console.log(JSON.stringify(await page.evaluate(async () => {
  const response = await fetch('/api/v1/users/web_profile_info/?username=ren.fujimoto.89', {
    credentials: 'include',
    headers: { 'X-IG-App-ID': '936619743392459' },
  });
  const data = await response.json().catch(() => null);
  return {
    status: response.status,
    latest: data?.data?.user?.edge_owner_to_timeline_media?.edges?.slice(0, 3).map((edge) => ({
      shortcode: edge.node?.shortcode,
      caption: edge.node?.edge_media_to_caption?.edges?.[0]?.node?.text,
    })),
  };
}), null, 2));
await ctx.close();
