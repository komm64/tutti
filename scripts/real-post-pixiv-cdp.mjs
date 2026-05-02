// puppeteer の高レベル API を回避し、raw CDP (WebSocket) で Pixiv に投稿する。
// Brave の auto-attach + 既存 DevTools と競合する Target.attachToTarget hang を回避。
//
// やること:
//   1. /json/list で Pixiv tab と extensions tab の webSocketDebuggerUrl 取得
//   2. WS 直接接続 → Runtime.evaluate で popup を navigate / 操作 / Pixiv の状態 watch
//
// require: ws (puppeteer-core が dep に持ってるはず)
import { writeFileSync, appendFileSync, readFileSync } from 'fs';
import { WebSocket } from 'ws';

const LOG = 'scripts/realpost-pixiv-cdp.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message?.slice(0, 200), e.stack?.slice(0, 200)); process.exit(1); });
process.on('unhandledRejection', (e) => { log('UNHANDLED_REJ', String(e)?.slice(0, 200)); });
process.on('exit', (code) => { log(`process.exit(${code})`); });

const EXT_ID = 'dophemlpjldcejjdjefpjbgngodopkfe';

// CDP WebSocket client (1 target = 1 WS connection)
class CdpClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url, { perMessageDeflate: false });
      this.ws.on('open', () => resolve());
      this.ws.on('error', (e) => {
        process.stdout.write(`WS_ERROR ${e.message?.slice(0, 100)}\n`);
        if (this.pending.size === 0) reject(e);
        else for (const { reject: rej } of this.pending.values()) rej(e);
        this.pending.clear();
      });
      this.ws.on('close', (code, reason) => {
        process.stdout.write(`WS_CLOSE code=${code} reason=${reason?.toString?.()?.slice?.(0, 60)}\n`);
        for (const { reject: rej } of this.pending.values()) rej(new Error('WS closed'));
        this.pending.clear();
      });
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.id != null && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      });
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        return reject(new Error(`WS not open (readyState=${this.ws?.readyState ?? 'null'})`));
      }
      this.pending.set(id, { resolve, reject });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (e) {
        this.pending.delete(id);
        reject(e);
        return;
      }
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP ${method} timeout`));
        }
      }, 30000);
    });
  }
  async evaluate(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (r.exceptionDetails) {
      const exc = r.exceptionDetails;
      throw new Error(`${exc.text} ${exc.exception?.description ?? ''}`.slice(0, 400));
    }
    return r.result?.value;
  }
  async navigate(url) {
    await this.send('Page.enable');
    await this.send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 2500)); // simple settle
  }
  close() { this.ws?.close(); }
}

// targets list
log('fetching /json/list...');
const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
log(`tabs: ${tabs.length}`);

// 任意の pixiv.net タブ。Tutti の openOrFocusTab が自動で /illustration/create に navigate
const pixTab = tabs.find((t) => t.type === 'page' && /pixiv\.net\//.test(t.url));
// popup として使えるタブ: 既に popup.html を開いてるか、chrome://extensions/、about:blank のいずれか
const extTab = tabs.find((t) => t.type === 'page' && (
  /popup\.html/.test(t.url) || /chrome:\/\/extensions/.test(t.url) || t.url === 'about:blank'
));
if (!pixTab) { log('no pixiv tab'); process.exit(1); }
if (!extTab) { log('no usable popup tab. open popup.html, chrome://extensions/, or about:blank'); process.exit(1); }

log(`pixiv ws: ${pixTab.webSocketDebuggerUrl}`);
log(`ext ws: ${extTab.webSocketDebuggerUrl}`);

const pix = new CdpClient(pixTab.webSocketDebuggerUrl);
const ext = new CdpClient(extTab.webSocketDebuggerUrl);
await pix.connect();
log('pix connected');
await ext.connect();
log('ext connected');

// extensions tab を popup.html に navigate
log('navigating ext to popup');
await ext.send('Page.enable');
await ext.send('Page.navigate', { url: `chrome-extension://${EXT_ID}/popup.html` });
await new Promise((res) => setTimeout(res, 2500));

// configure storage
log('configuring storage');
await ext.evaluate(`Promise.all([
  new Promise(r => chrome.storage.sync.set({ settings: { autoPost: true } }, r)),
  new Promise(r => chrome.storage.session.remove('draft', r)),
  new Promise(r => chrome.storage.local.set({ selectedPlatforms: { pixiv: true, x: false, bluesky: false, threads: false, mastodon: false, misskey: false, tumblr: false, deviantart: false, instagram: false } }, r)),
])`, true);

await ext.send('Page.reload');
await new Promise((r) => setTimeout(r, 2500));

// popup の autoPost checkbox を ON に強制 (storage.sync.set だけだと race で
// false に戻ることがあるので UI 経由で確実にトグル)
log('forcing autoPost ON via UI');
const autoPostState = await ext.evaluate(`(() => {
  const cb = [...document.querySelectorAll('input[type="checkbox"]')]
    .find(c => /autoPost|auto-?post|自動投稿/i.test(c.closest('label')?.textContent ?? '')
              || /autoPost|Auto-post/.test(c.id ?? ''));
  if (!cb) return { err: 'no autoPost checkbox' };
  if (!cb.checked) cb.click();
  return { wasChecked: cb.checked, label: cb.closest('label')?.textContent?.trim().slice(0, 40) };
})()`);
log('autoPost cb state:', autoPostState);
await new Promise((r) => setTimeout(r, 600));

// 画像と text を popup に流し込む
const png = readFileSync('scripts/all-sns-mastodon.png');
const b64 = png.toString('base64');
const ts = Date.now().toString().slice(-6);
const testText = `Tutti realpost ${ts}\n本文 line 2.`;
log('injecting image + text into popup');
const popupResult = await ext.evaluate(`(async () => {
  const ta = document.querySelector('textarea');
  ta.focus();
  ta.value = ${JSON.stringify(testText)};
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));

  // 画像を File として popup の input に入れる
  const bin = atob(${JSON.stringify(b64)});
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const file = new File([arr], 'tutti-realpost.png', { type: 'image/png' });
  const fi = document.querySelector('input[type="file"]');
  const dt = new DataTransfer(); dt.items.add(file);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set.call(fi, dt.files);
  fi.dispatchEvent(new Event('change', { bubbles: true }));

  await new Promise(r => setTimeout(r, 1500));

  // Pixiv だけ ON
  for (const cb of document.querySelectorAll('input[type="checkbox"]')) {
    const isPixiv = /Pixiv/i.test(cb.closest('label')?.textContent ?? '');
    if (cb.checked !== isPixiv) cb.click();
  }
  await new Promise(r => setTimeout(r, 500));

  const btn = [...document.querySelectorAll('button')].find(b =>
    /SNS に投稿|SNS をプレビュー|Post to|Preview on/i.test(b.textContent ?? '')
  );
  if (!btn) return { err: 'post button not found' };
  btn.click();
  return { ok: true };
})()`, true);
log('popup result:', popupResult);
log('entering watch loop');

const start = Date.now();
const MAX = 90000;
let iter = 0;
while (Date.now() - start < MAX) {
  iter++;
  log(`loop iter=${iter} elapsed=${Math.round((Date.now() - start) / 1000)}s pix.ws=${pix.ws?.readyState} ext.ws=${ext.ws?.readyState}`);
  process.stdout.write('before sleep\n');
  try {
    await new Promise((r) => setTimeout(r, 2000));
  } catch (e) { log('sleep err', e.message); break; }
  process.stdout.write('after sleep\n');
  let snap;
  try {
    snap = await pix.evaluate(`({
      url: location.href,
      title: document.querySelector('input[name="title"]')?.value ?? null,
      capLen: (document.querySelector('textarea[name="comment"]')?.value ?? '').length,
      tagInputVal: document.querySelector('input[placeholder="Tags"]')?.value ?? null,
      tagChips: document.querySelectorAll('[role="listitem"], [class*="chip" i]').length,
      previewCount: document.querySelectorAll('img[src^="blob:"], canvas').length,
      vis: document.querySelector('input[type="radio"][name="x_restrict"]:checked')?.value ?? null,
      ai: document.querySelector('input[type="radio"][name="ai_type"]:checked')?.value ?? null,
    })`);
  } catch (e) { log(`eval err iter=${iter}: ${e.message?.slice(0, 100)}`); continue; }
  log(`t+${Math.round((Date.now() - start) / 1000)}s`, snap);
  if (/\/artworks\//.test(snap?.url ?? '')) {
    log('🎉 SUCCESS');
    break;
  }
}
log(`watch loop ended. iter=${iter} elapsed=${Math.round((Date.now() - start) / 1000)}s`);

pix.close();
ext.close();
log('done');
