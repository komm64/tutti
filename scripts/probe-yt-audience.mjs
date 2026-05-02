import { WebSocket } from 'ws';
const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const yt = tabs.find(t => t.type === 'page' && /studio\.youtube/.test(t.url));
const ws = new WebSocket(yt.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
const evalJs = expr => new Promise(resolve => { const i = ++id; pending.set(i, { resolve }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); }).then(r => r.result?.value);
const data = await evalJs(`(() => ({
  // audience radios (kids / not kids)
  audienceRadios: [...document.querySelectorAll('tp-yt-paper-radio-button, [role="radio"], input[type="radio"]')].slice(0, 20).map(r => ({ tag: r.tagName, name: r.getAttribute('name'), label: r.textContent?.trim().slice(0, 60), aria: r.getAttribute('aria-label'), checked: r.getAttribute('aria-checked') ?? r.checked, id: r.id })),
  // Made for kids text 周辺
  kidsLabels: [...document.querySelectorAll('*')].filter(e => !e.children.length && /made for kids|子供向け|kids/i.test((e.textContent ?? '').trim())).slice(0, 5).map(e => ({ text: (e.textContent ?? '').trim().slice(0, 80), parentTag: e.parentElement?.tagName })),
  // 全 ytcp components
  ytcpRadios: [...document.querySelectorAll('ytcp-form-radio-button, ytcp-form-input-container [role="radio"]')].slice(0, 10).map(r => ({ tag: r.tagName, label: r.textContent?.trim().slice(0, 60), checked: r.getAttribute('aria-checked'), name: r.getAttribute('name') })),
}))()`);
console.log(JSON.stringify(data, null, 2));
ws.close();
