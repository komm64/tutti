// DeviantArt の Submit form 状態を DevTools Console から取る。
// Pixiv 同様に「投稿を試して失敗した state」で実行すると、どの required field が
// 埋まってないかが分かる。
//
// 使い方:
//   1. DA で Tutti から投稿 → 失敗 (Submit が disabled なまま、or page リロード)
//   2. DevTools Console で `allow pasting` を入力 → このコード貼り付け → Enter
//   3. 出力 JSON を返す

JSON.stringify({
  // form state
  url: location.href,
  // textareas + inputs
  inputs: [...document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]')]
    .filter((el) => !!el.closest('[role="dialog"]'))
    .slice(0, 15)
    .map((el) => ({
      tag: el.tagName,
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      ariaLabel: el.getAttribute('aria-label'),
      placeholder: el.getAttribute('placeholder'),
      value: el.value ?? (el.textContent ?? '').slice(0, 60),
      hasValue: !!(el.value || (el.textContent ?? '').trim()),
    })),
  // radio / checkbox / select
  radios: [...document.querySelectorAll('[role="dialog"] input[type="radio"]')].map((r) => ({
    name: r.name, value: r.value, checked: r.checked,
    label: r.closest('label')?.textContent?.trim().slice(0, 40),
  })),
  checkboxes: [...document.querySelectorAll('[role="dialog"] input[type="checkbox"]')].map((c) => ({
    name: c.name, checked: c.checked,
    label: c.closest('label')?.textContent?.trim().slice(0, 40),
  })),
  selects: [...document.querySelectorAll('[role="dialog"] select, [role="dialog"] [role="combobox"]')]
    .slice(0, 6)
    .map((s) => ({
      role: s.getAttribute('role'),
      ariaLabel: s.getAttribute('aria-label'),
      value: s.value ?? null,
      text: (s.textContent ?? '').trim().slice(0, 60),
    })),
  // disabled な submit / next button
  buttons: [...document.querySelectorAll('[role="dialog"] button')]
    .filter((b) => /next|submit|publish|post|送信|公開|投稿/i.test(b.textContent ?? ''))
    .slice(0, 8)
    .map((b) => ({
      text: (b.textContent ?? '').trim().slice(0, 30),
      disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
    })),
  // required ラベル
  required: [...document.querySelectorAll('*')]
    .filter((e) => !e.children.length && /required|必須/i.test((e.textContent ?? '').trim()))
    .slice(0, 8)
    .map((e) => e.parentElement?.textContent?.trim().slice(0, 80)),
  // error messages (validation)
  errors: [...document.querySelectorAll('[class*="error" i], [role="alert"], [aria-invalid="true"]')]
    .filter((el) => (el.textContent ?? '').trim().length > 0)
    .slice(0, 8)
    .map((el) => ({
      class: el.className?.toString?.().slice?.(0, 60),
      text: (el.textContent ?? '').trim().slice(0, 100),
    })),
}, null, 2)
