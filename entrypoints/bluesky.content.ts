import type { ImageAttachment, Message, PostResultMessage } from '../src/messages';
import { BLUESKY_SELECTORS, blueskyAdapter } from '../src/adapters/bluesky';
import { executePostFlow } from '../src/utils/post-flow';
import { detectAndReportUser } from '../src/utils/user-detect';

function detectBlueskyUser(): string | null {
  // 戦略 1: localStorage の BSKY_STORAGE から handle を読む(最も確実)
  try {
    const raw = localStorage.getItem('BSKY_STORAGE');
    if (raw) {
      const data = JSON.parse(raw) as {
        session?: { accounts?: { active?: boolean; handle?: string }[]; currentAccount?: { handle?: string } };
      };
      const active = data.session?.accounts?.find((a) => a.active);
      const handle = active?.handle ?? data.session?.currentAccount?.handle ?? data.session?.accounts?.[0]?.handle;
      if (handle) return '@' + handle;
    }
  } catch { /* ignore */ }

  // 戦略 2: aria-label="Profile" の side nav リンク(post 内の profile リンクを除外)
  const navLink = document.querySelector<HTMLAnchorElement>(
    'a[aria-label="Profile"][href^="/profile/"]',
  );
  const m1 = navLink?.getAttribute('href')?.match(/^\/profile\/([^/?#]+)/);
  if (m1 && m1[1]) return '@' + m1[1];

  // 戦略 3: data-testid 系
  const testidLink = document.querySelector<HTMLAnchorElement>(
    '[data-testid="bottomBarProfileBtn"] a, [data-testid="profileHeaderButton"]',
  );
  const m2 = testidLink?.getAttribute('href')?.match(/^\/profile\/([^/?#]+)/);
  if (m2 && m2[1]) return '@' + m2[1];

  return null;
}

export default defineContentScript({
  matches: ['https://bsky.app/*'],
  main() {
    browser.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
      const msg = rawMsg as Message;
      if (msg.type !== 'POST_TO_PLATFORM' || msg.platform !== 'bluesky') return;

      void runPost(msg.text, msg.images)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          const result: PostResultMessage = {
            type: 'POST_RESULT',
            platform: 'bluesky',
            success: false,
            error: message,
          };
          sendResponse(result);
        });

      return true;
    });

    void detectAndReportUser('bluesky', detectBlueskyUser);
    console.log('[Tutti] Bluesky content script ready');
  },
});

async function runPost(text: string, images?: ImageAttachment[]): Promise<PostResultMessage> {
  await executePostFlow({
    prefillsViaUrl: blueskyAdapter.prefillsViaUrl,
    textareaSelector: BLUESKY_SELECTORS.textarea,
    postButtonSelector: BLUESKY_SELECTORS.postButton,
    fileInputSelector: BLUESKY_SELECTORS.fileInput,
    text,
    images,
  });

  return {
    type: 'POST_RESULT',
    platform: 'bluesky',
    success: true,
  };
}
