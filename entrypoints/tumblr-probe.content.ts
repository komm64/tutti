/**
 * Tumblr の page world (= ページ自身の JS context) で動く content script。
 * window.tumblr / __APOLLO_STATE__ / __INITIAL_STATE__ / Redux store 等を
 * isolated world から見えないので、ここで読んで window.postMessage で渡す。
 *
 * MV3 の world: 'MAIN' を使う。CSP は拡張の content script には適用されないので
 * ページ側 CSP を回避できる。
 */

const PROBE_TAG = 'tutti-tumblr-probe-v1';

export default defineContentScript({
  matches: ['https://www.tumblr.com/*', 'https://tumblr.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    function safeJsonString(v: unknown, max = 800): string {
      try {
        const s = JSON.stringify(v);
        return s ? s.slice(0, max) : '';
      } catch {
        return '';
      }
    }

    // page globals だけを読む (cookie / Web Storage には触れない)。
    // 受け手は同一 window の ISOLATED world なので targetOrigin は自 origin に限定。
    function tick() {
      try {
        const w = window as unknown as Record<string, unknown>;
        window.postMessage(
          {
            source: PROBE_TAG,
            snapshot: {
              tumblr: safeJsonString(w['tumblr']),
              apolloState: safeJsonString(w['__APOLLO_STATE__'], 200),
              initialState: safeJsonString(w['__INITIAL_STATE__']),
            },
          },
          location.origin,
        );
      } catch {
        /* ignore */
      }
    }

    // 起動 → 1s 後 → 3s 後 → 6s 後 → 12s 後 → 24s 後 の 5 回
    setTimeout(tick, 1000);
    setTimeout(tick, 3000);
    setTimeout(tick, 6000);
    setTimeout(tick, 12000);
    setTimeout(tick, 24000);
  },
});
