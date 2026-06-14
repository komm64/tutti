import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanGenericDescription,
  cleanInstagramDescription,
  cleanThreadsDescription,
  cleanXDescription,
  cleanYouTubeDescription,
  extractMetaContent,
  hasVideoEvidenceInHtml,
  verifyViaOg,
} from './post-verify-og';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extractMetaContent', () => {
  it('extracts property→content order', () => {
    const html = '<meta property="og:description" content="hello world">';
    expect(extractMetaContent(html, 'og:description')).toBe('hello world');
  });

  it('extracts content→property order', () => {
    const html = '<meta content="hello world" property="og:description">';
    expect(extractMetaContent(html, 'og:description')).toBe('hello world');
  });

  it('decodes HTML entities', () => {
    const html = '<meta property="og:description" content="A &amp; B &quot;X&quot;">';
    expect(extractMetaContent(html, 'og:description')).toBe('A & B "X"');
  });

  it('decodes numeric entities', () => {
    const html = '<meta property="og:description" content="&#x2615; &#9728;">';
    expect(extractMetaContent(html, 'og:description')).toBe('☕ ☀');
  });

  it('returns empty when not present', () => {
    expect(extractMetaContent('<html></html>', 'og:description')).toBe('');
  });

  it('matches name= attribute too', () => {
    const html = '<meta name="description" content="fallback">';
    expect(extractMetaContent(html, 'description')).toBe('fallback');
  });
});

describe('hasVideoEvidenceInHtml', () => {
  it('detects OpenGraph video metadata', () => {
    expect(hasVideoEvidenceInHtml('<meta property="og:video" content="https://cdn.example/video.mp4">')).toBe(true);
  });

  it('detects video tags', () => {
    expect(hasVideoEvidenceInHtml('<article><video src="clip.mp4"></video></article>')).toBe(true);
  });

  it('does not treat a plain image post as video', () => {
    expect(hasVideoEvidenceInHtml('<meta property="og:image" content="https://cdn.example/image.jpg">')).toBe(false);
  });
});

describe('verifyViaOg video evidence', () => {
  function stubFetchHtml(html: string): void {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => html,
    })));
  }

  it('passes video verification when OG video evidence exists', async () => {
    stubFetchHtml([
      '<meta property="og:description" content="Hello video">',
      '<meta property="og:video" content="https://cdn.example/video.mp4">',
    ].join(''));

    const result = await verifyViaOg('https://example.com/post/1', {
      text: 'Hello video',
      hasImages: false,
      hasVideo: true,
    });

    expect(result.issues).toEqual([]);
  });

  it('reports video-missing when expected video has no video evidence', async () => {
    stubFetchHtml([
      '<meta property="og:description" content="Hello video">',
      '<meta property="og:image" content="https://cdn.example/image.jpg">',
    ].join(''));

    const result = await verifyViaOg('https://example.com/post/1', {
      text: 'Hello video',
      hasImages: false,
      hasVideo: true,
    });

    expect(result.issues.some((issue) => issue.kind === 'video-missing' && issue.severity === 'error')).toBe(true);
  });
});

describe('cleanInstagramDescription', () => {
  it('extracts caption from quoted format', () => {
    const desc = '5 likes, 0 comments - user on May 22, 2026: "Hello world #cats". ';
    expect(cleanInstagramDescription(desc)).toBe('Hello world #cats');
  });

  it('handles smart quotes', () => {
    const desc = '0 likes - user on date: “Caption text”. ';
    expect(cleanInstagramDescription(desc)).toBe('Caption text');
  });

  it('returns empty when no quotes (= caption empty)', () => {
    const desc = '0 likes, 0 comments - user on May 22, 2026';
    expect(cleanInstagramDescription(desc)).toBe('');
  });
});

describe('cleanThreadsDescription', () => {
  it('extracts caption with quotes', () => {
    const desc = 'Threads from user (@handle): "Caption here"';
    expect(cleanThreadsDescription(desc)).toBe('Caption here');
  });

  it('falls back to after-colon', () => {
    const desc = 'Threads from user: just plain caption';
    expect(cleanThreadsDescription(desc)).toBe('just plain caption');
  });
});

describe('cleanXDescription', () => {
  it('strips surrounding quotes', () => {
    expect(cleanXDescription('"tweet body"')).toBe('tweet body');
  });

  it('preserves unquoted', () => {
    expect(cleanXDescription('tweet body')).toBe('tweet body');
  });
});

describe('cleanYouTubeDescription', () => {
  it('returns as-is', () => {
    expect(cleanYouTubeDescription('Video description')).toBe('Video description');
  });
});

describe('cleanGenericDescription', () => {
  it('strips "Posted by user:" prefix', () => {
    expect(cleanGenericDescription('Posted by alice: Hello world')).toBe('Hello world');
  });

  it('strips "By user:" prefix', () => {
    expect(cleanGenericDescription('By alice: caption text')).toBe('caption text');
  });

  it('strips "user posted to ...:"', () => {
    expect(cleanGenericDescription('alice posted to tumblr: hello')).toBe('hello');
  });
});
