import { describe, expect, it } from 'vitest';
import type { DiagnosePlatformResult } from '../messages';
import {
  redactDiagnosticPlatformResults,
  redactHistoryForDiagnostics,
  redactLastSeenUsers,
  shouldIncludeDiagnosticPlatformResult,
} from './diagnostics';

describe('shouldIncludeDiagnosticPlatformResult', () => {
  it('includes compose-like diagnostics with selector hits', () => {
    expect(shouldIncludeDiagnosticPlatformResult({
      platform: 'x',
      selectors: [{ name: 'textarea', selector: 'textarea', matchCount: 1, firstMatchPreview: '<textarea>' }],
      detectedUser: null,
    })).toBe(true);
  });

  it('includes diagnostics with a detected user', () => {
    expect(shouldIncludeDiagnosticPlatformResult({
      platform: 'x',
      selectors: [{ name: 'textarea', selector: 'textarea', matchCount: 0, firstMatchPreview: null }],
      detectedUser: '@alice',
    })).toBe(true);
  });

  it('excludes unrelated browsing pages with no selector hits and no user', () => {
    expect(shouldIncludeDiagnosticPlatformResult({
      platform: 'x',
      selectors: [{ name: 'textarea', selector: 'textarea', matchCount: 0, firstMatchPreview: null }],
      detectedUser: null,
    })).toBe(false);
  });

  it('includes requested platforms even with no selector hits', () => {
    expect(shouldIncludeDiagnosticPlatformResult({
      platform: 'bluesky',
      selectors: [{ name: 'textarea', selector: 'textarea', matchCount: 0, firstMatchPreview: null }],
      detectedUser: null,
    }, { requested: true })).toBe(true);
  });

  it('includes known compose URLs even with no selector hits', () => {
    expect(shouldIncludeDiagnosticPlatformResult({
      platform: 'threads',
      selectors: [{ name: 'textarea', selector: 'textarea', matchCount: 0, firstMatchPreview: null }],
      detectedUser: null,
    }, { tabUrl: 'https://www.threads.com/intent/post?text=hi' })).toBe(true);
  });
});

describe('diagnostic redaction helpers', () => {
  it('redacts last-seen users to presence flags', () => {
    expect(redactLastSeenUsers({ x: '@alice', bluesky: '', threads: null })).toEqual({
      x: '<present>',
    });
  });

  it('redacts history text, url, and errors while keeping status flags', () => {
    expect(redactHistoryForDiagnostics([{
      version: 1,
      id: 'entry1',
      textPreview: 'private text',
      text: 'private text full',
      platforms: ['x'],
      results: {
        x: {
          success: false,
          uncertain: true,
          url: 'https://x.com/alice/status/123',
          error: 'private error',
        },
      },
      hasMedia: true,
      timestamp: 123,
    }])).toEqual([{
      id: 'entry1',
      textPreview: '<redacted 12 chars>',
      platforms: ['x'],
      results: { x: { success: false, uncertain: true } },
      hasMedia: true,
      timestamp: 123,
    }]);
  });

  it('redacts detected users in platform diagnostics', () => {
    const result: DiagnosePlatformResult = {
      type: 'DIAGNOSE_PLATFORM_RESULT',
      platform: 'x',
      url: 'https://x.com/home',
      detectedUser: '@alice',
      selectors: [],
      domSnapshot: null,
    };

    expect(redactDiagnosticPlatformResults([result])[0]?.detectedUser).toBe('<present>');
  });
});
