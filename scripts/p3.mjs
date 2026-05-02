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
  // Scheduled post の周辺 HTML
  const scheduled = [...document.querySelectorAll('span')].find(s => /Scheduled post|予約投稿/i.test(s.textContent ?? ''));
  if (!scheduled) return { err: 'no scheduled span found' };
  let p = scheduled;
  for (let i = 0; i < 6 && p; i++) p = p.parentElement;
  return {
    foundLabel: scheduled.textContent?.trim(),
    sectionHtml: p?.outerHTML?.slice(0, 1500),
    nearbyButtons: p ? [...p.querySelectorAll('button, [role="radio"], [role="combobox"], [role="button"]')].slice(0, 8).map(b => ({ tag: b.tagName, role: b.getAttribute('role'), text: (b.textContent ?? '').trim().slice(0, 40), aria: b.getAttribute('aria-label'), checked: b.getAttribute('aria-checked'), class: b.className?.toString?.().slice?.(0, 60) })) : [],
    nearbyRadios: p ? [...p.querySelectorAll('input[type="radio"]')].map(r => ({ name: r.name, value: r.value, checked: r.checked, label: r.closest('label')?.textContent?.trim().slice(0, 40) })) : [],
    nearbyCheckboxes: p ? [...p.querySelectorAll('input[type="checkbox"]')].map(c => ({ name: c.name, checked: c.checked, label: c.closest('label')?.textContent?.trim().slice(0, 40) })) : [],
  };
})()`);
console.log(JSON.stringify(data, null, 2));
ws.close();
