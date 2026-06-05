import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(process.env.E2E_CDP ?? 'http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => /x\.com|twitter\.com/.test(p.url()));
if (!page) page = await ctx.newPage();

const textBase = `Tutti probe ${Date.now()}`;
const variants = [
  'exec-only',
  'beforeinput-exec',
  'paste',
  'paste-exec',
  'paste-textcontent',
  'input-textcontent',
];

for (const variant of variants) {
  await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForSelector('[role="dialog"] [data-testid="tweetTextarea_0"]', { timeout: 60000 });
  await page.waitForTimeout(1000);
  const result = await page.evaluate(async ({ variant, text }) => {
    const el = document.querySelector('[role="dialog"] [data-testid="tweetTextarea_0"]');
    const button = () => document.querySelector('[role="dialog"] [data-testid="tweetButton"]');
    const selectAll = () => {
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    };
    selectAll();
    document.execCommand('delete', false);
    if (variant === 'exec-only') {
      document.execCommand('insertText', false, text);
    } else if (variant === 'beforeinput-exec') {
      el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    } else if (variant === 'paste') {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    } else if (variant === 'paste-exec') {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      document.execCommand('insertText', false, text);
    } else if (variant === 'paste-textcontent') {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    } else {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
    await new Promise((r) => setTimeout(r, 1500));
    const b = button();
    return {
      variant,
      text: el.textContent,
      innerText: el.innerText,
      disabled: b?.disabled,
      ariaDisabled: b?.getAttribute('aria-disabled'),
      buttonText: b?.textContent,
    };
  }, { variant, text: `${textBase} ${variant}` });
  console.log(JSON.stringify(result));
}

await browser.close();
