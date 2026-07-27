import type { PlatformId } from '../types/platform';

export type SelectedPlatforms = Partial<Record<PlatformId, boolean>>;

const SELECTED_PLATFORMS_KEY = 'selectedPlatforms';

export async function getSelectedPlatforms(): Promise<SelectedPlatforms | null> {
  const stored = await browser.storage.local.get(SELECTED_PLATFORMS_KEY);
  return (stored[SELECTED_PLATFORMS_KEY] as SelectedPlatforms | undefined) ?? null;
}

export async function saveSelectedPlatforms(
  selected: SelectedPlatforms,
): Promise<void> {
  await browser.storage.local.set({ [SELECTED_PLATFORMS_KEY]: selected });
}

export type LastSeenUsers = Partial<Record<PlatformId, string>>;

const LAST_SEEN_USERS_KEY = 'lastSeenUsers';

const RESERVED_BAD_USERNAMES = new Set([
  'account', 'アカウント', '账户', '계정',
  'channel', 'チャンネル', '频道', '채널',
  'profile', 'プロフィール', 'profil',
]);

export async function getLastSeenUsers(): Promise<LastSeenUsers> {
  const stored = await browser.storage.local.get(LAST_SEEN_USERS_KEY);
  const raw = (stored[LAST_SEEN_USERS_KEY] as LastSeenUsers | undefined) ?? {};
  const filtered: LastSeenUsers = {};
  let mutated = false;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' &&
        RESERVED_BAD_USERNAMES.has(value.trim().toLowerCase())) {
      mutated = true;
      continue;
    }
    (filtered as Record<string, string>)[key] = value as string;
  }
  if (mutated) {
    void browser.storage.local
      .set({ [LAST_SEEN_USERS_KEY]: filtered })
      .catch(() => {});
  }
  return filtered;
}

export async function setLastSeenUser(
  platform: PlatformId,
  username: string | null,
): Promise<void> {
  const current = await getLastSeenUsers();
  if (username === null || username === undefined || username === '') {
    if (!(platform in current)) return;
    const next = { ...current };
    delete next[platform];
    await browser.storage.local.set({ [LAST_SEEN_USERS_KEY]: next });
    return;
  }
  if (current[platform] === username) return;
  await browser.storage.local.set({
    [LAST_SEEN_USERS_KEY]: { ...current, [platform]: username },
  });
}
