// Pixiv form の 4 つの "Required" ラベルそれぞれの親要素を辿って、何が必須なのかを取る
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
    pending.get(m.id).resolve(m.result);
    pending.delete(m.id);
  }
});
await new Promise((r) => ws.on('open', r));

async function evalJs(expr) {
  const i = ++id;
  return new Promise((resolve) => {
    pending.set(i, { resolve });
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  }).then((r) => r.result?.value);
}

const data = await evalJs(`(() => {
  // Required ラベルの親を上に登って、関連する label / field を取る
  const reqs = [...document.querySelectorAll('*')]
    .filter((e) => !e.children.length && /^Required$|^必須$/i.test((e.textContent ?? '').trim()))
    .slice(0, 6)
    .map((req) => {
      // 上に登って span[width] (Pixiv の field label の特徴) を探す
      let p = req;
      let label = null;
      for (let i = 0; i < 6 && p; i++) {
        const candLabel = p.querySelector('span[required], span[width]');
        if (candLabel) { label = candLabel.textContent?.trim(); break; }
        p = p.parentElement;
      }
      // parentElement chain の outer HTML を取る (構造把握用)
      const parentHtml = req.parentElement?.parentElement?.outerHTML?.slice(0, 800) ?? null;
      // 同じ section 内にある input / radio の状態
      const section = (() => { let n = req; for (let i = 0; i < 10 && n; i++) { if (n.querySelector('input, textarea, [role="radiogroup"]')) return n; n = n.parentElement; } return null; })();
      const sectionInputs = section ? [...section.querySelectorAll('input, textarea')]
        .map((el) => ({
          tag: el.tagName,
          type: el.type,
          name: el.name,
          placeholder: el.placeholder,
          value: el.value?.slice(0, 30),
          checked: el.type === 'radio' || el.type === 'checkbox' ? el.checked : undefined,
        }))
        .slice(0, 8) : [];
      return { label, parentHtml: parentHtml?.slice(0, 400), sectionInputs };
    });

  // bottom Post button の周辺 (form の error message とかあるかも)
  const submitBtn = [...document.querySelectorAll('button')].find(b =>
    /^Post$|^投稿$/i.test((b.textContent ?? '').trim()) && b.disabled
  );
  const submitContext = submitBtn?.closest('form')?.outerHTML?.slice(-1500) ?? null;

  return { reqs, submitContextTail: submitContext };
})()`);

console.log(JSON.stringify(data, null, 2));
ws.close();
