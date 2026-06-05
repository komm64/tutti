import { chromium } from 'playwright';

const [postUrl] = process.argv.slice(2);
if (!postUrl) {
  console.error('Usage: node scripts/e2e/cleanup-x-post.mjs <post-url>');
  process.exit(2);
}

const ctx = await chromium.launchPersistentContext(
  process.env.E2E_USER_DATA_DIR ?? 'C:/Users/komm64/.tutti-e2e-chrome',
  { headless: false, args: ['--no-first-run'] },
);
const page = await ctx.newPage();
await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
const caret = page.locator('[data-testid="caret"]').first();
if (await caret.count() === 0) {
  console.log('already absent');
  await ctx.close();
  process.exit(0);
}
await caret.click();
const deleteItem = page.getByText(/^(Delete|削除)$/).first();
await deleteItem.waitFor({ state: 'visible', timeout: 5000 });
await deleteItem.click();
const confirm = page.locator('[data-testid="confirmationSheetConfirm"]').first();
await confirm.waitFor({ state: 'visible', timeout: 5000 });
await confirm.click();
await page.waitForTimeout(1500);
console.log('deleted');
await ctx.close();
