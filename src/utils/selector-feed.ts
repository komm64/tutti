import selectorWireContractV1 from '../adapters/selector-wire-contract-v1.json';

export const SELECTOR_FEED_SCHEMA_VERSION = 1;

export interface SelectorFeedMetaV1 {
  schemaVersion: 1;
  description: string;
  homepage: string;
}

export interface SelectorFeedV1 {
  _meta: SelectorFeedMetaV1;
  _videoConstraints?: Record<string, {
    maxBytes?: number;
    maxDurationS?: number;
  }>;
  [platform: string]: unknown;
}

export interface SelectorFeedValidationOptions {
  /**
   * Publish validation rejects unknown entries. Runtime parsing keeps schema-v1
   * additive by ignoring them while surfacing a diagnostic warning.
   */
  unknownEntryPolicy?: 'error' | 'warn';
}

export type SelectorFeedSelectorOverrides = Record<string, Record<string, string>>;
export type SelectorFeedVideoConstraints = Record<string, {
  maxBytes?: number;
  maxDurationS?: number;
}>;

export type SelectorFeedValidationResult =
  | {
    ok: true;
    feed: SelectorFeedV1;
    selectors: SelectorFeedSelectorOverrides;
    videoConstraints: SelectorFeedVideoConstraints;
    selectorCount: number;
    warnings: string[];
  }
  | {
    ok: false;
    kind: 'unsupported-schema' | 'invalid-feed';
    errors: string[];
  };

const selectorKeysByPlatform = new Map(
  Object.entries(selectorWireContractV1.platforms)
    .map(([platform, keys]) => [platform, new Set<string>(keys)] as const),
);
const videoConstraintKeys = new Set(['maxBytes', 'maxDurationS']);

export function validateSelectorFeed(
  value: unknown,
  options: SelectorFeedValidationOptions = {},
): SelectorFeedValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const unknownEntries = options.unknownEntryPolicy === 'warn' ? warnings : errors;
  if (!isRecord(value)) {
    return {
      ok: false,
      kind: 'invalid-feed',
      errors: ['feed must be a JSON object'],
    };
  }

  const unsupportedSchema = validateMetadata(value._meta, errors);
  const selectors: SelectorFeedSelectorOverrides = {};
  const videoConstraints: SelectorFeedVideoConstraints = {};
  let selectorCount = 0;

  for (const [platform, platformValue] of Object.entries(value)) {
    if (platform === '_meta') continue;
    if (platform === '_videoConstraints') {
      validateVideoConstraints(platformValue, videoConstraints, errors, unknownEntries);
      continue;
    }
    if (platform.startsWith('_')) {
      unknownEntries.push(`${platform}: unknown reserved namespace`);
      continue;
    }

    const allowedKeys = selectorKeysByPlatform.get(platform);
    if (!allowedKeys) {
      unknownEntries.push(`${platform}: unknown platform`);
      continue;
    }
    if (!isRecord(platformValue)) {
      errors.push(`${platform}: selector overrides must be an object`);
      continue;
    }
    for (const [key, selector] of Object.entries(platformValue)) {
      if (!allowedKeys.has(key)) {
        unknownEntries.push(`${platform}.${key}: unknown schema-v1 selector wire key`);
        continue;
      }
      if (typeof selector !== 'string' || selector.trim().length === 0) {
        errors.push(`${platform}.${key}: selector must be a non-empty string`);
        continue;
      }
      (selectors[platform] ??= {})[key] = selector;
      selectorCount += 1;
    }
  }

  return errors.length > 0
    ? {
      ok: false,
      kind: unsupportedSchema ? 'unsupported-schema' : 'invalid-feed',
      errors,
    }
    : {
      ok: true,
      feed: value as SelectorFeedV1,
      selectors,
      videoConstraints,
      selectorCount,
      warnings,
    };
}

function validateMetadata(value: unknown, errors: string[]): boolean {
  if (!isRecord(value)) {
    errors.push('_meta: required metadata object is missing');
    return false;
  }
  let unsupportedSchema = false;
  if (value.schemaVersion !== SELECTOR_FEED_SCHEMA_VERSION) {
    errors.push(
      `_meta.schemaVersion: unsupported schema ${JSON.stringify(value.schemaVersion)}; ` +
      `expected ${SELECTOR_FEED_SCHEMA_VERSION}`,
    );
    unsupportedSchema = Object.hasOwn(value, 'schemaVersion');
  }
  if (typeof value.description !== 'string' || value.description.trim().length === 0) {
    errors.push('_meta.description: required non-empty string is missing');
  }
  if (!isHttpsUrl(value.homepage)) {
    errors.push('_meta.homepage: required HTTPS URL is missing');
  }
  return unsupportedSchema;
}

function validateVideoConstraints(
  value: unknown,
  parsed: SelectorFeedVideoConstraints,
  errors: string[],
  unknownEntries: string[],
): void {
  if (!isRecord(value)) {
    errors.push('_videoConstraints: must be an object');
    return;
  }
  for (const [platform, constraints] of Object.entries(value)) {
    if (!selectorKeysByPlatform.has(platform)) {
      unknownEntries.push(`_videoConstraints.${platform}: unknown platform`);
      continue;
    }
    if (!isRecord(constraints)) {
      errors.push(`_videoConstraints.${platform}: constraints must be an object`);
      continue;
    }
    for (const [key, constraint] of Object.entries(constraints)) {
      if (!videoConstraintKeys.has(key)) {
        unknownEntries.push(`_videoConstraints.${platform}.${key}: unknown constraint`);
      } else if (
        typeof constraint !== 'number'
        || !Number.isFinite(constraint)
        || constraint <= 0
      ) {
        errors.push(`_videoConstraints.${platform}.${key}: must be a positive finite number`);
      } else {
        const platformConstraints = parsed[platform] ??= {};
        if (key === 'maxBytes') platformConstraints.maxBytes = constraint;
        if (key === 'maxDurationS') platformConstraints.maxDurationS = constraint;
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}
