import { WebSocket } from 'ws';
const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const yt = tabs.find(t => t.type === 'page' && /studio\.youtube/.test(t.url));
const ws = new WebSocket(yt.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
const evalJs = (expr, awaitPromise = false) => new Promise(resolve => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise } })); }).then(r => r.result?.value);

// Click Upload videos button
console.log('clicking Upload videos button');
await evalJs(`document.querySelector('#upload-button')?.click()`);
await new Promise(r => setTimeout(r, 3000));
const data = await evalJs(`(() => ({
  url: location.href,
  fileInputs: [...document.querySelectorAll('input[type="file"]')].slice(0, 6).map(f => ({ accept: f.accept, hidden: f.hidden, id: f.id, class: f.className?.toString?.().slice?.(0, 60), parents: (() => { const a = []; let n = f.parentElement; for (let i = 0; i < 4 && n; i++) { a.push(n.tagName + (n.id ? '#' + n.id : '')); n = n.parentElement; } return a; })() })),
  modals: [...document.querySelectorAll('[role="dialog"], ytcp-uploads-dialog, tp-yt-paper-dialog')].slice(0, 5).map(d => ({ tag: d.tagName, class: d.className?.toString?.().slice?.(0, 60) })),
  allInputs: [...document.querySelectorAll('input')].slice(0, 8).map(i => ({ type: i.type, name: i.name, id: i.id })),
}))()`);
console.log(JSON.stringify(data, null, 2));
ws.close();
