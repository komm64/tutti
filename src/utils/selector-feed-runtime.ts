import { t } from './i18n';
import {
  SELECTOR_OVERRIDE_STORAGE_KEYS,
  type SelectorOverrides,
  type VideoConstraintsOverrides,
} from './selector-overrides';
import { validateSelectorFeed } from './selector-feed';

export type SelectorFeedDiagnosticReason =
  | 'applied'
  | 'applied-with-unknown-entries'
  | 'invalid-url'
  | 'http-error'
  | 'invalid-json'
  | 'unsupported-schema'
  | 'invalid-feed'
  | 'network-error'
  | 'storage-error';

export interface SelectorFeedDiagnostics {
  status: 'applied' | 'fallback';
  reason: SelectorFeedDiagnosticReason;
  checkedAt: number;
  schemaVersion?: number;
  httpStatus?: number;
  unknownEntries?: string[];
}

export interface FetchSelectorOverridesResult {
  ok: boolean;
  error?: string;
  count?: number;
  warnings?: string[];
}

/**
 * Fetches and atomically stores a remote selector feed.
 *
 * Fetch, schema, or known-value failures clear old remote caches so bundled
 * defaults win. Unknown schema-v1 entries remain additive: known entries are
 * applied and a PII-safe diagnostic warning is recorded.
 */
export async function fetchOverridesFrom(url: string): Promise<FetchSelectorOverridesResult> {
  if (!isHttpsUrl(url)) {
    return persistBundledFallback(
      'invalid-url',
      t('runtimeSelectorUrlHttpsRequired'),
    );
  }

  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    return persistBundledFallback('network-error', errorMessage(e));
  }
  if (!res.ok) {
    return persistBundledFallback('http-error', `HTTP ${res.status}`, {
      httpStatus: res.status,
    });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (e) {
    return persistBundledFallback('invalid-json', errorMessage(e));
  }

  const parsed = validateSelectorFeed(data, { unknownEntryPolicy: 'warn' });
  if (!parsed.ok) {
    const error = parsed.errors.length > 0
      ? parsed.errors.join('; ')
      : t('runtimeSelectorJsonObjectRequired');
    return persistBundledFallback(parsed.kind, error, {
      schemaVersion: readSchemaVersion(data),
    });
  }

  const diagnostics: SelectorFeedDiagnostics = {
    status: 'applied',
    reason: parsed.warnings.length > 0 ? 'applied-with-unknown-entries' : 'applied',
    checkedAt: Date.now(),
    schemaVersion: parsed.feed._meta.schemaVersion,
    ...(parsed.warnings.length > 0
      ? { unknownEntries: sanitizeDiagnosticWarnings(parsed.warnings) }
      : {}),
  };
  try {
    await browser.storage.local.set({
      [SELECTOR_OVERRIDE_STORAGE_KEYS.selectors]: parsed.selectors as SelectorOverrides,
      [SELECTOR_OVERRIDE_STORAGE_KEYS.fetchedAt]: diagnostics.checkedAt,
      [SELECTOR_OVERRIDE_STORAGE_KEYS.videoConstraints]:
        parsed.videoConstraints as VideoConstraintsOverrides,
      [SELECTOR_OVERRIDE_STORAGE_KEYS.diagnostics]: diagnostics,
    });
  } catch (e) {
    return persistBundledFallback(
      'storage-error',
      `selector feed storage failed: ${errorMessage(e)}`,
    );
  }

  return {
    ok: true,
    count: parsed.selectorCount,
    ...(diagnostics.unknownEntries ? { warnings: diagnostics.unknownEntries } : {}),
  };
}

export async function getSelectorFeedDiagnostics(): Promise<SelectorFeedDiagnostics | null> {
  const stored = await browser.storage.local.get(SELECTOR_OVERRIDE_STORAGE_KEYS.diagnostics);
  return normalizeDiagnostics(stored[SELECTOR_OVERRIDE_STORAGE_KEYS.diagnostics]);
}

async function persistBundledFallback(
  reason: Exclude<SelectorFeedDiagnosticReason, 'applied' | 'applied-with-unknown-entries'>,
  error: string,
  details: Pick<SelectorFeedDiagnostics, 'schemaVersion' | 'httpStatus'> = {},
): Promise<FetchSelectorOverridesResult> {
  const diagnostics: SelectorFeedDiagnostics = {
    status: 'fallback',
    reason,
    checkedAt: Date.now(),
    ...details,
  };
  try {
    await browser.storage.local.set({
      [SELECTOR_OVERRIDE_STORAGE_KEYS.selectors]: {},
      [SELECTOR_OVERRIDE_STORAGE_KEYS.fetchedAt]: null,
      [SELECTOR_OVERRIDE_STORAGE_KEYS.videoConstraints]: {},
      [SELECTOR_OVERRIDE_STORAGE_KEYS.diagnostics]: diagnostics,
    });
  } catch (e) {
    return {
      ok: false,
      error: `${error}; bundled fallback storage failed: ${errorMessage(e)}`,
    };
  }
  return { ok: false, error };
}

function readSchemaVersion(value: unknown): number | undefined {
  if (!isRecord(value) || !isRecord(value._meta)) return undefined;
  return typeof value._meta.schemaVersion === 'number'
    ? value._meta.schemaVersion
    : undefined;
}

function sanitizeDiagnosticWarnings(warnings: readonly string[]): string[] {
  return warnings.slice(0, 20).map((warning) => (
    warning.length <= 160 && /^[A-Za-z0-9_.: -]+$/.test(warning)
      ? warning
      : '<invalid feed entry>'
  ));
}

function normalizeDiagnostics(value: unknown): SelectorFeedDiagnostics | null {
  if (!isRecord(value)) return null;
  if (value.status !== 'applied' && value.status !== 'fallback') return null;
  if (
    typeof value.reason !== 'string'
    || !diagnosticReasons.has(value.reason as SelectorFeedDiagnosticReason)
  ) return null;
  if (typeof value.checkedAt !== 'number' || !Number.isFinite(value.checkedAt)) return null;

  return {
    status: value.status,
    reason: value.reason as SelectorFeedDiagnosticReason,
    checkedAt: value.checkedAt,
    ...(typeof value.schemaVersion === 'number' && Number.isFinite(value.schemaVersion)
      ? { schemaVersion: value.schemaVersion }
      : {}),
    ...(typeof value.httpStatus === 'number' && Number.isInteger(value.httpStatus)
      ? { httpStatus: value.httpStatus }
      : {}),
    ...(Array.isArray(value.unknownEntries)
      ? {
        unknownEntries: sanitizeDiagnosticWarnings(
          value.unknownEntries.filter((entry): entry is string => typeof entry === 'string'),
        ),
      }
      : {}),
  };
}

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const diagnosticReasons = new Set<SelectorFeedDiagnosticReason>([
  'applied',
  'applied-with-unknown-entries',
  'invalid-url',
  'http-error',
  'invalid-json',
  'unsupported-schema',
  'invalid-feed',
  'network-error',
  'storage-error',
]);
