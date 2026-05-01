// Pixiv form の "Visible to" + "AI-generated work" required 項目を probe する。
// すでに image + title が入った state (= user が手動で進めた直後) で実行する想定。
import puppeteer from 'puppeteer-core';
import { writeFileSync, appendFileSync } from 'fs';

const LOG = 'scripts/pixiv-required.log';
writeFileSync(LOG, `=== ${new Date().toISOString()} ===\n`);
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  appendFileSync(LOG, line + '\n');
  process.stdout.write(line + '\n');
};
process.on('uncaughtException', (e) => { log('UNCAUGHT', e.message); process.exit(1); });

log('connecting...');
const browser = await puppeteer.connect({ browserURL: 'http://localhost:9222', protocolTimeout: 240000 });
const pages = await browser.pages();
const page = pages.find((p) => /pixiv\.net\/illustration\/create/.test(p.url()));
if (!page) {
  log('no pixiv create page open. user の手動セッションのまま実行してください');
  process.exit(0);
}
log(`inspecting ${page.url()}`);

const data = await page.evaluate(() => {
  // "Visible to" 周辺: text node を含む要素から探索
  const allLabels = Array.from(document.querySelectorAll('*'));
  const findByText = (regex) =>
    allLabels.filter((el) => el.children.length === 0 && regex.test((el.textContent ?? '').trim()))
      .slice(0, 5)
      .map((el) => ({
        tag: el.tagName,
        text: (el.textContent ?? '').trim().slice(0, 40),
        parentTag: el.parentElement?.tagName,
        // 同じ親の next sibling 群に input/select/button があるか
        parentSiblingControls: (() => {
          const parent = el.parentElement;
          if (!parent) return [];
          const controls = parent.querySelectorAll('input, select, button, [role="radio"], [role="combobox"], [role="button"]');
          return Array.from(controls).slice(0, 6).map((c) => ({
            tag: c.tagName,
            type: c.getAttribute('type'),
            role: c.getAttribute('role'),
            name: c.getAttribute('name'),
            ariaLabel: c.getAttribute('aria-label'),
            text: (c.textContent ?? '').trim().slice(0, 30),
            checked: c.getAttribute('aria-checked') ?? (c.checked ?? null),
            disabled: c.disabled,
            class: c.className?.toString?.().slice?.(0, 50),
          }));
        })(),
      }));

  return {
    visibleTo: findByText(/^Visible to|^公開範囲/i),
    aiGenerated: findByText(/AI[- ]?generated|AI 生成|AI が生成/i),
    // radio inputs in form (Pixiv likely uses radios)
    radios: Array.from(document.querySelectorAll('input[type="radio"]')).slice(0, 20).map((r) => ({
      name: r.getAttribute('name'),
      value: r.getAttribute('value'),
      checked: r.checked,
      ariaLabel: r.getAttribute('aria-label'),
      // 親フィールドラベル
      labelText: (() => {
        const lbl = r.closest('label');
        if (lbl) return (lbl.textContent ?? '').trim().slice(0, 50);
        const fieldset = r.closest('fieldset, [role="radiogroup"]');
        return fieldset ? (fieldset.querySelector('legend')?.textContent ?? '').trim().slice(0, 50) : null;
      })(),
    })),
    // 全 button の Required 隣接 / disabled な submit 候補
    requiredLabels: Array.from(document.querySelectorAll('*'))
      .filter((el) => el.children.length === 0 && /Required|必須/i.test((el.textContent ?? '').trim()))
      .slice(0, 8)
      .map((el) => ({
        text: (el.textContent ?? '').trim(),
        parentText: el.parentElement?.textContent?.trim().slice(0, 80),
      })),
    // dropdown 系 ([role="combobox"], [role="listbox"], [role="menu"])
    comboboxes: Array.from(document.querySelectorAll('[role="combobox"], [role="listbox"]')).slice(0, 6).map((c) => ({
      role: c.getAttribute('role'),
      ariaLabel: c.getAttribute('aria-label'),
      ariaExpanded: c.getAttribute('aria-expanded'),
      text: (c.textContent ?? '').trim().slice(0, 50),
      class: c.className?.toString?.().slice?.(0, 50),
    })),
  };
});
log(JSON.stringify(data, null, 2));

await browser.disconnect();
log('done');
