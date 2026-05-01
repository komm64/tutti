// Pixiv compose ページの DevTools Console に貼り付けて実行する。
// 出力 (JSON) をまるごと Tutti の Claude Code に返してください。
//
// 取れるもの:
//   - "Visible to" と "AI-generated work" の HTML 構造 (parent 含む)
//   - 全 radio button の name/value/checked/label
//   - role=combobox / radiogroup な要素 (Pixiv の charcoal-button 系 dropdown)

JSON.stringify({
  visible: [...document.querySelectorAll('*')]
    .filter(e => !e.children.length && /Visible to|公開範囲/i.test(e.textContent.trim()))
    .slice(0, 3)
    .map(e => e.parentElement?.outerHTML?.slice(0, 500)),
  ai: [...document.querySelectorAll('*')]
    .filter(e => !e.children.length && /AI[- ]?generated|AI 生成/i.test(e.textContent.trim()))
    .slice(0, 3)
    .map(e => e.parentElement?.outerHTML?.slice(0, 500)),
  radios: [...document.querySelectorAll('input[type="radio"]')].map(r => ({
    name: r.name,
    value: r.value,
    checked: r.checked,
    aria: r.getAttribute('aria-label'),
    label: r.closest('label')?.textContent?.trim().slice(0, 50),
  })),
  combos: [...document.querySelectorAll('[role="combobox"],[role="radiogroup"]')]
    .slice(0, 10)
    .map(c => ({
      role: c.getAttribute('role'),
      aria: c.getAttribute('aria-label'),
      text: c.textContent.trim().slice(0, 80),
    })),
}, null, 2)
