import { WebSocket } from 'ws';
const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const tt = tabs.find(t => t.type === 'page' && /tiktok\.com\/tiktokstudio/.test(t.url));
const ws = new WebSocket(tt.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
const evalJs = (expr, awaitPromise = true) => new Promise(resolve => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise } })); }).then(r => r.result?.value);
const result = await evalJs(`(async () => {
  const ed = document.querySelector('.public-DraftEditor-content[contenteditable="true"]');
  if (!ed) return { err: 'no editor' };
  const before = (ed.textContent ?? '').slice(0, 50);
  ed.focus();
  // Draft.js 用 paste event
  const dt = new DataTransfer();
  dt.setData('text/plain', 'TUTTI-DRAFT-PASTE-TEST 12345');
  const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
  ed.dispatchEvent(ev);
  await new Promise(r => setTimeout(r, 500));
  return { before, after: (ed.textContent ?? '').slice(0, 100) };
})()`);
console.log(result);
ws.close();
