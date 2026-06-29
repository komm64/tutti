/**
 * og:meta tag を使った post 後 verify (v0.4.76〜)。
 *
 * 8 SNS (X / IG / Threads / Tumblr / Pixiv / DA / TikTok / YouTube) 共通の
 * verify path。 各 SNS の post detail page には `<meta property="og:description">`
 * 等の OpenGraph meta tag が出ているので、 background から fetch + DOMParser で
 * 解析して caption / image の有無を確認する。
 *
 * 利点:
 *   - 新タブを開いて content script 経由で probe する必要なし (軽量)
 *   - SW 内で完結、 user の作業を邪魔しない
 *   - host_permissions で許可済の origin に対して fetch なので CORS なし
 *
 * 制約:
 *   - SNS が auth-required で HTML を返す場合は失敗 (login wall)。
 *     その場合は VerifyResult.verified=false で warn を立てる
 *   - og:description の format が SNS 別に異なる → textCleaner で吸収
 */

import { buildVerifyResult, verifyError, type VerifyExpectation, type VerifyResult } from './post-verify';
import { extractHttpUrls } from './text-urls';

/** 各 SNS の og:description format を caption text に正規化する optional cleaner */
export type DescriptionCleaner = (desc: string, html?: string) => string;

/** og:image を「実際の post 画像か placeholder か」 を識別する optional filter */
export type ImageJudge = (ogImage: string, html?: string) => boolean;

/**
 * MV3 SW では DOMParser が無いので regex で og:* meta tag を抽出する。
 * `<meta property="og:..." content="...">` の attribute 順は HTML 規格上 自由なので
 * `[name|property]="..."` + `content="..."` を逆順含めて 2 種 試す。
 */
export function extractMetaContent(html: string, propValue: string): string {
  // property → content の順
  const re1 = new RegExp(`<meta\\s+[^>]*?(?:property|name)=["']${propValue}["'][^>]*?\\scontent=["']([^"']*)["']`, 'i');
  const m1 = html.match(re1);
  if (m1?.[1]) return decodeHtmlEntities(m1[1]);
  // content → property の順
  const re2 = new RegExp(`<meta\\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']${propValue}["']`, 'i');
  const m2 = html.match(re2);
  if (m2?.[1]) return decodeHtmlEntities(m2[1]);
  return '';
}

export function hasVideoEvidenceInHtml(html: string): boolean {
  return !!(
    extractMetaContent(html, 'og:video') ||
    extractMetaContent(html, 'og:video:url') ||
    extractMetaContent(html, 'og:video:secure_url') ||
    extractMetaContent(html, 'twitter:player') ||
    /<meta\s+[^>]*?(?:property|name)=["']og:type["'][^>]*?content=["'][^"']*video/i.test(html) ||
    /<meta\s+[^>]*?content=["'][^"']*video[^"']*["'][^>]*?(?:property|name)=["']og:type["']/i.test(html) ||
    /<video\b/i.test(html)
  );
}

export function extractUrlEvidenceFromHtml(html: string, visibleText = ''): string[] {
  return extractHttpUrls(`${visibleText}\n${decodeHtmlEntities(html)}`);
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

export interface VerifyViaOgOptions {
  /** og:description を caption text に正規化する。 default: そのまま使う */
  cleanDescription?: DescriptionCleaner;
  /** og:image が「実 post image」 か判定。 default: og:image が存在すれば true */
  judgeImage?: ImageJudge;
  /** fetch UA を override (X 等 default UA が block されるとき) */
  userAgent?: string;
  /** fetch timeout (ms)、 default 15000 */
  timeoutMs?: number;
}

export async function verifyViaOg(
  postUrl: string,
  expected: VerifyExpectation,
  options: VerifyViaOgOptions = {},
): Promise<VerifyResult> {
  const { cleanDescription, judgeImage, userAgent, timeoutMs = 15000 } = options;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(postUrl, {
      credentials: 'omit',
      signal: controller.signal,
      ...(userAgent ? { headers: { 'User-Agent': userAgent } } : {}),
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return verifyError(`og verify: HTTP ${res.status} (${postUrl})`);
    const html = await res.text();

    // login wall 検出 (本文が極端に短い + login keyword)
    if (html.length < 500 && /log\s*in|sign\s*in|ログイン|登录/i.test(html)) {
      return verifyError('og verify: login wall (HTML が auth-required)');
    }

    // MV3 SW は DOMParser 無いので regex 抽出
    const ogDesc = extractMetaContent(html, 'og:description') ||
                   extractMetaContent(html, 'description');
    const ogImage = extractMetaContent(html, 'og:image');

    const text = cleanDescription ? cleanDescription(ogDesc, html) : ogDesc;
    const hasImages = judgeImage ? judgeImage(ogImage, html) : !!ogImage;
    const hasVideo = expected.hasVideo ? hasVideoEvidenceInHtml(html) : undefined;

    return buildVerifyResult(expected, {
      text,
      hasImages,
      hasVideo,
      links: expected.expectedUrls?.length ? extractUrlEvidenceFromHtml(html, text) : undefined,
    });
  } catch (e) {
    return verifyError(`og verify 例外: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── 各 SNS 固有の cleaner / judge ───────────────────────────────────────

/**
 * Instagram og:description: `"X likes, Y comments - <user> on <date>: \"<caption>\". "`
 * caption は二重引用符で囲まれてる (空 caption だと引用符が無い)。
 */
export const cleanInstagramDescription: DescriptionCleaner = (desc) => {
  // 様々な引用符パターン (smart quotes / Unicode quotes 含む)
  // Unicode escape で smart quotes を明示 (“, ”)
  const patterns = [
    /:\s*[“”]([^“”]*?)[“”]\s*\.?\s*$/, // smart quotes
    /:\s*"([^"]*?)"\s*\.?\s*$/,                                       // straight ASCII quotes
    /:\s*'([^']*?)'\s*\.?\s*$/,                                       // single quotes
  ];
  for (const p of patterns) {
    const m = desc.match(p);
    if (m) return m[1] ?? '';
  }
  // 引用符パターンに一致しないなら caption が空の可能性 → 空 string
  return '';
};

/**
 * Instagram og:image: post 画像なら https://scontent...、 デフォルトプロフィール
 * なら別 URL。 判定は「画像 URL が存在する + scontent / cdninstagram を含む」。
 */
export const judgeInstagramImage: ImageJudge = (ogImage) =>
  !!ogImage && /scontent|cdninstagram/i.test(ogImage);

/**
 * Threads (Meta 系): IG と同じ pattern + 改行を含む長いcaptionにも対応。
 * `Threads from <user> [date]: caption text...`
 */
export const cleanThreadsDescription: DescriptionCleaner = (desc) => {
  const m = desc.match(/:\s*"([^"]*?)"\s*\.?\s*$/);
  if (m) return m[1] ?? '';
  // colon の後の文字列を caption とみなす
  const m2 = desc.match(/:\s*(.+?)$/);
  return m2?.[1] ?? '';
};

/**
 * X / Twitter: og:description は tweet 本文そのまま (引用符なし)。 ただし
 * "ʼ" や絵文字 Unicode で normalize されていることがある。
 */
export const cleanXDescription: DescriptionCleaner = (desc) => {
  // X は "@user" の prefix 付きで desc を出すことがある
  return desc.replace(/^"|"$/g, '').trim();
};

/**
 * X / Twitter: og:image の判定。
 * - 空: 未認証 HTML や処理中は og:image が省略されることがある → 判定不能 → true (false positive 防止)
 * - pbs.twimg.com/media/... → ツイートのメディア画像 → true
 * - pbs.twimg.com/profile_images/... → プロフィール画像のみ (= メディアなし) → false
 * この judge は expected.hasImages=true のときのみ呼ばれる。
 */
export const judgeXImage: ImageJudge = (ogImage) => {
  if (!ogImage) return true; // 判定不能なので false positive を出さない
  return /pbs\.twimg\.com\/media\//i.test(ogImage);
};

/**
 * YouTube: og:description は description text の冒頭 (snippet)。
 */
export const cleanYouTubeDescription: DescriptionCleaner = (desc) => desc;

/**
 * Tumblr / DA / Pixiv / TikTok: 基本そのまま。 場合により caption prefix の
 * "By <user>:" や "Tumblr post by <user>:" を strip する程度。
 */
export const cleanGenericDescription: DescriptionCleaner = (desc) =>
  desc
    .replace(/^Posted\s+by\s+[^:]+:\s*/i, '')
    .replace(/^By\s+[^:]+:\s*/i, '')
    .replace(/^[^:]+ posted to .+?:\s*/i, '')
    .trim();
