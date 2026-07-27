import type { PlatformId, PostResultMessage } from '../messages';
import { deleteMediaRefs } from '../utils/history-media';

export interface HistoryPlatformResult {
  success: boolean;
  confirmed?: boolean;
  uncertain?: boolean;
  submissionGuard?: PostResultMessage['submissionGuard'];
  userAction?: PostResultMessage['userAction'];
  flow?: Pick<
    NonNullable<PostResultMessage['flow']>,
    'mode' | 'attempt' | 'lastCompletedStep' | 'failedStep' | 'submitReached'
  >;
  url?: string;
  error?: string;
  postId?: string;
}

export interface HistoryEntry {
  version?: 1;
  id: string;
  textPreview: string;
  text?: string;
  bodyHash?: string;
  platforms: PlatformId[];
  results: Partial<Record<PlatformId, HistoryPlatformResult>>;
  hasMedia: boolean;
  mediaRefs?: string[];
  timestamp: number;
}

const HISTORY_KEY = 'postHistory';
const MAX_HISTORY = 20;

export async function getPostHistory(): Promise<HistoryEntry[]> {
  const stored = await browser.storage.local.get(HISTORY_KEY);
  const raw = (stored[HISTORY_KEY] as unknown[] | undefined) ?? [];
  return raw.map((entry) => migrateHistoryEntry(entry));
}

function migrateHistoryEntry(raw: unknown): HistoryEntry {
  const entry = raw as HistoryEntry;
  const firstValue = entry.results ? Object.values(entry.results)[0] : undefined;
  if (typeof firstValue === 'boolean') {
    const old = entry.results as unknown as Partial<Record<PlatformId, boolean>>;
    const migrated: HistoryEntry['results'] = {};
    for (const [key, value] of Object.entries(old)) {
      if (typeof value === 'boolean') {
        migrated[key as PlatformId] = { success: value };
      }
    }
    return { ...entry, results: migrated };
  }
  return entry;
}

export async function clearPostHistory(): Promise<void> {
  const history = await getPostHistory();
  await browser.storage.local.remove(HISTORY_KEY);
  await deleteMediaRefs(history.flatMap((entry) => entry.mediaRefs ?? []));
}

export async function removeHistoryEntry(id: string): Promise<void> {
  const history = await getPostHistory();
  const removed = history.find((entry) => entry.id === id);
  const next = history.filter((entry) => entry.id !== id);
  await browser.storage.local.set({ [HISTORY_KEY]: next });
  await deleteMediaRefs(removed?.mediaRefs);
}

export async function addToPostHistory(
  text: string,
  results: PostResultMessage[],
  hasMedia: boolean,
  options: {
    bodyHash?: string;
    postIds?: Partial<Record<PlatformId, string>>;
    mediaRefs?: string[];
  } = {},
): Promise<string> {
  const id = Date.now().toString(36);
  const entry: HistoryEntry = {
    version: 1,
    id,
    textPreview: text.slice(0, 80),
    text,
    bodyHash: options.bodyHash,
    platforms: results.map((result) => result.platform),
    results: Object.fromEntries(
      results.map((result) => [
        result.platform,
        {
          success: result.success,
          confirmed: result.confirmed,
          uncertain: result.uncertain,
          submissionGuard: result.submissionGuard,
          userAction: result.userAction,
          flow: result.flow
            ? {
                mode: result.flow.mode,
                attempt: result.flow.attempt,
                lastCompletedStep: result.flow.lastCompletedStep,
                failedStep: result.flow.failedStep,
                submitReached: result.flow.submitReached,
              }
            : undefined,
          url: result.url,
          error: result.error,
          postId: options.postIds?.[result.platform],
        },
      ]),
    ),
    hasMedia,
    mediaRefs: options.mediaRefs && options.mediaRefs.length > 0
      ? options.mediaRefs
      : undefined,
    timestamp: Date.now(),
  };

  const history = await getPostHistory();
  const next = [entry, ...history].slice(0, MAX_HISTORY);
  await browser.storage.local.set({ [HISTORY_KEY]: next });
  const keptIds = new Set(next.map((item) => item.id));
  const droppedRefs = history
    .filter((item) => !keptIds.has(item.id))
    .flatMap((item) => item.mediaRefs ?? []);
  await deleteMediaRefs(droppedRefs);
  return id;
}
