/**
 * 全 SNS hosts で動く軽量 content script (v0.4.77〜)。
 *
 * 役割: background が「post URL を logged-in tab で開いた後」 に
 * VERIFY_POST_DOM message を投げると、 現在ページの `<meta property="og:*">`
 * + body excerpt を返す。 og:meta server-side fetch が login wall で
 * 失敗する SNS (X / IG / Threads 等) の DOM fallback。
 *
 * 既存の per-SNS content scripts (x.content.ts 等) は POST_TO_PLATFORM /
 * DIAGNOSE_PLATFORM 等を扱うが、 VERIFY_POST_DOM は SNS 共通の logic なので
 * 別 file で 1 つにまとめる (per-SNS に分散させる手間を避ける)。
 */

import type { Message } from '../src/messages';

export default defineContentScript({
  matches: [
    'https://x.com/*',
    'https://twitter.com/*',
    'https://bsky.app/*',
    'https://www.threads.com/*',
    'https://www.threads.net/*',
    'https://threads.net/*',
    'https://mastodon.social/*',
    'https://misskey.io/*',
    'https://www.tumblr.com/*',
    'https://tumblr.com/*',
    'https://www.pixiv.net/*',
    'https://pixiv.net/*',
    'https://www.deviantart.com/*',
    'https://deviantart.com/*',
    'https://www.instagram.com/*',
    'https://instagram.com/*',
    'https://www.tiktok.com/*',
    'https://tiktok.com/*',
    'https://*.youtube.com/*',
    'https://youtube.com/*',
  ],
  runAt: 'document_idle',
  main() {
    const isVisibleElement = (el: HTMLElement): boolean => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 4 &&
        rect.height > 4 &&
        el.getClientRects().length > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0';
    };

    const isAvatarishImage = (img: HTMLImageElement): boolean => {
      const text = [
        img.getAttribute('alt'),
        img.getAttribute('aria-label'),
        img.getAttribute('data-testid'),
        img.getAttribute('class'),
        img.getAttribute('src'),
      ].filter(Boolean).join(' ').toLowerCase();
      if (/profile|avatar|profile_pic|user avatar|プロフィール/.test(text)) return true;
      const rect = img.getBoundingClientRect();
      return !!img.closest('a[href*="/@"]') && rect.width <= 120 && rect.height <= 120;
    };

    const hasImageEvidence = (): boolean => {
      const scopes = Array.from(document.querySelectorAll<HTMLElement>('article, main, [role="main"]'));
      const searchRoots = scopes.length > 0 ? scopes : [document.body].filter(Boolean) as HTMLElement[];
      for (const scope of searchRoots) {
        const images = Array.from(scope.querySelectorAll<HTMLImageElement>('img'));
        if (images.some((img) => {
          if (!isVisibleElement(img) || isAvatarishImage(img)) return false;
          const rect = img.getBoundingClientRect();
          return rect.width >= 80 && rect.height >= 80;
        })) return true;
      }
      return false;
    };

    const hasVideoEvidence = (): boolean => {
      const videoMeta =
        document.querySelector<HTMLMetaElement>('meta[property="og:video"]')?.content ||
        document.querySelector<HTMLMetaElement>('meta[property="og:video:url"]')?.content ||
        document.querySelector<HTMLMetaElement>('meta[property="og:video:secure_url"]')?.content ||
        document.querySelector<HTMLMetaElement>('meta[name="twitter:player"]')?.content;
      if (videoMeta?.trim()) return true;
      if (document.querySelector('video')) return true;
      return !!document.querySelector('[data-testid*="video" i], [aria-label*="video" i]');
    };

    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'VERIFY_POST_DOM') return;
      const ogDescription =
        document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ??
        document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ??
        '';
      const ogImage =
        document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? '';
      // body excerpt: og:* が無いケースの最終 fallback (SNS UI が読み出せる範囲)
      const bodyExcerpt = (document.body?.innerText ?? '').slice(0, 2000);
      sendResponse({
        type: 'VERIFY_POST_DOM_RESULT',
        ogDescription,
        ogImage,
        hasImage: hasImageEvidence(),
        hasVideo: hasVideoEvidence(),
        bodyExcerpt,
      });
      return true;
    });
  },
});
