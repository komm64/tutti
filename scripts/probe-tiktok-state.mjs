import { WebSocket } from 'ws';
const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const tt = tabs.find(t => t.type === 'page' && /tiktok\.com/.test(t.url));
const ws = new WebSocket(tt.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
const evalJs = expr => new Promise(resolve => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); }).then(r => r.result?.value);
const data = await evalJs(`(() => ({
  url: location.href,
  title: document.title,
  videoElements: document.querySelectorAll('video').length,
  caption: [...document.querySelectorAll('[contenteditable="true"]')].map(e => ({ aria: e.getAttribute('aria-label'), text: (e.textContent ?? '').slice(0, 80) })),
  postBtns: [...document.querySelectorAll('button')].filter(b => /post|publish|投稿|公開/i.test((b.textContent ?? '').trim())).map(b => ({ text: (b.textContent ?? '').trim().slice(0, 30), disabled: b.disabled })),
  uploadBtns: [...document.querySelectorAll('button')].filter(b => /upload|select.*video|アップロード/i.test((b.textContent ?? '').trim())).map(b => ({ text: (b.textContent ?? '').trim().slice(0, 40), disabled: b.disabled })),
  errors: [...document.querySelectorAll('[role="alert"], [class*="error" i]')].filter(e => (e.textContent ?? '').trim().length > 0).slice(0, 5).map(e => (e.textContent ?? '').trim().slice(0, 100)),
  fileInputs: [...document.querySelectorAll('input[type="file"]')].map(f => ({ accept: f.accept, hasFiles: f.files?.length ?? 0 })),
}))()`);
console.log(JSON.stringify(data, null, 2));
ws.close();
