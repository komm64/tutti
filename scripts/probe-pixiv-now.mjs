// 現在の Pixiv form state を細かく観察 (CDP-direct)。tag chip 検出 + Post button 状態。
import { WebSocket } from 'ws';

const r = await fetch('http://localhost:9222/json/list');
const tabs = await r.json();
const pixTab = tabs.find((t) => t.type === 'page' && /pixiv\.net\/illustration\/create/.test(t.url));
if (!pixTab) { console.log('no pixiv tab'); process.exit(1); }

const ws = new WebSocket(pixTab.webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id != null && pending.has(m.id)) {
    const { resolve } = pending.get(m.id);
    pending.delete(m.id);
    resolve(m.result);
  }
});
await new Promise((r) => ws.on('open', r));
function send(method, params = {}) {
  const i = ++id;
  return new Promise((resolve) => {
    pending.set(i, { resolve });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.value;
}

const state = await evalJs(`(() => {
  const get = (sel) => document.querySelector(sel);
  const all = (sel) => [...document.querySelectorAll(sel)];

  // tag chips をいろんな selector で探す
  const tagInputContainer = get('input[placeholder="Tags"]')?.closest('div')?.parentElement;
  const allLabels = all('*').filter(e => !e.children.length && e.textContent?.trim().length > 0 && e.textContent.trim().length < 30);

  return {
    url: location.href,
    title: get('input[name="title"]')?.value,
    captionLen: (get('textarea[name="comment"]')?.value ?? '').length,
    tagInputVal: get('input[placeholder="Tags"]')?.value,
    tagInputContainerHTML: tagInputContainer?.outerHTML?.slice(0, 600),
    // Post buttons
    postButtons: all('button').filter(b => /^Post$|^投稿$/i.test((b.textContent ?? '').trim())).map(b => ({
      text: (b.textContent ?? '').trim(),
      disabled: b.disabled,
      ariaDisabled: b.getAttribute('aria-disabled'),
      class: b.className?.toString?.().slice?.(0, 80),
      type: b.getAttribute('type'),
      rect: b.getBoundingClientRect ? (() => { const r = b.getBoundingClientRect(); return { top: Math.round(r.top), inViewport: r.top >= 0 && r.bottom <= innerHeight }; })() : null,
    })),
    // error / required hints
    requiredEls: all('*')
      .filter(e => !e.children.length && /Required|必須/i.test((e.textContent ?? '').trim()))
      .slice(0, 8)
      .map(e => ({
        text: (e.textContent ?? '').trim(),
        parentText: e.parentElement?.querySelector('span[width]')?.textContent?.trim().slice(0, 30) ?? e.parentElement?.textContent?.trim().slice(0, 80),
      })),
    errors: all('[class*="error" i], [aria-invalid="true"], [role="alert"]')
      .filter(e => (e.textContent ?? '').trim().length > 0)
      .slice(0, 5)
      .map(e => ({
        class: e.className?.toString?.().slice?.(0, 60),
        text: (e.textContent ?? '').trim().slice(0, 100),
      })),
    visibilityChecked: get('input[name="x_restrict"]:checked')?.value,
    aiTypeChecked: get('input[name="ai_type"]:checked')?.value,
    // form 全体の chip っぽいもの (li / span / div で 30 char 以下のもの)
    chipsLike: all('[role="presentation"], li, .tag, [class*="Tag" i], [class*="Chip" i]')
      .filter(e => (e.textContent ?? '').trim().length > 0 && (e.textContent ?? '').trim().length < 40)
      .slice(0, 10)
      .map(e => ({
        tag: e.tagName,
        class: e.className?.toString?.().slice?.(0, 60),
        text: (e.textContent ?? '').trim().slice(0, 30),
      })),
  };
})()`);
console.log(JSON.stringify(state, null, 2));
ws.close();
