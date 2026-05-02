import { WebSocket } from 'ws';
const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const pix = tabs.find(t => t.type === 'page' && /pixiv\.net/.test(t.url));
if (!pix) { console.log('no pixiv'); process.exit(1); }
const ws = new WebSocket(pix.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
const send = (method, params = {}) => new Promise(resolve => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Page.navigate', { url: 'https://www.pixiv.net/illustration/create' });
console.log('navigated');
await new Promise(r => setTimeout(r, 3000));
ws.close();
