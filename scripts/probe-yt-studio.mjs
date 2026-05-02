import { WebSocket } from 'ws';
const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const yt = tabs.find(t => t.type === 'page' && /studio\.youtube/.test(t.url));
const ws = new WebSocket(yt.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
const evalJs = expr => new Promise(resolve => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); }).then(r => r.result?.value);
const data = await evalJs(`(() => ({
  url: location.href,
  title: document.title,
  // Create / Upload 系 button
  createBtns: [...document.querySelectorAll('button, ytcp-button, [role="button"], a')].filter(b => /create|upload|新規作成|アップロード/i.test((b.textContent ?? '') + ' ' + (b.getAttribute('aria-label') ?? ''))).slice(0, 10).map(b => ({ tag: b.tagName, text: (b.textContent ?? '').trim().slice(0, 50), aria: b.getAttribute('aria-label'), id: b.id })),
  // file inputs
  fileInputs: [...document.querySelectorAll('input[type="file"]')].slice(0, 5).map(f => ({ accept: f.accept, hidden: f.hidden, id: f.id, name: f.getAttribute('name') })),
  // upload-related
  uploadComponents: [...document.querySelectorAll('ytcp-uploads-button, ytcp-uploads-list, [class*="upload" i]')].slice(0, 5).map(el => ({ tag: el.tagName, id: el.id, class: el.className?.toString?.().slice?.(0, 60) })),
}))()`);
console.log(JSON.stringify(data, null, 2));
ws.close();
