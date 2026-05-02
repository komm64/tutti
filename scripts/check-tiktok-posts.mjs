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
  videoListItems: [...document.querySelectorAll('a[href*="/video/"], [class*="video-item" i]')].slice(0, 5).map(el => ({ href: el.getAttribute('href'), text: (el.textContent ?? '').trim().slice(0, 80) })),
  bodyTopText: document.body?.innerText?.slice(0, 600),
}))()`);
console.log(JSON.stringify(data, null, 2));
ws.close();
