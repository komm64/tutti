// popup UI を経由せず、background に直接 POST_REQUEST メッセージを送る driver。
// popup の autoPost state race 問題を完全回避。
import { writeFileSync, appendFileSync, readFileSync } from 'fs';
import {
  listCdpTargets,
  RawCdpClient,
  resolveExtensionId,
} from './e2e/cdp-harness.mjs';

const LOG = 'scripts/realpost-pixiv-direct.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};

const tabs = await listCdpTargets();
const pix = tabs.find(t => t.type === 'page' && /pixiv\.net/.test(t.url));
const popupTab = tabs.find(t => t.type === 'page' && (/popup\.html|chrome:\/\/extensions/.test(t.url) || t.url === 'about:blank'));
if (!pix || !popupTab) { log('missing tab', { pix: !!pix, popup: !!popupTab }); process.exit(1); }

const pixCdp = new RawCdpClient(pix.webSocketDebuggerUrl, { name: 'pixiv', logger: log });
const popupCdp = new RawCdpClient(popupTab.webSocketDebuggerUrl, { name: 'popup', logger: log });
await pixCdp.connect();
await popupCdp.connect();
log('both connected');

// popup タブを popup.html に navigate (chrome.runtime API を使うため)
await popupCdp.send('Page.enable');
const EXT_ID = await resolveExtensionId({ targets: () => tabs }, { timeoutMs: 1 });
if (!popupTab.url.includes('popup.html')) {
  log('navigating popup tab to popup.html');
  await popupCdp.send('Page.navigate', { url: `chrome-extension://${EXT_ID}/popup.html` });
  await new Promise((r) => setTimeout(r, 2500));
}

// Pixiv が /illustration/create でなければ navigate
if (!/\/illustration\/create/.test(pix.url)) {
  log('navigating pixiv tab to /illustration/create');
  await pixCdp.send('Page.enable');
  await pixCdp.send('Page.navigate', { url: 'https://www.pixiv.net/illustration/create' });
  await new Promise((r) => setTimeout(r, 4000));
}

// 画像を base64 で popup へ送って POST_REQUEST を background に dispatch
const png = readFileSync('scripts/all-sns-mastodon.png');
const b64 = png.toString('base64');
const ts = Date.now().toString().slice(-6);
const testText = `Tutti realpost ${ts}\n本文 line 2.`;

log('dispatching POST_REQUEST to background (bypasses popup UI)');
const dispatchResult = await popupCdp.evaluate(`(async () => {
  const bin = atob(${JSON.stringify(b64)});
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  // ImageAttachment は base64 string
  const message = {
    type: 'POST_REQUEST',
    requestId: crypto.randomUUID(),
    intent: 'new',
    text: ${JSON.stringify(testText)},
    platforms: ['pixiv'],
    images: [{ name: 'realpost.png', type: 'image/png', data: ${JSON.stringify(b64)} }],
  };
  // popup→background は normal sendMessage、background は autoPost を storage から読む
  // 先に storage に autoPost=true を確実に書き込む
  await new Promise(r => chrome.storage.sync.set({ settings: { autoPost: true, mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', selectorOverrideUrl: '', logLevel: 'INFO' } }, r));
  // 検証
  const s = await new Promise(r => chrome.storage.sync.get('settings', d => r(d.settings)));
  if (!s?.autoPost) return { err: 'autoPost still false', settings: s };
  // POST_REQUEST 送信。background がプラットフォーム毎に処理する
  const response = await chrome.runtime.sendMessage(message);
  return { ok: true, settings: s, response };
})()`);
log('dispatch result:', dispatchResult);

// Pixiv tab を 90s 監視
const start = Date.now();
const MAX = 90000;
let iter = 0;
while (Date.now() - start < MAX) {
  iter++;
  await new Promise((r) => setTimeout(r, 2000));
  let snap;
  try {
    snap = await pixCdp.evaluate(`({
      url: location.href,
      title: document.querySelector('input[name="title"]')?.value ?? null,
      capLen: (document.querySelector('textarea[name="comment"]')?.value ?? '').length,
      previewCount: document.querySelectorAll('img[src^="blob:"], canvas').length,
      vis: document.querySelector('input[type="radio"][name="x_restrict"]:checked')?.value ?? null,
      ai: document.querySelector('input[type="radio"][name="ai_type"]:checked')?.value ?? null,
      sex: document.querySelector('input[type="radio"][name="sexual"]:checked')?.value ?? null,
      bottomPostEnabled: ![...document.querySelectorAll('button')].filter(b => /^Post$|^投稿$/i.test((b.textContent ?? '').trim()) && !b.className.includes('gtm-work-post-button-in-header-click'))[0]?.disabled,
    })`, false);
  } catch (e) { log(`eval err: ${e.message?.slice(0, 80)}`); continue; }
  log(`t+${Math.round((Date.now() - start) / 1000)}s`, snap);
  if (/\/artworks\/|\/users\/\d/.test(snap?.url ?? '')) {
    log('🎉 SUCCESS — submit completed');
    break;
  }
}
log('done');
pixCdp.close();
popupCdp.close();
