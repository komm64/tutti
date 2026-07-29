import type { LogLevel, PlatformId } from '../messages';
import type { PostingAlgorithm } from '../types/posting';
import { resolveTuttiLocale } from '../utils/i18n';

export type { PostingAlgorithm } from '../types/posting';

export interface Settings {
  mastodonInstance: string;
  misskeyInstance: string;
  /** false = compose preview only; true = real posting. */
  autoPost: boolean;
  selectorOverrideUrl: string;
  logLevel: LogLevel;
  disableReportDedup: boolean;
  autoOpenPostUrl: 'always' | 'on-issue' | 'never';
  postingAlgorithm: PostingAlgorithm;
  pixivVisibility: 'general' | 'r18' | 'r18g';
  pixivAiType: 'notAiGenerated' | 'aiGenerated';
  autoLetterboxVerticalVideo: boolean;
  snsPresets: Array<{ id: string; name: string; platforms: PlatformId[] }>;
  uiLanguage: string;
  displayMode: 'auto' | 'popup' | 'sidepanel' | 'floating';
  notifyInteractions: boolean;
  responsibleUseAcceptedVersion: number;
  responsibleUseAcceptedAt: number | null;
}

export const RESPONSIBLE_USE_ACK_VERSION = 1;
export const TERMS_URL = 'https://tutti.komm64.com/terms.html';

const DEFAULT_SETTINGS: Settings = {
  mastodonInstance: 'https://mastodon.social',
  misskeyInstance: 'https://misskey.io',
  autoPost: false,
  selectorOverrideUrl: 'https://tutti.komm64.com/selectors.json',
  logLevel: 'INFO',
  disableReportDedup: false,
  autoOpenPostUrl: 'always',
  postingAlgorithm: 'next',
  pixivVisibility: 'general',
  pixivAiType: 'notAiGenerated',
  autoLetterboxVerticalVideo: false,
  snsPresets: [],
  displayMode: 'auto',
  uiLanguage: 'auto',
  notifyInteractions: false,
  responsibleUseAcceptedVersion: 0,
  responsibleUseAcceptedAt: null,
};

function migrateSelectorOverrideUrl(url: string | undefined): string {
  if (!url) return url ?? '';
  if (
    /^https:\/\/komm64\.github\.io\/tutti\/selectors\.json(?:[?#].*)?$/.test(url) ||
    /^https:\/\/tutti-site\.pages\.dev\/selectors\.json(?:[?#].*)?$/.test(url)
  ) {
    return DEFAULT_SETTINGS.selectorOverrideUrl;
  }
  return url;
}

function resolvePostingAlgorithm(
  algorithm: unknown,
  temporaryXThreadMode: unknown,
): PostingAlgorithm {
  if (algorithm === 'legacy') return 'legacy';
  if (algorithm === 'next') return 'next';
  // v0.5.50 release candidateで一時的に保存したX限定設定を移行する。
  return temporaryXThreadMode === 'sequential' ? 'legacy' : 'next';
}

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get('settings');
  const raw = (
    stored['settings'] as Partial<Settings> & {
      dryRun?: boolean;
      xThreadPostingMode?: unknown;
    } | undefined
  ) ?? {};
  // Legacy `dryRun` had inverted semantics and is intentionally ignored.
  const {
    dryRun: _ignoredDryRun,
    xThreadPostingMode: temporaryXThreadMode,
    ...rest
  } = raw;
  void _ignoredDryRun;
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    selectorOverrideUrl: migrateSelectorOverrideUrl(
      rest.selectorOverrideUrl ?? DEFAULT_SETTINGS.selectorOverrideUrl,
    ),
    postingAlgorithm: resolvePostingAlgorithm(
      rest.postingAlgorithm,
      temporaryXThreadMode,
    ),
    uiLanguage: resolveTuttiLocale(rest.uiLanguage),
  };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await browser.storage.sync.set({
    settings: {
      ...current,
      ...settings,
      ...(settings.uiLanguage !== undefined
        ? { uiLanguage: resolveTuttiLocale(settings.uiLanguage) }
        : {}),
    },
  });
}
