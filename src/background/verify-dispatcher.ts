/**
 * post URL → verify path 分岐 (v0.4.80〜、 元 background.ts から切り出し)。
 *
 * 経路:
 *   - Bluesky / Mastodon / Misskey: 公式 public API で post detail を fetch
 *   - X / IG / Threads / Tumblr / Pixiv / DA / TikTok / YouTube: HTML を fetch
 *     して og:description + og:image meta tag から本文 / 画像有無を抽出
 *   - og fetch が login wall で失敗した場合は logged-in tab を開いて
 *     content script (verify-helper) 経由で og:* を再取得
 *
 * verify 失敗時は VerifyResult.verified=false で warn を立てる (best-effort)。
 */

import type { PlatformId } from '../messages';
import { verifyBlueskyPost } from '../api/bluesky-verify';
import { verifyMastodonPost } from '../api/mastodon-verify';
import { verifyMisskeyPost } from '../api/misskey-verify';
import {
  verifyViaOg,
  cleanInstagramDescription,
  cleanThreadsDescription,
  cleanXDescription,
  cleanYouTubeDescription,
  cleanGenericDescription,
  judgeInstagramImage,
} from '../utils/post-verify-og';
import { buildVerifyResult, type VerifyExpectation, type VerifyResult } from '../utils/post-verify';
import { log } from '../utils/logger';

export async function runVerify(
  platform: PlatformId,
  postUrl: string,
  expected: VerifyExpectation,
): Promise<VerifyResult> {
  if (platform === 'bluesky') return verifyBlueskyPost(postUrl, expected);
  if (platform === 'mastodon') return verifyMastodonPost(postUrl, expected);
  if (platform === 'misskey') return verifyMisskeyPost(postUrl, expected);

  // og:meta tag verify (8 SNS 共通) — まず server-side fetch で試す
  const cleaner =
    platform === 'instagram' ? cleanInstagramDescription :
    platform === 'threads' ? cleanThreadsDescription :
    platform === 'x' ? cleanXDescription :
    platform === 'youtube' ? cleanYouTubeDescription :
    cleanGenericDescription;
  const judgeImg = platform === 'instagram' ? judgeInstagramImage : undefined;
  const r1 = await verifyViaOg(postUrl, expected, { cleanDescription: cleaner, judgeImage: judgeImg });
  if (r1.verified) return r1;

  // server-side fetch が失敗 (login wall / HTTP err) → DOM fallback
  log.info(`${platform}: og fetch 失敗、 DOM verify に fallback`);
  return await verifyViaDomTab(postUrl, expected, cleaner, judgeImg);
}

/**
 * post URL を新タブで開いて、 verify-helper content script から og:* を read back。
 * tab は active=false で開いて user の作業を邪魔しない。 verify 完了後に close。
 */
async function verifyViaDomTab(
  postUrl: string,
  expected: VerifyExpectation,
  cleaner: (s: string) => string,
  judgeImg: ((og: string) => boolean) | undefined,
): Promise<VerifyResult> {
  let verifyTab: Browser.tabs.Tab | undefined;
  try {
    verifyTab = await browser.tabs.create({ url: postUrl, active: false });
    if (typeof verifyTab.id !== 'number') {
      return { verified: false, issues: [{ kind: 'verify-error', message: 'verify tab open 失敗', severity: 'warn' }] };
    }
    // tab load + content script ready を待つ (最大 15s polling)
    const tabId = verifyTab.id;
    const deadline = Date.now() + 15000;
    let resp: { type?: string; ogDescription?: string; ogImage?: string; bodyExcerpt?: string } | undefined;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 700));
      try {
        resp = await browser.tabs.sendMessage(tabId, { type: 'VERIFY_POST_DOM' }) as typeof resp;
        if (resp?.type === 'VERIFY_POST_DOM_RESULT') break;
      } catch { /* content script not ready yet */ }
    }
    if (!resp || resp.type !== 'VERIFY_POST_DOM_RESULT') {
      return { verified: false, issues: [{ kind: 'verify-error', message: 'verify tab content script 未応答', severity: 'warn' }] };
    }
    const desc = resp.ogDescription ?? '';
    const img = resp.ogImage ?? '';
    const text = cleaner(desc) || (resp.bodyExcerpt ?? '');
    const hasImages = judgeImg ? judgeImg(img) : !!img;
    return buildVerifyResult(expected, { text, hasImages });
  } catch (e) {
    return { verified: false, issues: [{ kind: 'verify-error', message: `verify tab 例外: ${e instanceof Error ? e.message : String(e)}`, severity: 'warn' }] };
  } finally {
    if (verifyTab && typeof verifyTab.id === 'number') {
      try { await browser.tabs.remove(verifyTab.id); } catch { /* ignore */ }
    }
  }
}
