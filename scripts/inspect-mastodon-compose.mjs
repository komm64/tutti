// Test Mastodon compose flow + inspect DOM
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222' });
const pages = await browser.pages();
let page = pages.find(p => /mastodon\.social/.test(p.url())) ?? pages[0];

await page.goto('https://mastodon.social/share?text=' + encodeURIComponent('Tutti test ' + Date.now()), { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 4000));

const info = await page.evaluate(() => {
  const composeForm = document.querySelector('.compose-form');
  const textarea = document.querySelector('textarea.autosuggest-textarea__textarea, .compose-form textarea');
  const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
  const submitBtn = document.querySelector('button.button[type="submit"], .compose-form button[type="submit"]');
  const allBtns = Array.from(document.querySelectorAll('button')).map(b => ({
    text: (b.textContent ?? '').trim().slice(0, 30),
    type: b.type,
    class: b.className?.slice(0, 80),
    disabled: b.disabled,
  })).filter(b => b.text.length > 0).slice(0, 15);
  return {
    url: location.href,
    composeFormExists: !!composeForm,
    textareaExists: !!textarea,
    textareaValue: textarea?.value?.slice(0, 100),
    fileInputCount: fileInputs.length,
    fileInputs: fileInputs.map(f => ({ accept: f.accept, multiple: f.multiple, ancestorClass: f.parentElement?.className })),
    submitBtn: submitBtn ? { text: submitBtn.textContent?.trim(), class: submitBtn.className } : null,
    allBtns,
    bodySnippet: document.body.innerText.slice(0, 300),
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: 'scripts/mastodon-compose.png' });

await browser.disconnect();
