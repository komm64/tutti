/**
 * post 後 verify framework (v0.4.75〜)。
 *
 * 「URL を取れた = 投稿 landing 成立」 ([[post_completion_means_url_captured]])
 * までは v0.4.65 で実装済。 これは更にその先、 「post detail page を fetch して
 * 本文 / 画像 / tag が期待通りに書き込まれたか」 を verify する仕組み。
 *
 * IG の caption silent strip のような「成功したが内容が消えてた」 事故を
 * 自動検知して popup に warning として通知する。
 */

import type { PlatformId } from '../messages';
import { t } from './i18n';
import { hasUrlEvidence } from './text-urls';

/** verify に期待する投稿内容 (Tutti が送ったもの) */
export interface VerifyExpectation {
  /** 本文 (caption / tweet 等)。 改行 / hashtag / mention の rendering 差異は許容 */
  text: string;
  /** 画像を添付したか */
  hasImages: boolean;
  /** 動画を添付したか */
  hasVideo?: boolean;
  /** 期待する tag (Pixiv / DA / YouTube / Tumblr 専用 tag field 用、 inline #word は対象外) */
  expectedTags?: string[];
  /** 期待する URL。本文 fuzzy match では落ちるため、URL は別に hard verify する。 */
  expectedUrls?: string[];
}

/** verify 結果 */
export interface VerifyResult {
  /** verify 自体が実行できたか (false: tab open 失敗 / API 失敗 etc) */
  verified: boolean;
  /** 検出された問題 (空なら問題なし) */
  issues: VerifyIssue[];
  /** 実際 post に書き込まれてた内容 (debug 用、 PII 含むので diagnostics 経路に流さない) */
  found?: {
    text?: string;
    hasImages?: boolean;
    hasVideo?: boolean;
    tags?: string[];
    links?: string[];
  };
}

export interface VerifyIssue {
  kind: 'caption-missing' | 'caption-mismatch' | 'image-missing' | 'video-missing' | 'tags-missing' | 'url-missing' | 'verify-error';
  message: string;
  /** soft (warn) / hard (error) */
  severity: 'warn' | 'error';
}

/**
 * caption text の fuzzy match。 SNS の render 結果は様々:
 * - X: `#word` が `<a>#word</a>` に、 改行 ↔ space、 URL 短縮、 emoji 変換
 * - Bluesky: facets で `#word` clickable、 改行維持
 * - IG: `#word` が hashtag link、 改行 維持、 caption に絵文字付き再現
 *
 * 「投稿側に十分な実体が残ってる」 か判定する loose check:
 * - 期待 text の **非空白 char 列** が found に **連続部分文字列** として残ってるか
 * - 短すぎる expect (< 4 char) は match を skip
 */
export function fuzzyContainsText(expected: string, found: string): boolean {
  if (!expected) return true;
  const norm = (s: string): string =>
    s.toLowerCase()
      // 英数 / 日本語 ひらがな カタカナ 漢字 のみ残す (記号 / 空白 / URL 構造 除去)
      .replace(/[^a-z0-9぀-ゟ゠-ヿ一-鿿]/g, '');
  const e = norm(expected);
  const f = norm(found);
  if (e.length < 4) return true;
  // expected を 8-char ずつ chunk して、 1 つでも found に含まれてれば OK と扱う。
  // SNS が URL を strip したり emoji を変換したりしても、 caption の連続 8 char が
  // 何処かに残ってれば「実体は post に入った」 と見なす。
  // 完全 silent strip (caption 全消失) のときだけ false を返す。
  const chunkSize = 8;
  for (let i = 0; i + chunkSize <= e.length; i += chunkSize) {
    if (f.includes(e.slice(i, i + chunkSize))) return true;
  }
  // 短い expected (< 8 char chunk × 1 個ぶん) の場合は単純に substring 判定
  if (e.length < chunkSize) return f.includes(e);
  return false;
}

/**
 * default の比較 logic。 per-SNS verify 関数の結果を VerifyResult に
 * 整形する helper。
 */
export function buildVerifyResult(
  expected: VerifyExpectation,
  found: VerifyResult['found'],
): VerifyResult {
  const issues: VerifyIssue[] = [];
  // 本文 verify
  if (expected.text) {
    if (!found?.text || found.text.trim().length === 0) {
      issues.push({
        kind: 'caption-missing',
        message: t('verifyIssueCaptionMissing'),
        severity: 'error',
      });
    } else if (!fuzzyContainsText(expected.text, found.text)) {
      issues.push({
        kind: 'caption-mismatch',
        message: t('verifyIssueCaptionMismatch', expected.text.length, found.text.length),
        severity: 'warn',
      });
    }
  }
  // 画像 verify
  if (expected.hasImages && found?.hasImages === false) {
    issues.push({
      kind: 'image-missing',
      message: t('verifyIssueImageMissing'),
      severity: 'error',
    });
  }
  if (expected.hasVideo && found?.hasVideo === false) {
    issues.push({
      kind: 'video-missing',
      message: 'Attached video was not found in the published post.',
      severity: 'error',
    });
  }
  // URL verify
  if (expected.expectedUrls && expected.expectedUrls.length > 0) {
    const missingUrls = expected.expectedUrls.filter((url) => !hasUrlEvidence(url, {
      text: found?.text,
      urls: found?.links,
    }));
    for (const url of missingUrls) {
      issues.push({
        kind: 'url-missing',
        message: `Expected URL was not found in the published post: ${url}`,
        severity: 'error',
      });
    }
  }
  // tag verify
  if (expected.expectedTags && expected.expectedTags.length > 0) {
    const foundTags = (found?.tags ?? []).map((t) => t.toLowerCase());
    const missing = expected.expectedTags.filter((t) => !foundTags.includes(t.toLowerCase()));
    if (missing.length > 0) {
      issues.push({
        kind: 'tags-missing',
        message: t('verifyIssueTagsMissing', missing.slice(0, 5).join(', ') + (missing.length > 5 ? '…' : '')),
        severity: 'warn',
      });
    }
  }
  return { verified: true, issues, found };
}

/** verify-error 専用の VerifyResult を作る (verify 自体が走らなかった場合) */
export function verifyError(reason: string): VerifyResult {
  return {
    verified: false,
    issues: [{ kind: 'verify-error', message: reason, severity: 'warn' }],
  };
}

/** verify 実装 registry を判定 (v0.4.76 で 11 SNS 全対応) */
export function isVerifySupported(platform: PlatformId): boolean {
  return [
    'bluesky', 'mastodon', 'misskey',  // public API
    'x', 'instagram', 'threads', 'tumblr', 'pixiv', 'deviantart', 'tiktok', 'youtube',  // og:meta
  ].includes(platform);
}
