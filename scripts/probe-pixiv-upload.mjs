// Probe Pixiv's upload form to determine multi-step flow shape and selectors.
//
// Pre-req: launch-test-brave.cmd で Brave 起動 + Pixiv にログインしておく。
// 使い方: node scripts/probe-pixiv-upload.mjs
//
// 仮説 (CLAUDE.md より): image select → caption → tags → submit (4 step)
// 実機 DOM を見て、本当に wizard なのか単一 form なのか確定させる。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync } from 'fs';

// 出力を必ず fs に残す (stdout buffering を回避)
const LOG = 'scripts/pixiv-probe.log';
writeFileSync(LOG, `=== probe ${new Date().toISOString()} ===\n`);
const log = (...args) => {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};

process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message, e.stack?.slice(0, 500)); process.exit(1); });
process.on('unhandledRejection', (e) => { log('UNHANDLED_REJ', String(e), e?.stack?.slice(0, 500)); process.exit(1); });

log('connecting to brave on 9222...');
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 180000 });
log('connected');

// 既存 pixiv タブを閉じない (user の login state を保持するため)。新規タブを 1 つ開く。
const page = await browser.newPage();
log('newPage ok');
page.on('console', (m) => log('[page]', m.text().slice(0, 300)));
page.on('pageerror', (e) => log('[page-err]', e.message?.slice(0, 300)));

// 候補 URL を順に試す。redirect 後の URL も記録。
const CANDIDATES = [
  'https://www.pixiv.net/illustration/create',
  'https://www.pixiv.net/upload.php',
  'https://www.pixiv.net/manga/create',
];

async function snapshot(label) {
  const data = await page.evaluate(() => {
    const looksLikeImageInput = (el) =>
      el.tagName === 'INPUT' && el.type === 'file' && /image/i.test(el.accept ?? '');

    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map((f) => ({
      accept: f.accept,
      multiple: f.multiple,
      hidden: f.hidden || f.type === 'hidden' || getComputedStyle(f).display === 'none',
      attrs: Object.fromEntries(Array.from(f.attributes).map((a) => [a.name, a.value])),
      isImage: looksLikeImageInput(f),
    }));

    const textInputsAndAreas = Array.from(
      document.querySelectorAll('input[type="text"], input:not([type]), textarea, [contenteditable="true"]'),
    )
      .slice(0, 30)
      .map((el) => ({
        tag: el.tagName,
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        id: el.id,
        placeholder: el.getAttribute('placeholder'),
        ariaLabel: el.getAttribute('aria-label'),
        maxlength: el.getAttribute('maxlength'),
        contentEditable: el.getAttribute('contenteditable'),
        // tag-input 特定用
        role: el.getAttribute('role'),
      }));

    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter((b) => {
        const t = (b.textContent ?? '').trim();
        const a = b.getAttribute('aria-label') ?? '';
        return /next|次へ|投稿|公開|保存|送信|submit|post|publish|アップロード|upload/i.test(t + ' ' + a);
      })
      .slice(0, 20)
      .map((b) => ({
        text: (b.textContent ?? '').trim().slice(0, 60),
        aria: b.getAttribute('aria-label'),
        type: b.getAttribute('type'),
        disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
        class: b.className?.toString?.().slice?.(0, 80),
      }));

    // tag input らしき要素 — pixiv は <input class="tag-input" ...> や React combobox のことが多い
    const tagCandidates = Array.from(document.querySelectorAll('[class*="tag" i] input, [class*="Tag"] input, [role="combobox"] input'))
      .slice(0, 10)
      .map((el) => ({
        tag: el.tagName,
        placeholder: el.getAttribute('placeholder'),
        ariaLabel: el.getAttribute('aria-label'),
        parentClass: el.parentElement?.className?.toString?.().slice?.(0, 80),
      }));

    return {
      url: location.href,
      title: document.title,
      hasReact: !!document.querySelector('[id="root"], #app'),
      fileInputs,
      textInputCount: textInputsAndAreas.length,
      textInputs: textInputsAndAreas,
      relevantButtons: buttons,
      tagCandidates,
      // 「次へ」ボタンが複数あれば wizard 確定
      nextLikeCount: buttons.filter((b) => /next|次/i.test(b.text + ' ' + (b.aria ?? ''))).length,
      // login 状態の確認 (login redirect されたら user_id とかは無い)
      loggedInHint: !!document.querySelector('[href*="/users/"]'),
    };
  });
  log(`\n=== ${label} ===`);
  log(data);
  return data;
}

for (const url of CANDIDATES) {
  log(`\n[step] navigating: ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (err) {
    log(`  goto failed: ${err.message?.slice(0, 200)}`);
    continue;
  }
  await new Promise((r) => setTimeout(r, 6000));
  let snap;
  try {
    snap = await snapshot(`after ${url}`);
  } catch (err) {
    log(`  snapshot failed: ${err.message?.slice(0, 200)}`);
    continue;
  }
  if (/login|signup/i.test(snap.url)) {
    log('  → redirected to login. Pixiv にログインしてから再実行してください。');
    break;
  }
  if (snap.fileInputs.length > 0 || snap.textInputCount > 0) {
    log(`  → form-like page detected at ${snap.url}`);
  }
}

try {
  await page.screenshot({ path: 'scripts/pixiv-upload-probe.png', fullPage: true });
  log('\nスクリーンショット: scripts/pixiv-upload-probe.png');
} catch (err) {
  log(`screenshot failed: ${err.message}`);
}
await browser.disconnect();
log('done');
