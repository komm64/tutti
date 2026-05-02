// TikTok upload modal の深堀り。video 入る前後の DOM 変化を観察。
import { WebSocket } from 'ws';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = 'scripts/tiktok-deep-probe.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};

const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const tt = tabs.find(t => t.type === 'page' && /tiktok\.com.*upload/.test(t.url));
if (!tt) { log('navigate to tiktok upload first'); process.exit(1); }

const ws = new WebSocket(tt.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
const evalJs = expr => new Promise(resolve => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); }).then(r => r.result?.value);

const data = await evalJs(`(() => ({
  url: location.href,
  fileInputs: [...document.querySelectorAll('input[type="file"]')].map(f => ({
    accept: f.accept,
    multiple: f.multiple,
    name: f.getAttribute('name'),
    class: f.className?.toString?.().slice?.(0, 80),
    parents: (() => { const a = []; let n = f.parentElement; for (let i = 0; i < 4 && n; i++) { a.push(n.tagName + '.' + ((n.className?.toString?.()) ?? '').slice(0, 50)); n = n.parentElement; } return a; })(),
  })),
  // 「Select video to upload」ボタンの parent 構造
  selectVideoBtn: (() => {
    const b = [...document.querySelectorAll('button, [role="button"]')].find(el => /select.*video.*to.*upload|アップロードする動画を選択/i.test((el.textContent ?? '').trim()));
    return b ? { tag: b.tagName, class: b.className?.toString?.().slice?.(0, 80), html: b.outerHTML?.slice(0, 400) } : null;
  })(),
  // photo upload 切替がないか確認 (TikTok 2024+ has photo mode)
  photoTab: [...document.querySelectorAll('*')].filter(e => !e.children.length && /photo|画像|写真/i.test((e.textContent ?? '').trim())).slice(0, 5).map(e => ({ tag: e.tagName, text: (e.textContent ?? '').trim().slice(0, 40), parent: e.parentElement?.tagName })),
  // 既存 caption editor (file 選択前にも DOM にある場合)
  potentialEditors: [...document.querySelectorAll('[contenteditable="true"], textarea')].slice(0, 5).map(el => ({ tag: el.tagName, ariaLabel: el.getAttribute('aria-label'), placeholder: el.getAttribute('placeholder'), class: el.className?.toString?.().slice?.(0, 60) })),
  // 全 buttons (small subset to find post)
  allButtons: [...document.querySelectorAll('button, [role="button"]')].slice(0, 30).map(b => ({ text: (b.textContent ?? '').trim().slice(0, 40), aria: b.getAttribute('aria-label'), disabled: b.disabled })),
}))()`);
log(data);
ws.close();
