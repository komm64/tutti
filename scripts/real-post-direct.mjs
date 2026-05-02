// 汎用 direct POST_REQUEST driver。任意の platform に対応。
// 使い方: node scripts/real-post-direct.mjs <platform>
//   例: node scripts/real-post-direct.mjs deviantart
//
// popup UI を介さず chrome.runtime.sendMessage で直接 background に POST_REQUEST。
// autoPost state race 問題を完全回避。
import { WebSocket } from 'ws';
import { writeFileSync, appendFileSync, readFileSync } from 'fs';

const platform = process.argv[2];
if (!platform) { console.error('usage: node scripts/real-post-direct.mjs <platform>'); process.exit(1); }

const LOG = `scripts/realpost-${platform}-direct.log`;
writeFileSync(LOG, `=== ${new Date().toISOString()} platform=${platform} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};

const PLATFORM_URL_RE = {
  pixiv: /pixiv\.net/,
  deviantart: /deviantart\.com/,
  instagram: /instagram\.com/,
  youtube: /youtube\.com/,
  tiktok: /tiktok\.com/,
  x: /(x\.com|twitter\.com)/,
  bluesky: /bsky\.app/,
  threads: /threads\.(net|com)/,
  mastodon: /mastodon\.social/,
  misskey: /misskey\.io/,
  tumblr: /tumblr\.com/,
};
const re = PLATFORM_URL_RE[platform];
if (!re) { log(`unknown platform: ${platform}`); process.exit(1); }

const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();

const popupTab = tabs.find(t => t.type === 'page' && (/popup\.html/.test(t.url) || /chrome:\/\/extensions/.test(t.url) || t.url === 'about:blank'));
if (!popupTab) { log('no popup-capable tab. open chrome://extensions/'); process.exit(1); }

class Cdp {
  constructor(url, name) { this.name = name; this.url = url; this.id = 0; this.pending = new Map(); }
  async connect() {
    return new Promise((resolve) => {
      this.ws = new WebSocket(this.url, { perMessageDeflate: false });
      this.ws.on('open', resolve);
      this.ws.on('error', (e) => log(`${this.name} WS_ERR`, e.message));
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.id != null && this.pending.has(m.id)) {
          this.pending.get(m.id).resolve(m.result);
          this.pending.delete(m.id);
        }
      });
    });
  }
  send(method, params = {}) {
    const i = ++this.id;
    return new Promise((resolve) => {
      this.pending.set(i, { resolve });
      this.ws.send(JSON.stringify({ id: i, method, params }));
    });
  }
  async evalJs(expr, awaitPromise = true) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result?.value;
  }
  close() { this.ws.close(); }
}

const popupCdp = new Cdp(popupTab.webSocketDebuggerUrl, 'popup');
await popupCdp.connect();
log('popup connected');

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';
await popupCdp.send('Page.enable');
if (!popupTab.url.includes('popup.html')) {
  log('navigating popup tab to popup.html');
  await popupCdp.send('Page.navigate', { url: `chrome-extension://${EXT_ID}/popup.html` });
  await new Promise((r) => setTimeout(r, 2500));
}

const png = readFileSync('scripts/all-sns-mastodon.png');
const b64 = png.toString('base64');
const ts = Date.now().toString().slice(-6);
const testText = `Tutti realpost ${platform} ${ts}\n本文 line 2.`;

log('dispatching POST_REQUEST to background');
const dispatchResult = await popupCdp.evalJs(`(async () => {
  await new Promise(r => chrome.storage.sync.set({ settings: { autoPost: true, mastodonInstance: 'https://mastodon.social', misskeyInstance: 'https://misskey.io', selectorOverrideUrl: '', logLevel: 'INFO' } }, r));
  const s = await new Promise(r => chrome.storage.sync.get('settings', d => r(d.settings)));
  if (!s?.autoPost) return { err: 'autoPost still false' };
  const message = {
    type: 'POST_REQUEST',
    text: ${JSON.stringify(testText)},
    platforms: [${JSON.stringify(platform)}],
    images: [{ name: 'realpost.png', type: 'image/png', data: ${JSON.stringify(b64)} }],
  };
  const response = await chrome.runtime.sendMessage(message);
  return { ok: true, settings: s, response };
})()`);
log('dispatch:', dispatchResult);

// 当該 platform のタブを探して 90s 監視
const start = Date.now();
const MAX = 90000;
let tab = null;
while (Date.now() - start < MAX) {
  await new Promise((r) => setTimeout(r, 2000));
  const r = await fetch('http://localhost:9222/json/list');
  const list = await r.json();
  tab = list.find((t) => t.type === 'page' && re.test(t.url ?? ''));
  if (tab) break;
}
if (!tab) { log(`no ${platform} tab opened in ${MAX}ms`); popupCdp.close(); process.exit(1); }

log(`watching ${platform} tab: ${tab.url}`);
const tabCdp = new Cdp(tab.webSocketDebuggerUrl, platform);
await tabCdp.connect();

// 60s 監視 (URL 変化と発火)
const wstart = Date.now();
const WMAX = 90000;
let lastUrl = '';
while (Date.now() - wstart < WMAX) {
  await new Promise((r) => setTimeout(r, 2000));
  let url;
  try { url = await tabCdp.evalJs(`location.href`, false); } catch (e) { log(`eval err: ${e.message?.slice(0, 80)}`); continue; }
  if (url !== lastUrl) { log(`t+${Math.round((Date.now() - wstart) / 1000)}s url=${url}`); lastUrl = url; }
}
log('done');
popupCdp.close();
tabCdp.close();
