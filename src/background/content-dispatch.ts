import type { PlatformId, PostResultMessage, PostToPlatformMessage } from '../messages';
import { log } from '../utils/logger';
import { waitForTabComplete } from './tab-management';

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
      const msg = e instanceof Error ? e.message : String(e);
      const receiverMissing =
        msg.includes('Receiving end does not exist') ||
        msg.includes('Could not establish connection');
      if (!receiverMissing) throw e;
      if (!injectedFederatedScript) {
        injectedFederatedScript = await tryInjectFederatedContentScripts(tabId, message.platform);
        if (injectedFederatedScript) {
          deadline = Date.now() + 5000;
          continue;
        }
      }
      if (Date.now() >= deadline) {
        if (reloaded) throw e;
        reloaded = true;
        await browser.tabs.reload(tabId);
        await waitForTabComplete(tabId);
        await sleep(100);
        deadline = Date.now() + 5000;
        continue;
      }
      await sleep(100);
    }
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
