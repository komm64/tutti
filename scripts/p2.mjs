import { WebSocket } from 'ws';
const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const pix = tabs.find(t => t.type === 'page' && /pixiv\.net/.test(t.url));
const ws = new WebSocket(pix.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
const evalJs = expr => new Promise(resolve => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); }).then(r => r.result?.value);
const data = await evalJs(`(() => {
  const allRadios = [...document.querySelectorAll('input[type="radio"]')].map(r => ({ name: r.name, value: r.value, checked: r.checked }));
  const reqLabels = [...document.querySelectorAll('*')].filter(e => !e.children.length && /^Required$|^必須$/i.test((e.textContent ?? '').trim())).slice(0, 8).map(req => {
    let p = req;
    for (let i = 0; i < 6 && p; i++) {
      const sp = p.querySelector('span[required], span[width]');
      if (sp) return sp.textContent?.trim();
      p = p.parentElement;
    }
    return '?';
  });
  return { reqLabels, allRadios };
})()`);
console.log(JSON.stringify(data, null, 2));
ws.close();
