// Instagram の Caption screen state を DevTools から取る。
// Tutti で投稿を試して Share が disabled / 効かない時に実行する。
//
// 使い方:
//   1. IG で Tutti から投稿 → 失敗
//   2. DevTools Console で `allow pasting` 入力 → このコード貼り付け → Enter
//   3. 出力 JSON を返す

JSON.stringify({
  url: location.href,
  // dialog の見出し (Crop / Edit / Create new post 等で wizard 段階を識別)
  dialogHeading: document.querySelector('[role="dialog"] h1, [role="dialog"] h2, [role="dialog"] [role="heading"]')?.textContent?.trim().slice(0, 50) ?? null,
  // caption editor の値
  captionVal: document.querySelector('[role="dialog"] [contenteditable="true"]')?.textContent?.slice(0, 100) ?? null,
  // dialog 内の全 button (Share / Back / Next 等)
  dialogButtons: [...document.querySelectorAll('[role="dialog"] button, [role="dialog"] [role="button"]')]
    .slice(0, 15)
    .map((b) => ({
      text: (b.textContent ?? '').trim().slice(0, 30),
      aria: b.getAttribute('aria-label'),
      disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
    })),
  // dialog 内の input / select
  inputs: [...document.querySelectorAll('[role="dialog"] input, [role="dialog"] select')]
    .slice(0, 10)
    .map((el) => ({
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      ariaLabel: el.getAttribute('aria-label'),
      placeholder: el.getAttribute('placeholder'),
      value: el.value,
      checked: el.type === 'checkbox' || el.type === 'radio' ? el.checked : undefined,
    })),
  // 全 contenteditable (caption / aria-label が違う UI の検出)
  editables: [...document.querySelectorAll('[role="dialog"] [contenteditable="true"]')].map((el) => ({
    tag: el.tagName,
    aria: el.getAttribute('aria-label'),
    text: (el.textContent ?? '').slice(0, 60),
    children: el.children.length,
  })),
  // error / validation
  errors: [...document.querySelectorAll('[role="dialog"] [role="alert"], [role="dialog"] [class*="error" i]')]
    .filter((el) => (el.textContent ?? '').trim().length > 0)
    .slice(0, 5)
    .map((el) => (el.textContent ?? '').trim().slice(0, 100)),
}, null, 2)
