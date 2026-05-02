/**
 * Selector replay test
 *
 * 各 SNS adapter の SELECTORS dict を、実機 DOM の縮小 fixture (tests/fixtures/<platform>.html)
 * にロードして happy-dom で query。1 つでもマッチしない selector があれば fail。
 *
 * これで catch できるもの:
 * - Claude (auto-triage) が壊した selector 文字列 (typo / quote escape ミス)
 * - 既存 selector が想定 fixture でマッチしない (fixture 更新漏れ含む)
 * - 新 SNS 追加時に SELECTORS だけ書いて fixture 忘れ
 *
 * Catch できないもの (= 段階 3 の領域):
 * - framework state (Draft.js / Lexical) の actual reaction
 * - 実機 SPA の async DOM mount / lazy load 挙動
 * - anti-bot / login-gated route の到達性
 *
 * fixture は **selector に対する独立な観測** として書きたい。
 * 現状は手書き合成 (= ある程度 tautological)。将来 auto-triage の DOM
 * snapshot を取り込む形に拡張すると、人間が編集しなくても fixture が更新される。
 */

import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { X_SELECTORS } from '../src/adapters/x';
import { BLUESKY_SELECTORS } from '../src/adapters/bluesky';
import { THREADS_SELECTORS } from '../src/adapters/threads';
import { MASTODON_SELECTORS } from '../src/adapters/mastodon';
import { MISSKEY_SELECTORS } from '../src/adapters/misskey';
import { TUMBLR_SELECTORS } from '../src/adapters/tumblr';
import { PIXIV_SELECTORS } from '../src/adapters/pixiv';
import { DEVIANTART_SELECTORS } from '../src/adapters/deviantart';
import { INSTAGRAM_SELECTORS } from '../src/adapters/instagram';
import { TIKTOK_SELECTORS } from '../src/adapters/tiktok';
import { YOUTUBE_SELECTORS } from '../src/adapters/youtube';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, 'fixtures');

interface PlatformCase {
  platform: string;
  selectors: Record<string, string>;
}

const cases: PlatformCase[] = [
  { platform: 'x', selectors: X_SELECTORS },
  { platform: 'bluesky', selectors: BLUESKY_SELECTORS },
  { platform: 'threads', selectors: THREADS_SELECTORS },
  { platform: 'mastodon', selectors: MASTODON_SELECTORS },
  { platform: 'misskey', selectors: MISSKEY_SELECTORS },
  { platform: 'tumblr', selectors: TUMBLR_SELECTORS },
  { platform: 'pixiv', selectors: PIXIV_SELECTORS },
  { platform: 'deviantart', selectors: DEVIANTART_SELECTORS },
  { platform: 'instagram', selectors: INSTAGRAM_SELECTORS },
  { platform: 'tiktok', selectors: TIKTOK_SELECTORS },
  { platform: 'youtube', selectors: YOUTUBE_SELECTORS },
];

function loadFixture(platform: string): string {
  return readFileSync(resolve(fixturesDir, `${platform}.html`), 'utf8');
}

/**
 * inject-helper の findEl と同じセマンティクス: カンマ区切り selector を左から
 * 順に試して最初にマッチした候補を返す。1 つでもマッチすれば成功とみなす。
 */
function selectorMatches(doc: Document, rawSelector: string): boolean {
  for (const part of rawSelector.split(',').map((s) => s.trim()).filter(Boolean)) {
    try {
      if (doc.querySelectorAll(part).length > 0) return true;
    } catch {
      // 不正な CSS syntax (= typo) は selector 自体の error
      return false;
    }
  }
  return false;
}

describe('selector replay (happy-dom + tests/fixtures)', () => {
  for (const { platform, selectors } of cases) {
    describe(platform, () => {
      const window = new Window();
      window.document.documentElement.innerHTML = loadFixture(platform);
      const doc = window.document as unknown as Document;

      for (const [name, sel] of Object.entries(selectors)) {
        it(`${name} がマッチする (selector: ${sel.length > 80 ? sel.slice(0, 80) + '…' : sel})`, () => {
          expect(
            selectorMatches(doc, sel),
            `${platform}.${name} が tests/fixtures/${platform}.html にマッチしない\n  selector: ${sel}`,
          ).toBe(true);
        });
      }
    });
  }
});
