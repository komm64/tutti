export interface InPagePostUrlCaptureResult {
  url?: string;
  trace: string[];
}

export async function capturePostUrlInPage(
  platformName: string,
  targetText: string,
  expectedUserName: string | null,
  minCapturedAtValue: number | null,
): Promise<InPagePostUrlCaptureResult> {
  const trace: string[] = [];

  if (
    platformName === 'deviantart' &&
    /^\/[^/]+\/art\/[^/?#]+/.test(location.pathname)
  ) {
    return { url: location.href, trace };
  }
  if (
    platformName === 'pixiv' &&
    /\/artworks\/\d+/.test(location.pathname)
  ) {
    return { url: location.href, trace };
  }
  if (platformName === 'instagram') {
    trace.push(
      'instagram URL capture requires configure response; ' +
      'DOM first-link fallback disabled',
    );
  }
  if (platformName === 'tiktok') {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const link =
        document.querySelector<HTMLAnchorElement>('a[href*="/video/"]');
      if (link && /\/@[^/]+\/video\/\d+/.test(link.href)) {
        return { url: link.href, trace };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (platformName === 'x') {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let captured: { id?: string; capturedAt?: number } | undefined;
      try {
        captured = JSON.parse(
          localStorage.getItem('tutti:x-latest-post') ?? 'null',
        ) as typeof captured;
      } catch { /* ignore */ }
      const fresh = captured?.id && captured.capturedAt &&
        Date.now() - captured.capturedAt < 60_000;
      const afterStart = !minCapturedAtValue ||
        (captured?.capturedAt ?? 0) >= minCapturedAtValue;
      if (fresh && captured?.id) {
        const avatar = document.querySelector<HTMLElement>(
          '[data-testid="SideNav_AccountSwitcher_Button"] ' +
          '[data-testid^="UserAvatar-Container-"]',
        );
        const fromAvatar = avatar
          ?.getAttribute('data-testid')
          ?.match(/^UserAvatar-Container-(.+)$/)?.[1];
        const handle = expectedUserName?.replace(/^@/, '') || fromAvatar;
        if (handle && afterStart) {
          return {
            url: `https://x.com/${handle}/status/${captured.id}`,
            trace,
          };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (platformName === 'mastodon') {
    if (!targetText) return { trace };
    const initialState =
      document.querySelector<HTMLScriptElement>('script#initial-state');
    let token: string | undefined;
    let meId: string | undefined;
    try {
      const data = JSON.parse(initialState?.textContent ?? '{}') as {
        meta?: { access_token?: string; me?: string };
      };
      token = data.meta?.access_token;
      meId = data.meta?.me;
    } catch { /* ignore */ }
    trace.push(
      `initial-state: token=${token ? 'present' : 'missing'}, ` +
      `me=${meId ?? 'missing'}`,
    );
    if (!token || !meId) return { trace };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      trace.push(`attempt ${attempt}: statuses fetch`);
      const response = await fetch(
        `/api/v1/accounts/${meId}/statuses?limit=5` +
        '&exclude_replies=false&exclude_reblogs=true',
        { headers: { Authorization: `Bearer ${token}` } },
      );
      trace.push(`  status=${response.status}`);
      if (!response.ok) continue;
      const statuses = await response.json() as Array<{
        url?: string;
        content?: string;
      }>;
      trace.push(`  got ${statuses.length} statuses`);
      for (const status of statuses) {
        const element = document.createElement('div');
        element.innerHTML = status.content ?? '';
        const content = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
        trace.push(
          `  cmp "${content.slice(0, 30)}" vs ` +
          `"${targetText.slice(0, 30)}"`,
        );
        if (content.startsWith(targetText)) {
          return { url: status.url, trace };
        }
      }
    }
  }
  if (platformName === 'misskey') {
    const raw = localStorage.getItem('account');
    trace.push(`misskey account in localStorage: ${raw ? 'yes' : 'no'}`);
    if (!raw) return { trace };
    let token: string | undefined;
    let userId: string | undefined;
    try {
      const account = JSON.parse(raw) as {
        token?: string;
        i?: string;
        id?: string;
      };
      token = account.token ?? account.i;
      userId = account.id;
    } catch { /* ignore */ }
    trace.push(
      `token: ${token ? 'present' : 'missing'}, ` +
      `userId: ${userId ?? 'missing'}`,
    );
    if (!token || !userId) return { trace };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      const response = await fetch('/api/users/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ i: token, userId, limit: 5 }),
      });
      trace.push(`attempt ${attempt}: notes status=${response.status}`);
      if (!response.ok) continue;
      const notes = await response.json() as Array<{
        id?: string;
        text?: string;
        createdAt?: string;
      }>;
      trace.push(`  got ${notes.length} notes`);
      for (const note of notes) {
        const text = (note.text ?? '').replace(/\s+/g, ' ').trim();
        const createdAt = Date.parse(note.createdAt ?? '');
        const afterStart = !minCapturedAtValue ||
          (Number.isFinite(createdAt) && createdAt >= minCapturedAtValue - 5000);
        trace.push(
          `  cmp "${text.slice(0, 30)}" vs ` +
          `"${targetText.slice(0, 30)}" ` +
          `createdAt=${note.createdAt ?? 'missing'} afterStart=${afterStart}`,
        );
        if (!note.id || !afterStart) continue;
        if (targetText ? text.startsWith(targetText) : true) {
          return { url: `${location.origin}/notes/${note.id}`, trace };
        }
      }
    }
  }
  if (platformName === 'bluesky') {
    if (!targetText) return { trace };
    const raw = localStorage.getItem('BSKY_STORAGE');
    trace.push(`BSKY_STORAGE: ${raw ? 'present' : 'missing'}`);
    if (!raw) return { trace };
    let session: {
      accessJwt?: string;
      did?: string;
      handle?: string;
      service?: string;
    } | undefined;
    try {
      const data = JSON.parse(raw) as {
        session?: {
          currentAccount?: {
            accessJwt?: string;
            did?: string;
            handle?: string;
            service?: string;
          };
        };
      };
      session = data.session?.currentAccount;
    } catch { /* ignore */ }
    trace.push(
      `session: jwt=${session?.accessJwt ? 'present' : 'missing'} ` +
      `did=${session?.did} handle=${session?.handle}`,
    );
    if (!session?.accessJwt || !session.did || !session.handle) return { trace };
    const appview = 'https://public.api.bsky.app';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      const response = await fetch(
        `${appview}/xrpc/app.bsky.feed.getAuthorFeed?` +
        `actor=${encodeURIComponent(session.did)}&limit=5`,
      );
      trace.push(`attempt ${attempt}: feed status=${response.status}`);
      if (!response.ok) continue;
      const data = await response.json() as {
        feed?: Array<{
          post?: {
            uri?: string;
            record?: { text?: string };
          };
        }>;
      };
      for (const item of data.feed ?? []) {
        const text = (item.post?.record?.text ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        if (text.startsWith(targetText)) {
          const uri = item.post?.uri;
          const match = uri?.match(
            /\/app\.bsky\.feed\.post\/([a-zA-Z0-9]+)$/,
          );
          if (match) {
            return {
              url: `https://bsky.app/profile/${session.handle}/post/${match[1]}`,
              trace,
            };
          }
        }
      }
    }
  }
  return { trace };
}
