import type { Message, PlatformId, PostResultMessage } from '../messages';
import type { PostingRestoreState } from './types';

export type CompressionProgress = { stage: 'load' | 'transcode'; progress: number };

export interface BgStateResponse {
  compression?: CompressionProgress | null;
  posting?: boolean;
  postingState?: PostingRestoreState | null;
}

export interface PostingViewState {
  posting: boolean;
  pendingPlatforms: PlatformId[];
  lastResults: PostResultMessage[] | null;
  compressionProgress: CompressionProgress | null;
  compressionStartedAt: number | null;
  compressionEtaS: number | null;
}

export function mergePostingRestoreState(
  restore: PostingRestoreState,
  currentResults: readonly PostResultMessage[] | null,
): { pendingPlatforms: PlatformId[]; results: PostResultMessage[] } {
  const knownDone = new Set((currentResults ?? []).map((result) => result.platform));
  const pendingPlatforms = restore.pending.filter((platform) => !knownDone.has(platform));
  const results = [...restore.results];
  for (const result of currentResults ?? []) {
    const index = results.findIndex((item) => item.platform === result.platform);
    if (index === -1) results.push(result);
    else results[index] = result;
  }
  return { pendingPlatforms, results };
}

export function mergePlatformProgress(
  currentResults: readonly PostResultMessage[] | null,
  pendingPlatforms: readonly PlatformId[],
  result: PostResultMessage,
): { pendingPlatforms: PlatformId[]; results: PostResultMessage[] } {
  return {
    results: currentResults
      ? [...currentResults.filter((item) => item.platform !== result.platform), result]
      : [result],
    pendingPlatforms: pendingPlatforms.filter((platform) => platform !== result.platform),
  };
}

export function nextCompressionEta(
  message: CompressionProgress,
  currentStartedAt: number | null,
  now: number = Date.now(),
): { startedAt: number | null; etaS: number | null } {
  if (message.stage !== 'transcode') {
    return { startedAt: currentStartedAt, etaS: null };
  }
  if (message.progress > 0.05) {
    const startedAt = currentStartedAt ?? now;
    const elapsed = (now - startedAt) / 1000;
    const total = elapsed / message.progress;
    return { startedAt, etaS: Math.max(0, Math.round(total - elapsed)) };
  }
  return { startedAt: currentStartedAt ?? now, etaS: null };
}

export function applyBackgroundState(
  response: BgStateResponse | undefined,
  current: PostingViewState,
  now: number = Date.now(),
): PostingViewState {
  const next: PostingViewState = { ...current };
  if (response?.postingState) {
    if (response.posting) {
      const merged = mergePostingRestoreState(response.postingState, current.lastResults);
      next.posting = true;
      next.pendingPlatforms = merged.pendingPlatforms;
      next.lastResults = merged.results;
    } else if (response.postingState.done) {
      next.posting = false;
      next.pendingPlatforms = [];
      next.lastResults = response.postingState.results.slice();
    }
  } else if (response?.posting) {
    next.posting = true;
  }

  if (response?.compression) {
    next.compressionProgress = response.compression;
    if (response.compression.stage === 'transcode' && response.compression.progress > 0.05) {
      next.compressionStartedAt = now;
    }
  }
  return next;
}

export function applyProgressMessage(
  message: Message,
  current: PostingViewState,
  now: number = Date.now(),
): PostingViewState | null {
  if (message.type === 'PLATFORM_PROGRESS') {
    const merged = mergePlatformProgress(current.lastResults, current.pendingPlatforms, message.result);
    return {
      ...current,
      lastResults: merged.results,
      pendingPlatforms: merged.pendingPlatforms,
      compressionProgress: null,
    };
  }
  if (message.type === 'CONVERSION_PROGRESS') {
    const compressionProgress = { stage: message.stage ?? 'transcode', progress: message.progress };
    const eta = nextCompressionEta(compressionProgress, current.compressionStartedAt, now);
    return {
      ...current,
      compressionProgress,
      compressionStartedAt: eta.startedAt,
      compressionEtaS: eta.etaS,
    };
  }
  if (message.type === 'CONVERSION_COMPLETE' || message.type === 'CONVERSION_ERROR') {
    return {
      ...current,
      compressionProgress: null,
      compressionStartedAt: null,
      compressionEtaS: null,
    };
  }
  return null;
}
