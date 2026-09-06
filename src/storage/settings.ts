import type { LogLevel, PlatformId } from '../messages';
import { resolveTuttiLocale } from '../utils/i18n';

export interface Settings {
  mastodonInstance: string;
  misskeyInstance: string;
  /** false = compose preview only; true = real posting. */
  autoPost: boolean;
  selectorOverrideUrl: string;
  logLevel: LogLevel;
  disableReportDedup: boolean;
  autoOpenPostUrl: 'always' | 'on-issue' | 'never';
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

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get('settings');
  const raw = (
    stored['settings'] as Partial<Settings> & {
      dryRun?: boolean;
      xThreadPostingMode?: unknown;
      postingAlgorithm?: unknown;
    } | undefined
  ) ?? {};
  // Legacy `dryRun` had inverted semantics and is intentionally ignored.
  const {
    dryRun: _ignoredDryRun,
    xThreadPostingMode: _ignoredXThreadPostingMode,
    postingAlgorithm: _ignoredPostingAlgorithm,
    ...rest
  } = raw;
  void _ignoredDryRun;
  void _ignoredXThreadPostingMode;
  void _ignoredPostingAlgorithm;
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    selectorOverrideUrl: migrateSelectorOverrideUrl(
      rest.selectorOverrideUrl ?? DEFAULT_SETTINGS.selectorOverrideUrl,
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
