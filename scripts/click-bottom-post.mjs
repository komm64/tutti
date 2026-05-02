// 現在の Pixiv 画面で bottom Post button を直接 click して submit が走るか確認
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
  if (m.id != null && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
});
await new Promise((r) => ws.on('open', r));

async function evalJs(expr, awaitPromise = false) {
  const i = ++id;
  return new Promise((resolve) => {
    pending.set(i, { resolve });
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise } }));
  }).then((r) => r.result?.value);
}

// click the bottom Post (= non-header, enabled) and watch for navigation
const before = await evalJs(`location.href`);
console.log('before click URL:', before);

const clickResult = await evalJs(`(() => {
  const all = [...document.querySelectorAll('button')].filter((b) => /^Post$|^投稿$/i.test((b.textContent ?? '').trim()));
  const nonHeader = all.filter((b) => !b.className.includes('gtm-work-post-button-in-header-click'));
  const enabled = nonHeader.find((b) => !b.disabled);
  if (!enabled) return { err: 'no enabled non-header Post button' };
  // scroll into view first
  enabled.scrollIntoView({ block: 'center' });
  enabled.click();
  return { ok: true, class: enabled.className?.toString?.().slice?.(0, 80), rect: enabled.getBoundingClientRect ? (() => { const r = enabled.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })() : null };
})()`);
console.log('click result:', clickResult);

// 5 秒間 URL の変化を監視
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const url = await evalJs(`location.href`);
  const errors = await evalJs(`[...document.querySelectorAll('[role="alert"], [class*="error" i]')].filter(e => (e.textContent ?? '').trim().length > 0).slice(0, 3).map(e => (e.textContent ?? '').trim().slice(0, 100))`);
  console.log(`t+${i + 1}s url=${url} errors=${JSON.stringify(errors)}`);
  if (/\/artworks\//.test(url ?? '')) {
    console.log('🎉 redirected to /artworks/');
    break;
  }
}
ws.close();
