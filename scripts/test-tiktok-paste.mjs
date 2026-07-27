import { listCdpTargets, RawCdpClient } from './e2e/cdp-harness.mjs';

const tabs = await listCdpTargets();
const tt = tabs.find(t => t.type === 'page' && /tiktok\.com\/tiktokstudio/.test(t.url));
if (!tt?.webSocketDebuggerUrl) throw new Error('TikTok Studio CDP target not found');
const cdp = await new RawCdpClient(tt.webSocketDebuggerUrl, { name: 'tiktok' }).connect();
const result = await cdp.evaluate(`(async () => {
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
cdp.close();
