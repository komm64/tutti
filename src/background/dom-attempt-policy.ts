import type { PlatformAdapter } from '../adapters/types';
import type { PostFlowTrace } from '../messages';
import { shouldForceInlineThreadPreviewForeground } from './platform-strategies';
import type { OpenOrFocusTabOptions } from './tab-management';

export interface DomPostAttempt {
  label: string;
  skipApi?: boolean;
  forceActive?: boolean;
  reuseExistingTab?: boolean;
  loadRetries?: number;
  delayBeforeMs?: number;
}

export function shouldRetryPostAttempt(
  autoPost: boolean,
  flow?: Pick<PostFlowTrace, 'submitReached'>,
): boolean {
  return !autoPost || flow?.submitReached !== true;
}

export function resolvePreSubmitLoadOptions(
  adapter: Pick<PlatformAdapter, 'preSubmitLoad'>,
): OpenOrFocusTabOptions | undefined {
  const policy = adapter.preSubmitLoad;
  if (!policy) return undefined;
  return {
    loadRetries: policy.retryCount,
    relaxedComposeUrlReady: policy.urlReady === 'same-origin-path',
  };
}

export function shouldOpenActive(
  adapter: PlatformAdapter,
  dryRun: boolean,
  textChunks?: string[],
  autoPost = !dryRun,
  forceForeground = false,
): boolean {
  if (forceForeground) return true;
  if (autoPost) return true;
  const forceForegroundForThreadPreview =
    shouldForceInlineThreadPreviewForeground(adapter.id, dryRun, textChunks);
  return adapter.requiresForegroundTab === true || forceForegroundForThreadPreview;
}

export function buildDomPostAttempts(
  adapter: PlatformAdapter,
  autoPost: boolean,
  forceForeground = false,
): DomPostAttempt[] {
  const dryRun = !autoPost;
  const attempts: DomPostAttempt[] = [
    forceForeground ? { label: 'default', forceActive: true } : { label: 'default' },
    {
      label: 'fresh foreground compose',
      skipApi: true,
      forceActive: true,
      reuseExistingTab: false,
      loadRetries: 1,
      delayBeforeMs: dryRun ? 250 : 750,
    },
  ];

  if (!adapter.requiresForegroundTab) {
    attempts.push({
      label: 'fresh foreground compose with reload retry',
      skipApi: true,
      forceActive: true,
      reuseExistingTab: false,
      loadRetries: 2,
      delayBeforeMs: 1000,
    });
  }

  return attempts;
}

export function shouldReuseExistingTabForAttempt(
  adapter: Pick<PlatformAdapter, 'requiresForegroundTab'>,
  autoPost: boolean,
  attempt: Pick<DomPostAttempt, 'reuseExistingTab'> = {},
  forceForeground = false,
): boolean {
  if (typeof attempt.reuseExistingTab === 'boolean') return attempt.reuseExistingTab;
  const dryRun = !autoPost;
  return dryRun && adapter.requiresForegroundTab !== true && !forceForeground;
}
