import type { PlatformId } from '../messages';
import {
  elementTextMatches,
  isElementDisabled,
  isVisibleElement,
  sleep,
  waitForCondition,
} from './dom';
import { clickElementInMainWorld } from './image';

const REPLY_TEXTS = ['Reply', '返信', '返信する', 'Respond'];

export function continuationNeedsReplyUrl(platform: PlatformId): boolean {
  return platform === 'x' || platform === 'mastodon' || platform === 'threads';
}

export function isPlatformPostDetailUrl(platform: PlatformId, url: string): boolean {
  if (platform === 'mastodon') return parseMastodonStatusIdFromUrl(url) !== undefined;
  if (platform === 'threads') return /^https:\/\/(?:www\.)?threads\.(?:com|net)\/@[^/]+\/post\/[\w-]+(?:[/?#]|$)/.test(url);
  return false;
}

export function parseMastodonStatusIdFromUrl(url: string): string | undefined {
  try {
    const path = new URL(url).pathname;
    return path.match(/^\/@[^/]+\/(\d+)(?:\/)?$/)?.[1]
      ?? path.match(/^\/users\/[^/]+\/statuses\/(\d+)(?:\/)?$/)?.[1];
  } catch {
    return undefined;
  }
}

export async function openReplyComposerIfOnPostPage(
  platform: Extract<PlatformId, 'mastodon' | 'threads'>,
  textareaSelector: string,
  options: {
    timeoutMs?: number;
    clickInMainWorld?: boolean;
  } = {},
): Promise<boolean> {
  if (!isPlatformPostDetailUrl(platform, location.href)) return false;

  const timeoutMs = options.timeoutMs ?? 15_000;
  const button = await waitForCondition<HTMLElement>(
    () => findReplyButton(platform, document),
    { timeoutMs, intervalMs: 250 },
  );
  if (!button) {
    throw new Error(`${platform}: reply button not found for continuation post`);
  }

  if (options.clickInMainWorld) {
    const marker = `tutti-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    button.setAttribute('data-tutti-reply-target', marker);
    try {
      await clickElementInMainWorld(`[data-tutti-reply-target="${marker}"]`);
    } finally {
      button.removeAttribute('data-tutti-reply-target');
    }
  } else {
    button.click();
  }

  await sleep(300);
  const composeInput = await waitForCondition<HTMLElement>(
    () => document.querySelector<HTMLElement>(textareaSelector),
    { timeoutMs, intervalMs: 250 },
  );
  if (!composeInput) {
    throw new Error(`${platform}: reply composer did not open`);
  }
  return true;
}

export function findReplyButton(platform: Extract<PlatformId, 'mastodon' | 'threads'>, root: ParentNode = document): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(replyButtonSelector(platform)));
  for (const el of candidates) {
    if (isReplyButton(el) && isVisibleElement(el) && !isElementDisabled(el)) return el;
  }
  return null;
}

function replyButtonSelector(platform: Extract<PlatformId, 'mastodon' | 'threads'>): string {
  if (platform === 'mastodon') {
    return [
      'button[aria-label="Reply"]',
      'button[aria-label="返信"]',
      'button[title="Reply"]',
      'button[title="返信"]',
      'button.status__action-bar-button',
      'button',
      '[role="button"]',
    ].join(',');
  }
  return [
    '[aria-label="Reply"]',
    '[aria-label="返信"]',
    '[aria-label="返信する"]',
    '[role="button"]',
    'button',
  ].join(',');
}

function isReplyButton(el: HTMLElement): boolean {
  if (elementTextMatches(el, REPLY_TEXTS)) return true;
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria && REPLY_TEXTS.includes(aria)) return true;
  const title = el.getAttribute('title')?.trim();
  return !!title && REPLY_TEXTS.includes(title);
}
