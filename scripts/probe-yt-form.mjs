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
  url: location.href,
  // editable inputs (title / description)
  editables: [...document.querySelectorAll('[contenteditable="true"], textarea, input[type="text"]')].slice(0, 10).map(el => ({ tag: el.tagName, id: el.id, aria: el.getAttribute('aria-label'), placeholder: el.getAttribute('placeholder'), text: (el.textContent ?? el.value ?? '').slice(0, 50) })),
  // dialog content + headings
  dialogHeading: document.querySelector('[role="dialog"] h1, [role="dialog"] h2, ytcp-uploads-dialog h1, ytcp-video-metadata-editor h1')?.textContent?.trim().slice(0, 80),
  // wizard step indicators
  stepLabels: [...document.querySelectorAll('.label, [class*="step" i]')].slice(0, 6).map(s => (s.textContent ?? '').trim().slice(0, 40)),
  // buttons
  buttons: [...document.querySelectorAll('button, ytcp-button, [role="button"]')].filter(b => /next|publish|done|save|next step|done|公開|保存|次へ/i.test((b.textContent ?? '').trim())).slice(0, 15).map(b => ({ text: (b.textContent ?? '').trim().slice(0, 30), aria: b.getAttribute('aria-label'), id: b.id, disabled: b.disabled || b.getAttribute('aria-disabled') === 'true' })),
}))()`);
console.log(JSON.stringify(data, null, 2));
ws.close();
