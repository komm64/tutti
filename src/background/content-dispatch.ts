import type { PlatformId, PostResultMessage, PostToPlatformMessage } from '../messages';
import { log } from '../utils/logger';
import { t } from '../utils/i18n';
import { waitForTabComplete } from './tab-management';
import { retryTransientTabAction } from './tab-action-retry';

/**
 * tab complete の直後は content script の listener 登録が数百 ms 遅れる場合がある。
 * receiver 不在の間だけ短く retry し、request が消費された後の失敗は再送しない。
 */
export async function sendPostMessageWhenReady(
  tabId: number,
  message: PostToPlatformMessage,
): Promise<PostResultMessage | undefined> {
  let deadline = Date.now() + 5000;
  let reloaded = false;
  let injectedFederatedScript = false;
  while (true) {
    try {
      return (await browser.tabs.sendMessage(tabId, message)) as PostResultMessage | undefined;
    } catch (e) {
      if (!isMissingReceiverError(e)) throw e;
      const loginError = await buildMissingReceiverLoginError(tabId, message.platform);
      if (loginError) {
        return {
          type: 'POST_RESULT',
          platform: message.platform,
          success: false,
          error: loginError,
        };
      }
      if (!injectedFederatedScript) {
        injectedFederatedScript = await tryInjectFederatedContentScripts(tabId, message.platform);
        if (injectedFederatedScript) {
          deadline = Date.now() + 5000;
          continue;
        }
      }
      if (Date.now() >= deadline) {
        if (reloaded) {
          throw e;
        }
        reloaded = true;
        await retryTransientTabAction('reload SNS tab after missing receiver', () => (
          browser.tabs.reload(tabId)
        ));
        await waitForTabComplete(tabId);
        await sleep(100);
        deadline = Date.now() + 5000;
        continue;
      }
      await sleep(100);
    }
  }
}

export async function buildMissingReceiverLoginError(
  tabId: number,
  platform?: PlatformId,
): Promise<string | null> {
  const tab = await browser.tabs.get(tabId).catch(() => null);
  const urlError = buildLoginRedirectErrorForUrl(tab?.url ?? tab?.pendingUrl ?? '');
  if (urlError) return urlError;

  // YouTube sign-in can redirect to accounts.google.com. Tutti intentionally
  // avoids requesting that host permission, so tabs.get() cannot reveal the URL.
  if (!tab?.url && !tab?.pendingUrl && platform === 'youtube') {
    return `${t('failureReasonLogin')} (YouTube / Google)`;
  }
  return null;
}

export function buildLoginRedirectErrorForUrl(url: string): string | null {
  const host = parseHost(url);
  if (!host || !looksLikeLoginRedirect(url, host)) return null;
  return `${t('failureReasonLogin')} (${host})`;
}

export function isMissingReceiverError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Receiving end does not exist') ||
    msg.includes('Could not establish connection')
  );
}

function looksLikeLoginRedirect(url: string, host: string): boolean {
  if (/accounts\.google\.com$/i.test(host)) return true;
  return /(?:^|[/?#&])(?:login|signin|sign-in|auth|accountchooser)(?:[/?#&=]|$)/i.test(url);
}

function parseHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function tryInjectFederatedContentScripts(tabId: number, platform: PlatformId): Promise<boolean> {
  const script =
    platform === 'mastodon' ? '/content-scripts/mastodon.js' :
    platform === 'misskey' ? '/content-scripts/misskey.js' :
    null;
  if (!script) return false;

  try {
    const injectHelperSpec = {
      target: { tabId },
      files: ['/content-scripts/inject-helper.js'],
      world: 'MAIN',
    } as unknown as Parameters<typeof browser.scripting.executeScript>[0];
    await browser.scripting.executeScript(injectHelperSpec);
    await browser.scripting.executeScript({
      target: { tabId },
      files: [script],
    });
    await sleep(150);
    log.info(`${platform}: content scripts injected for configured instance`);
    return true;
  } catch (e) {
    log.warn(`${platform}: dynamic content script injection skipped: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
