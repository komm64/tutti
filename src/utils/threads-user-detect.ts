import { log } from './logger';

export function detectThreadsUserFromDocument(doc: Document = document): string | null {
  type Strategy = { name: string; fn: () => string | null };
  const RESERVED = new Set(['home', 'search', 'activity', 'login', 'signup', 'help', 'about', 'i']);

  const strategies: Strategy[] = [
    {
      name: 'aria-label*=Profile + /@',
      fn: () => {
        const a = doc.querySelector<HTMLAnchorElement>('a[aria-label*="Profile" i][href^="/@"]');
        return a?.getAttribute('href')?.match(/^\/@([^/?#]+)$/)?.[1] ?? null;
      },
    },
    {
      name: 'aria-label*=プロフィール + /@',
      fn: () => {
        const a = doc.querySelector<HTMLAnchorElement>('a[aria-label*="プロフィール"][href^="/@"]');
        return a?.getAttribute('href')?.match(/^\/@([^/?#]+)$/)?.[1] ?? null;
      },
    },
    {
      name: 'profile pic img -> ancestor anchor',
      fn: () => {
        const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>('img'));
        for (const img of imgs) {
          if (!/profile|avatar/i.test(img.src) && !/profile|avatar/i.test(img.alt ?? '')) continue;
          let el: HTMLElement | null = img;
          while (el && el.tagName !== 'A') el = el.parentElement;
          if (el && el.tagName === 'A') {
            const profileSignal = [
              el.getAttribute('aria-label') ?? '',
              el.textContent ?? '',
              img.alt ?? '',
            ].join(' ');
            if (!el.closest('nav, [role="navigation"], header, aside') && !/profile|プロフィール/i.test(profileSignal)) {
              continue;
            }
            const m = el.getAttribute('href')?.match(/^\/@([^/?#]+)$/);
            if (m?.[1] && !RESERVED.has(m[1])) return m[1];
          }
        }
        return null;
      },
    },
    {
      name: 'navigation /@ non-mention non-reserved',
      fn: () => {
        const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href^="/@"]'));
        const candidates: { username: string; weight: number }[] = [];
        for (const l of links) {
          const m = l.getAttribute('href')?.match(/^\/@([^/?#]+)$/);
          if (!m?.[1] || RESERVED.has(m[1])) continue;
          const text = l.textContent?.trim() ?? '';
          if (text.startsWith('@')) continue;

          const inNavigation = !!l.closest('nav, [role="navigation"], header, aside');
          if (!inNavigation) continue;

          let weight = 10;
          if (l.querySelector('img')) weight += 5;
          if (/profile|プロフィール/i.test(text) || /profile|プロフィール/i.test(l.getAttribute('aria-label') ?? '')) {
            weight += 10;
          }
          candidates.push({ username: m[1], weight });
        }
        candidates.sort((a, b) => b.weight - a.weight);
        return candidates[0]?.username ?? null;
      },
    },
    {
      name: 'inline JSON "username":"xxx"',
      fn: () => {
        const scripts = doc.querySelectorAll<HTMLScriptElement>('script');
        for (const s of scripts) {
          const t = s.textContent;
          if (!t || t.length < 100) continue;
          const counts = new Map<string, number>();
          const re = /"username"\s*:\s*"([\w.]+)"/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(t)) !== null) {
            counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
          }
          if (counts.size > 0) {
            const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
            const top = sorted[0];
            if (top?.[0]) return top[0];
          }
        }
        return null;
      },
    },
    {
      name: 'meta og:url',
      fn: () => {
        const m = doc
          .querySelector<HTMLMetaElement>('meta[property="og:url"]')
          ?.content?.match(/threads\.(?:net|com)\/@([^/?#]+)/);
        return m?.[1] ?? null;
      },
    },
  ];

  for (const s of strategies) {
    try {
      const r = s.fn();
      if (r) {
        log.info(`threads detection succeeded via "${s.name}"`);
        return '@' + r;
      }
    } catch (e) {
      log.warn(`threads strategy "${s.name}" threw:`, e);
    }
  }

  dumpThreadsUserDetectionDebug(doc);
  return null;
}

function dumpThreadsUserDetectionDebug(doc: Document): void {
  log.warn('threads: user detection failed. Debug info:');
  console.warn('  title =', doc.title);
  console.warn(
    '  metas =',
    Array.from(doc.querySelectorAll('meta'))
      .map((m) => ({
        name: m.getAttribute('name'),
        property: m.getAttribute('property'),
        content: m.getAttribute('content')?.slice(0, 80),
      }))
      .filter((m) => m.name || m.property),
  );
  console.warn(
    '  /@ anchors =',
    Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href^="/@"]'))
      .slice(0, 15)
      .map((a) => ({
        href: a.getAttribute('href'),
        text: a.textContent?.trim()?.slice(0, 40),
        ariaLabel: a.getAttribute('aria-label'),
        hasImg: !!a.querySelector('img'),
        inNav: !!a.closest('nav, [role="navigation"], header, aside'),
      })),
  );
  console.warn(
    '  aria-label profile elements =',
    Array.from(doc.querySelectorAll<HTMLElement>('[aria-label]'))
      .filter((el) => /profile|プロフィール/i.test(el.getAttribute('aria-label') ?? ''))
      .slice(0, 10)
      .map((el) => ({
        tag: el.tagName,
        ariaLabel: el.getAttribute('aria-label'),
        href: el.getAttribute('href'),
      })),
  );
}
