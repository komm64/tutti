import { describe, expect, it } from 'vitest';
import {
  buildCurrentDraftReportSection,
  buildErrorReportPayload,
  buildGitHubIssueUrl,
  formatLogExcerpt,
  mediaBytesForReport,
} from './error-report';

describe('mediaBytesForReport', () => {
  it('uses explicit bytes when available', () => {
    expect(mediaBytesForReport({ name: 'a.jpg', type: 'image/jpeg', bytes: 1536 })).toBe('1536 (2KB)');
  });

  it('falls back to base64 size', () => {
    expect(mediaBytesForReport({ name: 'a.bin', type: 'application/octet-stream', data: 'AA==' })).toBe('1 (0KB)');
  });

  it('reports unknown when no size source exists', () => {
    expect(mediaBytesForReport({ name: 'a.bin', type: 'application/octet-stream' })).toBe('unknown');
  });
});

describe('buildCurrentDraftReportSection', () => {
  it('summarizes selected platforms, chunks, and image metadata without content', () => {
    const section = buildCurrentDraftReportSection({
      text: 'hello '.repeat(60),
      platforms: [
        { id: 'x', limit: 280, available: true },
        { id: 'bluesky', limit: 300, available: true },
        { id: 'threads', limit: 500, available: false },
      ],
      selected: { x: true, bluesky: true, threads: true },
      images: [{ name: 'photo.jpg', type: 'image/jpeg', bytes: 2048 }],
      imageAlts: ['short alt'],
      cw: 'spoiler',
      visibility: 'public',
      trimToS: null,
    });

    expect(section).toContain('## Current draft (redacted)');
    expect(section).toContain('- Selected platforms: x, bluesky');
    expect(section).toContain('- Platform chunks: x:2, bluesky:2');
    expect(section).toContain('- Media: images=1, video=0');
    expect(section).toContain('- image[0]: type=image/jpeg, bytes=2048 (2KB), altLength=9');
    expect(section.join('\n')).not.toContain('hello');
  });

  it('summarizes video duration when present', () => {
    const section = buildCurrentDraftReportSection({
      text: '',
      platforms: [{ id: 'x', limit: 280, available: true }],
      selected: { x: true },
      images: [],
      video: { name: 'clip.mp4', type: 'video/mp4', bytes: 1024, durationS: 12.4 },
      cw: '',
      visibility: 'private',
      trimToS: 10,
    });

    expect(section).toContain('- Media: images=0, video=1');
    expect(section).toContain('- video[0]: type=video/mp4, bytes=1024 (1KB), durationS=12');
    expect(section).toContain('- Trim video to seconds: 10');
  });
});

describe('buildErrorReportPayload', () => {
  it('redacts public report fields and keeps diagnostics markers', () => {
    const payload = buildErrorReportPayload({
      errorText: 'Failed for alice@example.com and @alice',
      version: '0.5.21',
      userAgent: 'test-agent',
      draftSection: ['## Current draft (redacted)', '- Text length: 12'],
      logsExcerpt: 'user alice@example.com opened https://example.com/path?token=secret',
      diagnosticsJson: '{"detectedUser":"@alice"}',
    });

    expect(payload.title).not.toContain('alice@example.com');
    expect(payload.body).toContain('- Tutti version: 0.5.21');
    expect(payload.body).toContain('<!-- tutti-diagnostics-begin -->');
    expect(payload.body).not.toContain('alice@example.com');
    expect(payload.body).not.toContain('token=secret');
  });

  it('uses placeholder text when logs are empty', () => {
    const payload = buildErrorReportPayload({
      errorText: 'Failed',
      version: '0.5.21',
      userAgent: 'test-agent',
      draftSection: [],
    });

    expect(payload.body).toContain('(no logs captured)');
  });
});

describe('formatLogExcerpt', () => {
  it('formats log entries consistently', () => {
    expect(formatLogExcerpt([
      { ts: 0, level: 'INFO', context: 'popup', message: 'ready' },
    ])).toBe('[1970-01-01T00:00:00.000Z] INFO (popup) ready');
  });
});

describe('buildGitHubIssueUrl', () => {
  it('builds a prefilled issue URL and adds overflow note for long bodies', () => {
    const url = buildGitHubIssueUrl('Title here', 'x'.repeat(3001), 'paste the rest', 'overflow');
    const parsed = new URL(url);

    expect(parsed.hostname).toBe('github.com');
    expect(parsed.searchParams.get('title')).toBe('Title here');
    expect(parsed.searchParams.get('body')).toContain('paste the rest');
    expect(parsed.searchParams.get('body')).toContain('overflow');
  });
});
