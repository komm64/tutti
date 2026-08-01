import { log } from './logger';

/**
 * Capture the URL of a newly published note from the current Misskey account.
 * Current Misskey exposes account notes through /api/users/notes; the removed
 * /api/i/notes route returns 404 on misskey.io.
 */
export async function fetchMisskeyRecentNoteUrl(
  text: string,
  minCreatedAt?: number,
): Promise<string | undefined> {
  try {
    let token: string | null = null;
    let userId: string | null = null;
    for (let i = 0; i < 5; i += 1) {
      const raw = localStorage.getItem('account');
      if (raw) {
        try {
          const data = JSON.parse(raw) as { token?: string; i?: string; id?: string };
          if ((data.token || data.i) && data.id) {
            token = data.token ?? data.i ?? null;
            userId = data.id;
            break;
          }
        } catch { /* ignore */ }
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!token || !userId) {
      log.warn('misskey: account token/id not in localStorage, skip URL capture');
      return undefined;
    }
    const target = text.replace(/\s+/g, ' ').trim().slice(0, 60);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
      const response = await fetch('/api/users/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ i: token, userId, limit: 10 }),
      });
      if (!response.ok) continue;
      const notes = (await response.json()) as Array<{
        id?: string;
        text?: string;
        createdAt?: string;
      }>;
      for (const note of notes) {
        const noteText = (note.text ?? '').replace(/\s+/g, ' ').trim();
        const createdAt = Date.parse(note.createdAt ?? '');
        const afterStart = !minCreatedAt ||
          (Number.isFinite(createdAt) && createdAt >= minCreatedAt - 5000);
        if (!note.id || !afterStart) continue;
        if (target ? noteText.startsWith(target) : true) {
          const url = `${location.origin}/notes/${note.id}`;
          log.info(`misskey: URL captured via API: ${url}`);
          return url;
        }
      }
    }
    log.warn('misskey: post URL not found in recent 10 notes');
  } catch (error) {
    log.warn(`misskey URL capture failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return undefined;
}
