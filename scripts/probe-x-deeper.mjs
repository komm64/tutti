import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 60000 });

for (const p of await browser.pages()) {
  if (/x\.com|twitter\.com/.test(p.url())) await p.close();
}
const page = await browser.newPage();
await page.goto('https://x.com/intent/post?text=deeper-probe', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));

const result = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  return {
    inputs: inputs.map((input, idx) => {
      // Print ALL ancestors up to body
      const chain = [];
      let n = input;
      while (n && n !== document.body) {
        const tag = n.tagName;
        const t = n.getAttribute?.('data-testid');
        const a = n.getAttribute?.('aria-label');
        const r = n.getAttribute?.('role');
        chain.push(`${tag}${t ? `[${t}]` : ''}${a ? `(${a})` : ''}${r ? `<${r}>` : ''}`);
        n = n.parentElement;
      }
      return { idx, chain: chain.slice(0, 25) };
    }),
    // What's inside [role=dialog]?
    dialogChildren: (() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return null;
      const inputs = d.querySelectorAll('input[type="file"]');
      return {
        chain: (() => {
          const c = []; let n = d;
          while (n && n !== document.body) {
            c.push(n.tagName + (n.getAttribute?.('data-testid') ? `[${n.getAttribute('data-testid')}]` : '') + (n.getAttribute?.('aria-label') ? `(${n.getAttribute('aria-label')})` : ''));
            n = n.parentElement;
          }
          return c.slice(0,15);
        })(),
        fileInputs: Array.from(inputs).map(i => ({
          accept: i.accept,
          parentTag: i.parentElement?.tagName,
          parentTestid: i.parentElement?.getAttribute?.('data-testid'),
        })),
      };
    })(),
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.disconnect();
