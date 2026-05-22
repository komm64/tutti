import { describe, expect, it } from 'vitest';
import { redactPII } from './redact';

describe('redactPII', () => {
  describe('email', () => {
    it('redacts plain email', () => {
      expect(redactPII('contact me at alice@example.com please')).toContain('<email-redacted>');
      expect(redactPII('alice@example.com')).toMatch(/<email-redacted>|@<redacted>/);
    });

    it('redacts email with plus addressing', () => {
      const out = redactPII('alice+tag@example.com');
      expect(out).not.toContain('alice+tag@example.com');
    });

    it('redacts contact@komm64.com (publisher email memory case)', () => {
      const out = redactPII('please contact contact@komm64.com');
      expect(out).not.toContain('contact@komm64.com');
    });
  });

  describe('mention / handle', () => {
    it('redacts X-style @handle', () => {
      expect(redactPII('shout out to @alice for the help')).toContain('@<redacted>');
      expect(redactPII('shout out to @alice for the help')).not.toContain('@alice');
    });

    it('redacts Mastodon-style @user@instance.tld', () => {
      const out = redactPII('crossposted from @user@mastodon.social');
      expect(out).not.toContain('@user@mastodon.social');
      expect(out).toContain('@<redacted>');
    });

    it('redacts ren-fujimoto-style hyphenated handle (memory: screenshots_personal_handle_leak)', () => {
      const out = redactPII('logged in as @ren-fujimoto.bsky.social');
      expect(out).not.toContain('ren-fujimoto');
    });
  });

  describe('URL', () => {
    it('strips path from URL (memory: privacy_url_leak_incident_2026_05_08)', () => {
      const out = redactPII('check https://www.youtube.com/watch?v=dQw4w9WgXcQ now');
      expect(out).not.toContain('dQw4w9WgXcQ');
      expect(out).not.toContain('watch?v=');
      expect(out).toContain('https://www.youtube.com/<…>');
    });

    it('strips query + fragment', () => {
      const out = redactPII('see https://example.com/page?token=secret123&user=alice#section');
      expect(out).not.toContain('secret123');
      expect(out).not.toContain('alice');
      expect(out).not.toContain('section');
    });

    it('handles http (non-TLS)', () => {
      const out = redactPII('http://intranet.local/admin/users/42');
      expect(out).toContain('http://intranet.local/<…>');
      expect(out).not.toContain('/admin/users/42');
    });

    it('keeps host visible for context', () => {
      const out = redactPII('https://x.com/alice/status/12345');
      expect(out).toContain('x.com');
    });

    it('does not eat surrounding text', () => {
      const out = redactPII('Visit https://example.com/x for details about Y.');
      expect(out).toContain('Visit ');
      expect(out).toContain(' for details about Y.');
    });
  });

  describe('mixed content', () => {
    it('redacts all PII patterns in a single body', () => {
      const before = 'Posted by @alice (alice@example.com) at https://x.com/alice/status/123';
      const after = redactPII(before);
      expect(after).not.toContain('@alice');
      expect(after).not.toContain('alice@example.com');
      expect(after).not.toContain('/status/123');
    });

    it('preserves text with no PII verbatim', () => {
      const t = 'Tutti posted to the social feed. Caption worked.';
      expect(redactPII(t)).toBe(t);
    });
  });

  describe('no false-positives for natural language', () => {
    it("doesn't touch words without @ or scheme://", () => {
      expect(redactPII('caption test text here')).toBe('caption test text here');
    });

    it("doesn't strip price `$3` or similar tokens", () => {
      const t = 'Buy at $3 each — 25% off';
      expect(redactPII(t)).toBe(t);
    });
  });
});
