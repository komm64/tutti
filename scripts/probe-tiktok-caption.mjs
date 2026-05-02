import { WebSocket } from 'ws';
const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const tt = tabs.find(t => t.type === 'page' && /tiktok\.com\/tiktokstudio/.test(t.url));
const ws = new WebSocket(tt.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
const evalJs = expr => new Promise(resolve => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); }).then(r => r.result?.value);
const data = await evalJs(`(() => ({
  url: location.href,
  // 全 contenteditable とその attribute
  editables: [...document.querySelectorAll('[contenteditable="true"]')].slice(0, 8).map(el => ({
    tag: el.tagName,
    id: el.id,
    aria: el.getAttribute('aria-label'),
    role: el.getAttribute('role'),
    placeholder: el.getAttribute('data-placeholder') ?? el.getAttribute('placeholder'),
    text: (el.textContent ?? '').slice(0, 60),
    class: el.className?.toString?.().slice?.(0, 80),
    parentClass: el.parentElement?.className?.toString?.().slice?.(0, 80),
    parentHtml: el.parentElement?.outerHTML?.slice(0, 250),
  })),
  // 全 textarea
  textareas: [...document.querySelectorAll('textarea')].slice(0, 5).map(t => ({ name: t.name, placeholder: t.placeholder, aria: t.getAttribute('aria-label'), value: t.value?.slice(0, 60) })),
  // div with role textbox
  textboxes: [...document.querySelectorAll('[role="textbox"]')].slice(0, 5).map(t => ({ tag: t.tagName, aria: t.getAttribute('aria-label'), text: (t.textContent ?? '').slice(0, 50) })),
}))()`);
console.log(JSON.stringify(data, null, 2));
ws.close();
