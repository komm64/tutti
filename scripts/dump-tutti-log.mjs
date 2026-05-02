import { WebSocket } from 'ws';
const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const sw = tabs.find(t => /background/.test(t.url ?? '') || t.type === 'service_worker');
let target = sw;
if (!target) {
  // 任意のページから chrome.storage.local で取れる
  target = tabs.find(t => t.type === 'page' && /pixiv|popup\.html/.test(t.url));
}
if (!target) { console.log('no usable target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
const evalJs = expr => new Promise(resolve => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); }).then(r => r.result?.value);

const logs = await evalJs(`new Promise(r => chrome.storage.local.get('logBuffer', d => r(d.logBuffer ?? [])))`);
// 引数で platform/keyword 絞り込み
const filter = process.argv[2];
let entries = Array.isArray(logs) ? logs : [];
if (filter) {
  const re = new RegExp(filter, 'i');
  entries = entries.filter(e => re.test(e.message ?? '') || re.test(e.context ?? ''));
}
console.log(JSON.stringify(entries.slice(-30), null, 2));
ws.close();
