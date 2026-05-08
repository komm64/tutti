/**
 * DOM snapshot for diagnostics — 障害報告に添付する「壊れてる時の DOM 構造」用。
 *
 * 設計目的:
 * - SNS の DOM 変更で selector が外れた時、AI が新 selector を提案できる
 *   ように **構造的なヒント (tag / class / id / aria-* / data-* / role)** を残す
 * - **ユーザーが書いた本文 / handle / image URL** は public Issue に流れる
 *   ので strip する (redactPII を popup 側で重ねがけする多重防御)
 *
 * 戦略:
 * - body をクローン → text node を `<t/>` 置換、value 属性を `<v/>` 置換
 * - href/src は origin+pathname のみ残す (query / fragment 落とす)
 * - srcset / data-image-* / style 内 url(...) は丸ごと redact
 * - <script>/<style>/<svg>/<path>/<img>/<video> 等の重い tag は丸ごと remove
 * - 最後に maxBytes で truncate (cap で打ち切り、`<!--truncated-->` 添付)
 */

const TEXT_PLACEHOLDER = '<t/>';
const VALUE_PLACEHOLDER = '<v/>';
const URL_PLACEHOLDER = '<u/>';

const REMOVE_TAGS = new Set([
  'script', 'style', 'noscript',
  'svg', 'path', 'symbol', 'use',
  'img', 'video', 'audio', 'source', 'picture', 'track',
  'iframe', 'canvas',
]);

/**
 * 現在の document.body の redacted snapshot を返す。
 * @param maxBytes 上限 byte 数。超過したら末尾で切って `<!--truncated-->` を付与
 */
export function snapshotDocument(maxBytes = 8000): string {
  if (!document.body) return '';
  const clone = document.body.cloneNode(true) as Element;
  redactInPlace(clone);
  let html = clone.outerHTML;
  if (html.length > maxBytes) {
    html = html.slice(0, maxBytes) + '<!--truncated-->';
  }
  return html;
}

function redactInPlace(root: Element): void {
  // mutation 中の treeWalker は不安定なので 1 度集めてから処理
  const elements: Element[] = [];
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let n: Node | null = walker.currentNode;
  while (n) {
    if (n.nodeType === Node.ELEMENT_NODE) elements.push(n as Element);
    else if (n.nodeType === Node.TEXT_NODE) textNodes.push(n as Text);
    n = walker.nextNode();
  }

  // text を placeholder 化 (whitespace のみは残す = 構造性のため)
  for (const t of textNodes) {
    const raw = t.textContent ?? '';
    if (raw.trim().length > 0) t.textContent = TEXT_PLACEHOLDER;
  }

  // 重い tag は丸ごと削除、残った要素は属性 redact
  for (const el of elements) {
    if (!el.isConnected && el !== root) continue;
    const tag = el.tagName.toLowerCase();
    if (REMOVE_TAGS.has(tag)) {
      el.remove();
      continue;
    }
    redactAttributes(el);
  }
}

function redactAttributes(el: Element): void {
  const attrs = Array.from(el.attributes);
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    if (name === 'value') {
      el.setAttribute(attr.name, VALUE_PLACEHOLDER);
    } else if (name === 'href' || name === 'src' || name === 'action' || name === 'formaction') {
      try {
        const u = new URL(value, location.href);
        // **privacy critical**: origin のみ。pathname も落とす。
        // 例: `/@channelname` `/watch?v=abc` `/u/komm64` 等の path は user 識別子
        // に直結するので残さない。AI 提案には origin だけあれば「どの host の元素か」
        // は判別可能。
        el.setAttribute(attr.name, u.origin);
      } catch {
        el.setAttribute(attr.name, URL_PLACEHOLDER);
      }
    } else if (name === 'srcset' || name === 'poster') {
      el.removeAttribute(attr.name);
    } else if (name === 'style') {
      el.setAttribute('style', value.replace(/url\([^)]*\)/g, `url(${URL_PLACEHOLDER})`));
    } else if (
      name === 'alt' ||
      name === 'title' ||
      name === 'placeholder'
    ) {
      // alt / title / placeholder は selector ヒント (framework 由来) と user 由来
      // が混ざる。framework 由来のものは AI に有用なので残すが、user の image alt は
      // 本人入力。ただし length が 60 越えはユーザ入力色濃いので redact する経験則。
      if (value.length > 60) {
        el.setAttribute(attr.name, `<text len=${value.length}>`);
      }
    }
    // aria-*, data-*, role, id, class, name, type は selector ヒントなので残す
  }
}
