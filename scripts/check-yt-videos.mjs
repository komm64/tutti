import { WebSocket } from 'ws';
const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const yt = tabs.find(t => t.type === 'page' && /studio\.youtube/.test(t.url));
const ws = new WebSocket(yt.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
const send = (method, params) => new Promise(resolve => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Page.navigate', { url: 'https://studio.youtube.com/channel/UCxDdnILOoRDaC0IWjioL_8g/videos/upload' });
await new Promise(r => setTimeout(r, 5000));
const evalJs = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true }).then(r => r.result?.value);
const data = await evalJs(`(() => ({
  url: location.href,
  videoRows: [...document.querySelectorAll('ytcp-video-row, [class*="video-list"] [role="row"]')].slice(0, 5).map(r => (r.textContent ?? '').trim().slice(0, 200)),
  videoCount: document.querySelectorAll('ytcp-video-row').length,
  bodyTop: document.body?.innerText?.slice(0, 500),
}))()`);
console.log(JSON.stringify(data, null, 2));
ws.close();
