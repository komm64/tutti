import { describe, expect, it } from 'vitest';
import {
  SELECTOR_FEED_SCHEMA_VERSION,
  validateSelectorFeed,
} from './selector-feed';

const validMetadata = {
  schemaVersion: SELECTOR_FEED_SCHEMA_VERSION,
  description: 'Tutti selector feed',
  homepage: 'https://github.com/komm64/tutti',
};

describe('validateSelectorFeed', () => {
  it('accepts metadata-only feeds and additive known selector keys', () => {
    expect(validateSelectorFeed({ _meta: validMetadata })).toMatchObject({
      ok: true,
      selectorCount: 0,
    });
    expect(validateSelectorFeed({
      _meta: validMetadata,
      x: { textarea: '[data-testid="tweetTextarea_0"]' },
      _videoConstraints: {
        bluesky: { maxBytes: 200_000_000, maxDurationS: 180 },
      },
    })).toMatchObject({
      ok: true,
      selectorCount: 1,
    });
  });

  it('rejects unsupported schemas instead of partially applying them', () => {
    const result = validateSelectorFeed({
      _meta: { ...validMetadata, schemaVersion: 2 },
      x: { textarea: 'textarea' },
    });

    expect(result).toEqual({
      ok: false,
      kind: 'unsupported-schema',
      errors: ['_meta.schemaVersion: unsupported schema 2; expected 1'],
    });
  });

  it('requires complete, valid metadata', () => {
    const result = validateSelectorFeed({
      _meta: {
        schemaVersion: SELECTOR_FEED_SCHEMA_VERSION,
        description: ' ',
        homepage: 'https://',
      },
    });

    expect(result).toEqual({
      ok: false,
      kind: 'invalid-feed',
      errors: [
        '_meta.description: required non-empty string is missing',
        '_meta.homepage: required HTTPS URL is missing',
      ],
    });
  });

  it('rejects unknown platforms, wire keys, and reserved namespaces', () => {
    const result = validateSelectorFeed({
      _meta: validMetadata,
      unknownNetwork: { textarea: 'textarea' },
      x: { renamedTextarea: 'textarea' },
      _futureMetadata: {},
    });

    expect(result).toEqual({
      ok: false,
      kind: 'invalid-feed',
      errors: [
        'unknownNetwork: unknown platform',
        'x.renamedTextarea: unknown schema-v1 selector wire key',
        '_futureMetadata: unknown reserved namespace',
      ],
    });
  });

  it('keeps known entries and reports additive unknown entries in runtime mode', () => {
    const result = validateSelectorFeed({
      _meta: validMetadata,
      x: {
        textarea: 'textarea',
        futureSelector: '[data-future]',
      },
      futureNetwork: {
        textarea: 'textarea',
      },
      _futureMetadata: {},
      _videoConstraints: {
        bluesky: {
          maxBytes: 200_000_000,
          futureLimit: 1,
        },
      },
    }, { unknownEntryPolicy: 'warn' });

    expect(result).toEqual({
      ok: true,
      feed: {
        _meta: validMetadata,
        x: {
          textarea: 'textarea',
          futureSelector: '[data-future]',
        },
        futureNetwork: {
          textarea: 'textarea',
        },
        _futureMetadata: {},
        _videoConstraints: {
          bluesky: {
            maxBytes: 200_000_000,
            futureLimit: 1,
          },
        },
      },
      selectors: {
        x: { textarea: 'textarea' },
      },
      videoConstraints: {
        bluesky: { maxBytes: 200_000_000 },
      },
      selectorCount: 1,
      warnings: [
        'x.futureSelector: unknown schema-v1 selector wire key',
        'futureNetwork: unknown platform',
        '_futureMetadata: unknown reserved namespace',
        '_videoConstraints.bluesky.futureLimit: unknown constraint',
      ],
    });
  });

  it('rejects missing metadata, invalid selector values, and invalid constraints', () => {
    const result = validateSelectorFeed({
      x: { textarea: '', postButton: 42 },
      _videoConstraints: {
        bluesky: { maxBytes: -1, maxDurationS: Number.POSITIVE_INFINITY, typo: 1 },
        unknownNetwork: { maxBytes: 1 },
      },
    });

    expect(result).toEqual({
      ok: false,
      kind: 'invalid-feed',
      errors: [
        '_meta: required metadata object is missing',
        'x.textarea: selector must be a non-empty string',
        'x.postButton: selector must be a non-empty string',
        '_videoConstraints.bluesky.maxBytes: must be a positive finite number',
        '_videoConstraints.bluesky.maxDurationS: must be a positive finite number',
        '_videoConstraints.bluesky.typo: unknown constraint',
        '_videoConstraints.unknownNetwork: unknown platform',
      ],
    });
  });
});
