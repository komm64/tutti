import { chromium } from 'playwright';

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

await new Promise((resolve) => setTimeout(resolve, 1500));
console.log('workers:', ctx.serviceWorkers().map((worker) => worker.url()));
for (const worker of ctx.serviceWorkers()) {
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  console.log('worker manifest:', { id: new URL(worker.url()).host, name: manifest.name, version: manifest.version });
}

await ctx.close();
