export interface InteractionSnapshot {
  postedAt: number;
  url: string;
  textHead: string;
  counts?: {
    likes: number;
    replies: number;
    reposts: number;
  };
  lastChecked?: number;
  lastNotified?: {
    likes: number;
    replies: number;
    reposts: number;
  };
}

const INTERACTIONS_KEY = 'interactionSnapshots';

export async function getInteractionSnapshots(): Promise<
  Record<string, InteractionSnapshot>
> {
  const stored = await browser.storage.local.get(INTERACTIONS_KEY);
  return (
    stored[INTERACTIONS_KEY] as Record<string, InteractionSnapshot> | undefined
  ) ?? {};
}

export async function setInteractionSnapshots(
  snapshots: Record<string, InteractionSnapshot>,
): Promise<void> {
  await browser.storage.local.set({ [INTERACTIONS_KEY]: snapshots });
}

export async function pruneInteractionSnapshots(): Promise<void> {
  const retireAgeMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const snapshots = await getInteractionSnapshots();
  const next: Record<string, InteractionSnapshot> = {};
  for (const [key, snapshot] of Object.entries(snapshots)) {
    if (now - snapshot.postedAt < retireAgeMs) next[key] = snapshot;
  }
  await setInteractionSnapshots(next);
}
