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
    type Snapshot = {
      tag: string;
      tumblr: unknown;
      apolloState: unknown;
      initialState: unknown;
      windowKeys: string[];
      sessionStorageKeys: string[];
      sessionStorageHints: { key: string; preview: string }[];
      cookies: string[];
      indexedDBNames: string[];
    };

    function safeJsonString(v: unknown, max = 400): string {
      try {
        const s = JSON.stringify(v);
        return s ? s.slice(0, max) : '';
      } catch {
        return '';
      }
    }

    async function takeSnapshot(): Promise<Snapshot> {
      const w = window as unknown as Record<string, unknown>;

      // sessionStorage 全走査
      const ssKeys: string[] = [];
      const ssHints: { key: string; preview: string }[] = [];
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (!k) continue;
          ssKeys.push(k);
          const v = sessionStorage.getItem(k);
          if (v) ssHints.push({ key: k, preview: v.slice(0, 200) });
        }
      } catch { /* ignore */ }

      // cookies (httpOnly 以外のみ。username が含まれることはまれだが念のため)
      const cookies = document.cookie
        .split(';')
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
        .slice(0, 30);

      // IndexedDB の DB 名一覧
      let dbNames: string[] = [];
      try {
        if ('databases' in indexedDB) {
          const dbs = await indexedDB.databases();
          dbNames = dbs.map((d) => d.name ?? '(unnamed)').filter(Boolean);
        }
      } catch { /* ignore */ }

      return {
        tag: PROBE_TAG,
        tumblr: w['tumblr'],
        apolloState: w['__APOLLO_STATE__'],
        initialState: w['__INITIAL_STATE__'],
        windowKeys: Object.getOwnPropertyNames(w)
          .filter((k) => /tumblr|user|blog|init|apollo|state|auth|config|store|csrf/i.test(k))
          .slice(0, 40),
        sessionStorageKeys: ssKeys,
        sessionStorageHints: ssHints,
        cookies,
        indexedDBNames: dbNames,
      };
    }

    async function tick() {
      try {
        const snap = await takeSnapshot();
        // tumblr が object で、しかも user 情報があれば即時投げる
        // ない場合も毎回投げて isolated world に状況を伝える
        window.postMessage(
          {
            source: PROBE_TAG,
            snapshot: {
              tumblr: safeJsonString(snap.tumblr, 800),
              apolloState: safeJsonString(snap.apolloState, 200),
              initialState: safeJsonString(snap.initialState, 800),
              windowKeys: snap.windowKeys,
              sessionStorageKeys: snap.sessionStorageKeys,
              sessionStorageHints: snap.sessionStorageHints,
              cookies: snap.cookies,
              indexedDBNames: snap.indexedDBNames,
            },
          },
          '*',
        );
      } catch {
        /* ignore */
      }
    }

    // 起動 → 1s 後 → 3s 後 → 6s 後 → 12s 後 → 24s 後 の 5 回
    setTimeout(() => void tick(), 1000);
    setTimeout(() => void tick(), 3000);
    setTimeout(() => void tick(), 6000);
    setTimeout(() => void tick(), 12000);
    setTimeout(() => void tick(), 24000);
  },
});
