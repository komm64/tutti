// YouTube Shorts upload を probe。studio.youtube.com 経由。
import { WebSocket } from 'ws';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = 'scripts/youtube-probe.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};

const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const yt = tabs.find(t => t.type === 'page' && /youtube\.com/.test(t.url));
if (!yt) { log('no youtube tab'); process.exit(1); }

const ws = new WebSocket(yt.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
const send = (method, params) => new Promise(resolve => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true }).then(r => r.result?.value);

const CANDIDATES = [
  'https://studio.youtube.com/',
  'https://www.youtube.com/upload',
  'https://www.youtube.com/shorts/upload',
];

await send('Page.enable');
for (const url of CANDIDATES) {
  log(`navigate: ${url}`);
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 7000));
  const data = await evalJs(`(() => ({
    url: location.href,
    title: document.title.slice(0, 80),
    fileInputs: [...document.querySelectorAll('input[type="file"]')].slice(0, 5).map(f => ({ accept: f.accept, multiple: f.multiple, hidden: f.hidden || getComputedStyle(f).display === 'none', id: f.id, name: f.getAttribute('name') })),
    editors: [...document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]')].slice(0, 10).map(el => ({ tag: el.tagName, type: el.getAttribute('type'), name: el.getAttribute('name'), ariaLabel: el.getAttribute('aria-label'), placeholder: el.getAttribute('placeholder') })),
    uploadButton: [...document.querySelectorAll('button, [role="button"], a')].filter(b => /create|upload|投稿|アップロード|new video|new post/i.test((b.textContent ?? '') + ' ' + (b.getAttribute('aria-label') ?? ''))).slice(0, 10).map(b => ({ text: (b.textContent ?? '').trim().slice(0, 40), aria: b.getAttribute('aria-label'), tag: b.tagName, href: b.getAttribute('href') })),
    headings: [...document.querySelectorAll('h1, h2, h3, [role="heading"]')].slice(0, 5).map(h => (h.textContent ?? '').trim().slice(0, 80)),
  }))()`);
  log(data);
  if (data.fileInputs.length > 0 || data.uploadButton.length > 0) { log(`✓ found at ${data.url}`); break; }
}

ws.close();
