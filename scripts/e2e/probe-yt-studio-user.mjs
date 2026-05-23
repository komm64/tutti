/**
 * studio.youtube.com で ytcp-account-info の中身を probe。 channel name が
 * どこに入ってるか調べる。
 */
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null, protocolTimeout: 60000 });

// studio タブを開く
let page = (await browser.pages()).find((p) => /studio\.youtube\.com/.test(p.url()));
if (!page) {
  page = await browser.newPage();
  await page.goto('https://studio.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
}
await page.bringToFront();
await new Promise((r) => setTimeout(r, 12000)); // Studio は重い

const snap = await page.evaluate(() => {
  const el = document.querySelector('ytcp-account-info');
  const txt = el?.textContent?.trim();
  const html = el?.outerHTML?.slice(0, 2000);

  // 内部 element を列挙
  const children = el ? Array.from(el.querySelectorAll('*'))
    .slice(0, 20)
    .map((c) => ({
      tag: c.tagName,
      id: c.getAttribute('id'),
      cls: c.className?.slice?.(0, 60),
      text: (c.textContent ?? '').trim().slice(0, 60),
    })) : [];

  // 別 selector 候補
  const channelHandle = document.querySelector('ytcp-account-chip-renderer')?.textContent?.trim()?.slice(0, 80);
  const userMenu = document.querySelector('[id="account-menu"], [aria-label*="Account"]')?.outerHTML?.slice(0, 500);
  const titles = Array.from(document.querySelectorAll('[id="title"], #channel-handle, [class*="title" i]'))
    .slice(0, 10).map((e) => ({
      tag: e.tagName,
      id: e.getAttribute('id'),
      cls: e.className?.slice?.(0, 50),
      text: (e.textContent ?? '').trim().slice(0, 60),
    }));

  // ytcp-account-info の attribute も見る
  const attrs = el ? Array.from(el.attributes).map((a) => ({ name: a.name, value: a.value.slice(0, 80) })) : [];

  return {
    url: location.href,
    title: document.title,
    yticp_account_info_text: txt,
    yticp_account_info_attrs: attrs,
    yticp_account_info_children: children,
    yticp_account_info_html_excerpt: html,
    channelHandle,
    titles,
  };
});

console.log(JSON.stringify(snap, null, 2));
browser.disconnect();
