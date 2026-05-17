/**
 * Surface 上 test 垢 (ren.fujimoto.89) を Professional account に切替
 * (v0.4.60 の popover variant 検証用、終わったら Personal に戻すこと)。
 *
 * IG Settings の DOM は SPA で深く、URL も hash 系で variant 多数なので
 * - まず Settings tab に navigate
 * - 'Switch to professional account' 系の text を持つ clickable を順次 click
 * - wizard が出たら "Next" / "Done" を text 完全一致で押す
 * を試みる。失敗したら何 step まで進んだかを log して human-in-loop 対応。
 */
import puppeteer from 'puppeteer-core';

const res = await fetch('http://localhost:9222/json/version');
const ws = (await res.json()).webSocketDebuggerUrl;
const browser = await puppeteer.connect({ browserWSEndpoint: ws, defaultViewport: null });

const pages = await browser.pages();
let ig = pages.find((p) => /instagram\.com/.test(p.url()));
if (!ig) ig = await browser.newPage();
await ig.bringToFront();

ig.on('console', (m) => {
  if (m.type() === 'error') console.log(`[ig:err] ${m.text()}`);
});

// 候補 URL を順番に試す (variant 多数のため)
const candidates = [
  'https://www.instagram.com/accounts/professional_account_redirect/',
  'https://www.instagram.com/accounts/business_tools/',
  'https://www.instagram.com/account/',
  'https://www.instagram.com/accounts/edit/',
];

for (const url of candidates) {
  console.log(`[switch-ig] trying ${url}`);
  try {
    await ig.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (e) {
    console.log(`  navigation error: ${e.message}`);
    continue;
  }
  await new Promise((r) => setTimeout(r, 3000));

  // ページ全体から "switch to professional" / "プロフェッショナル" 等のテキストを探す
  const result = await ig.evaluate(() => {
    const TEXTS = [
      'Switch to professional account',
      'Switch to Professional Account',
      'Switch to Business account',
      'プロフェッショナルアカウントに切り替える',
      'プロフェッショナル アカウントに切り替える',
      'Switch account type',
    ];
    const all = Array.from(document.querySelectorAll('a, button, div[role="button"], span'));
    for (const el of all) {
      const t = (el.textContent || '').trim();
      for (const target of TEXTS) {
        if (t === target || (t.length < 100 && t.includes(target))) {
          // clickable parent を返す
          const clickable = el.closest('a, button, div[role="button"]') || el;
          (clickable).click();
          return { clicked: true, text: t.slice(0, 50), url: location.href };
        }
      }
    }
    // URL ベースに何が見えてるかも返す
    const visibleHints = all.slice(0, 30).map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 60);
    return { clicked: false, url: location.href, hints: visibleHints.slice(0, 20) };
  });

  console.log(`  result: ${JSON.stringify(result, null, 2).slice(0, 800)}`);
  if (result.clicked) {
    console.log(`[switch-ig] clicked at ${url}, waiting for wizard...`);
    await new Promise((r) => setTimeout(r, 4000));

    // Wizard を 5 step ぐらい "Next" / "Continue" / "次へ" で進む
    for (let step = 1; step <= 6; step++) {
      const next = await ig.evaluate(() => {
        const TEXTS = ['Next', 'Continue', 'Done', 'OK', 'Skip', '次へ', '続ける', '完了', 'スキップ'];
        const all = Array.from(document.querySelectorAll('button, div[role="button"], a[role="button"]'));
        // dialog 内優先
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        const scope = dialogs.length > 0
          ? dialogs.flatMap((d) => Array.from(d.querySelectorAll('button, div[role="button"]')))
          : all;
        for (const t of TEXTS) {
          for (const el of scope) {
            if ((el.textContent || '').trim() === t) {
              if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
              el.click();
              return { text: t, url: location.href };
            }
          }
        }
        // Category 選択 step は first item を select
        const categories = Array.from(document.querySelectorAll('[role="radio"], [role="option"], [role="checkbox"]'));
        if (categories.length > 0) {
          categories[0].click();
          return { text: '(picked first category)', url: location.href };
        }
        return null;
      });
      if (!next) {
        console.log(`  step ${step}: no next button found, stopping wizard auto-advance`);
        break;
      }
      console.log(`  step ${step}: clicked "${next.text}"`);
      await new Promise((r) => setTimeout(r, 2500));
    }

    // Final check
    const final = await ig.evaluate(() => ({ url: location.href, hasProfessionalDashboard: !!document.querySelector('a[href*="/insights"], a[href*="/professional_dashboard"]') }));
    console.log(`[switch-ig] final state: ${JSON.stringify(final)}`);
    break;
  }
}

browser.disconnect();
