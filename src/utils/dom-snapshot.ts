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
  // meta / link は selector 推定に無価値 + content 属性に動画タイトル / 概要 /
  // OG tags / canonical URL が入って大量にユーザの閲覧情報を leak する
  // (v0.4.32 → komm64/tutti#10 で実害発生)
  'meta', 'link', 'base', 'title', 'head',
]);

/**
 * 値を保持しても安全な data-* / 個別属性のホワイトリスト。selector 推定に
 * 必須なものだけ。それ以外の data-* / aria-* は値を `<v/>` に置換する
 * (例: data-video-id, data-channel-id, aria-label の長文 = user 入力混入リスク)。
 */
const SAFE_ATTR_VALUES = new Set([
  'class', 'id', 'role', 'type', 'name',
  'data-testid', 'data-test-id', 'data-cy', 'data-pressable-container',
  'aria-multiline', 'aria-checked', 'aria-expanded', 'aria-hidden',
  'contenteditable', 'spellcheck', 'multiple', 'disabled', 'readonly',
  'tabindex', 'draggable',
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
  // **deny-by-default**: SAFE_ATTR_VALUES に列挙した属性以外は値を redact する。
  // 旧コードは「危険そうなものを個別に潰す」allow-by-default だったため、
  // `<meta content>` `data-video-id` `data-thumbnail` 等の "知らなかった leak 経路"
  // を漏らしていた (komm64/tutti#10 で実害)。
  const attrs = Array.from(el.attributes);
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    const value = attr.value;

    // 1. URL 系 → origin のみ
    if (name === 'href' || name === 'src' || name === 'action' || name === 'formaction') {
      try {
        const u = new URL(value, location.href);
        el.setAttribute(attr.name, u.origin);
      } catch {
        el.setAttribute(attr.name, URL_PLACEHOLDER);
      }
      continue;
    }

    // 2. URL list / image refs → 削除
    if (name === 'srcset' || name === 'poster' || name === 'integrity' || name === 'nonce') {
      el.removeAttribute(attr.name);
      continue;
    }

    // 3. style: url(...) のみ潰す。残りの CSS は selector に有用なので残す
    if (name === 'style') {
      el.setAttribute('style', value.replace(/url\([^)]*\)/g, `url(${URL_PLACEHOLDER})`));
      continue;
    }

    // 4. value 属性: 常に潰す (input の中身は user data)
    if (name === 'value') {
      el.setAttribute(attr.name, VALUE_PLACEHOLDER);
      continue;
    }

    // 5. SAFE_ATTR_VALUES に居る属性は値もそのまま残す (selector key として必要)
    if (SAFE_ATTR_VALUES.has(name)) continue;

    // 6. それ以外の属性 (content, aria-label, alt, title, placeholder, data-*, etc.)
    //    値を `<v/>` に置換。属性キー自体は残す (= 「この要素には data-video-id 属性が
    //    存在する」という構造情報は AI に渡る、値そのものは渡らない)。
    //    短い (<= 30 char) selector hint 系 (例: aria-label="Post") は残したいので
    //    閾値で切る。30 char 超は user 入力色濃いと判断 (動画タイトル / description)。
    if (value.length <= 30) continue;
    el.setAttribute(attr.name, `<text len=${value.length}>`);
  }
}
