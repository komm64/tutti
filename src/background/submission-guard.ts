import type {
  ImageAttachment,
  PlatformId,
  PostRequestIntent,
  PostResultMessage,
  SubmissionGuardDecision,
  SubmissionGuardReason,
} from '../messages';
import { getPostHistory, type HistoryEntry } from '../storage';
import { t } from '../utils/i18n';
import { computePostFingerprint } from './post-fingerprint';

export const RECENT_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export interface SubmissionGuardInput {
  requestId: string;
  intent: PostRequestIntent;
  text: string;
  platforms: readonly PlatformId[];
  images?: readonly ImageAttachment[];
  autoPost: boolean;
}

export interface SubmissionGuardPlatformDecision {
  platform: PlatformId;
  decision: SubmissionGuardDecision;
  reason?: SubmissionGuardReason;
}

export interface SubmissionGuardReservation {
  fingerprint?: string;
  decisions: SubmissionGuardPlatformDecision[];
  allowedPlatforms: PlatformId[];
  rejectedResults: PostResultMessage[];
  release: () => void;
}

export interface SubmissionGuardOptions {
  getHistory?: () => Promise<HistoryEntry[]>;
  computeFingerprint?: typeof computePostFingerprint;
  now?: () => number;
}

export function createSubmissionGuard(options: SubmissionGuardOptions = {}) {
  const readHistory = options.getHistory ?? getPostHistory;
  const fingerprintPost = options.computeFingerprint ?? computePostFingerprint;
  const now = options.now ?? Date.now;
  const inFlight = new Map<string, symbol>();

  async function reserve(input: SubmissionGuardInput): Promise<SubmissionGuardReservation> {
    const platforms = [...new Set(input.platforms)];
    if (!input.autoPost) {
      return buildReservation(
        input,
        platforms.map((platform) => ({ platform, decision: 'allow' })),
      );
    }

    let fingerprint: string;
    try {
      fingerprint = await fingerprintPost(input.text, input.images);
    } catch {
      return buildReservation(
        input,
        platforms.map((platform) => ({
          platform,
          decision: 'indeterminate',
          reason: 'fingerprint-unavailable',
        })),
      );
    }

    let history: HistoryEntry[] = [];
    if (input.intent !== 'new') {
      try {
        history = await readHistory();
      } catch {
        return buildReservation(
          input,
          platforms.map((platform) => ({
            platform,
            decision: 'indeterminate',
            reason: 'history-unavailable',
          })),
          fingerprint,
        );
      }
    }

    const owner = Symbol(input.requestId);
    const reservedKeys: string[] = [];
    const decisions = platforms.map((platform): SubmissionGuardPlatformDecision => {
      const key = reservationKey(fingerprint, platform);
      if (inFlight.has(key)) {
        return { platform, decision: 'blocked', reason: 'in-flight' };
      }

      if (input.intent !== 'new') {
        const recent = findRecentResult(history, fingerprint, platform, now());
        if (recent?.uncertain) {
          return { platform, decision: 'indeterminate', reason: 'recent-uncertain' };
        }
        if (recent?.success) {
          return { platform, decision: 'blocked', reason: 'recent-success' };
        }
      }

      inFlight.set(key, owner);
      reservedKeys.push(key);
      return { platform, decision: 'allow' };
    });

    return buildReservation(input, decisions, fingerprint, () => {
      for (const key of reservedKeys) {
        if (inFlight.get(key) === owner) inFlight.delete(key);
      }
    });
  }

  return { reserve };
}

function buildReservation(
  input: SubmissionGuardInput,
  decisions: SubmissionGuardPlatformDecision[],
  fingerprint?: string,
  release: () => void = () => {},
): SubmissionGuardReservation {
  return {
    fingerprint,
    decisions,
    allowedPlatforms: decisions
      .filter(({ decision }) => decision === 'allow')
      .map(({ platform }) => platform),
    rejectedResults: decisions
      .filter(({ decision }) => decision !== 'allow')
      .map((decision) => buildRejectedResult(input, decision)),
    release,
  };
}

function buildRejectedResult(
  input: SubmissionGuardInput,
  decision: SubmissionGuardPlatformDecision,
): PostResultMessage {
  const indeterminate = decision.decision === 'indeterminate';
  return {
    type: 'POST_RESULT',
    platform: decision.platform,
    success: false,
    uncertain: indeterminate || undefined,
    userAction: indeterminate ? 'check-post-before-retry' : undefined,
    submissionGuard: {
      decision: decision.decision,
      reason: decision.reason,
      requestId: input.requestId,
    },
    flow: {
      mode: 'post',
      submitReached: false,
      failedStep: 'submission-guard',
    },
    error: guardError(decision.reason),
  };
}

function guardError(reason?: SubmissionGuardReason): string {
  if (reason === 'recent-success') return t('retryDedupSkippedHint');
  if (reason === 'in-flight') return t('runtimeSubmissionAlreadyInFlight');
  return t('runtimeSubmissionGuardIndeterminate');
}

function findRecentResult(
  history: readonly HistoryEntry[],
  fingerprint: string,
  platform: PlatformId,
  now: number,
): HistoryEntry['results'][PlatformId] | undefined {
  const cutoff = now - RECENT_DUPLICATE_WINDOW_MS;
  for (const entry of history) {
    if (!entry.timestamp || entry.timestamp < cutoff) continue;
    if (entry.bodyHash !== fingerprint) continue;
    const result = entry.results?.[platform];
    if (result?.uncertain || result?.success) return result;
  }
  return undefined;
}

function reservationKey(fingerprint: string, platform: PlatformId): string {
  return `${fingerprint}:${platform}`;
}
