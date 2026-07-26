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

export type SelectorFeedValidationResult =
  | {
    ok: true;
    feed: SelectorFeedV1;
    selectorCount: number;
  }
  | {
    ok: false;
    errors: string[];
  };

const selectorKeysByPlatform = new Map(
  Object.entries(selectorWireContractV1.platforms)
    .map(([platform, keys]) => [platform, new Set<string>(keys)] as const),
);
const videoConstraintKeys = new Set(['maxBytes', 'maxDurationS']);

export function validateSelectorFeed(value: unknown): SelectorFeedValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ['feed must be a JSON object'] };
  }

  validateMetadata(value._meta, errors);
  let selectorCount = 0;

  for (const [platform, platformValue] of Object.entries(value)) {
    if (platform === '_meta') continue;
    if (platform === '_videoConstraints') {
      validateVideoConstraints(platformValue, errors);
      continue;
    }
    if (platform.startsWith('_')) {
      errors.push(`${platform}: unknown reserved namespace`);
      continue;
    }

    const allowedKeys = selectorKeysByPlatform.get(platform);
    if (!allowedKeys) {
      errors.push(`${platform}: unknown platform`);
      continue;
    }
    if (!isRecord(platformValue)) {
      errors.push(`${platform}: selector overrides must be an object`);
      continue;
    }
    for (const [key, selector] of Object.entries(platformValue)) {
      if (!allowedKeys.has(key)) {
        errors.push(`${platform}.${key}: unknown schema-v1 selector wire key`);
        continue;
      }
      if (typeof selector !== 'string' || selector.trim().length === 0) {
        errors.push(`${platform}.${key}: selector must be a non-empty string`);
        continue;
      }
      selectorCount += 1;
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, feed: value as SelectorFeedV1, selectorCount };
}

function validateMetadata(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('_meta: required metadata object is missing');
    return;
  }
  if (value.schemaVersion !== SELECTOR_FEED_SCHEMA_VERSION) {
    errors.push(
      `_meta.schemaVersion: unsupported schema ${JSON.stringify(value.schemaVersion)}; ` +
      `expected ${SELECTOR_FEED_SCHEMA_VERSION}`,
    );
  }
  if (typeof value.description !== 'string' || value.description.trim().length === 0) {
    errors.push('_meta.description: required non-empty string is missing');
  }
  if (!isHttpsUrl(value.homepage)) {
    errors.push('_meta.homepage: required HTTPS URL is missing');
  }
}

function validateVideoConstraints(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('_videoConstraints: must be an object');
    return;
  }
  for (const [platform, constraints] of Object.entries(value)) {
    if (!selectorKeysByPlatform.has(platform)) {
      errors.push(`_videoConstraints.${platform}: unknown platform`);
      continue;
    }
    if (!isRecord(constraints)) {
      errors.push(`_videoConstraints.${platform}: constraints must be an object`);
      continue;
    }
    for (const [key, constraint] of Object.entries(constraints)) {
      if (!videoConstraintKeys.has(key)) {
        errors.push(`_videoConstraints.${platform}.${key}: unknown constraint`);
      } else if (
        typeof constraint !== 'number'
        || !Number.isFinite(constraint)
        || constraint <= 0
      ) {
        errors.push(`_videoConstraints.${platform}.${key}: must be a positive finite number`);
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
