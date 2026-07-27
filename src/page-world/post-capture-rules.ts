import {
  extractInstagramPostRecord,
  extractMastodonPostRecord,
  extractThreadsPostRecord,
  extractTumblrPostRecord,
  extractXPostId,
  isInstagramConfigureUrl,
  prepareInstagramConfigureBody,
  type CapturedPostRecord,
} from '../utils/post-capture-record';
import type {
  NetworkCaptureRule,
  NetworkCapturePreparation,
  ObservedNetworkRequest,
} from './network-observer';

export type PostCapturePlatform =
  | 'instagram'
  | 'mastodon'
  | 'tumblr'
  | 'threads'
  | 'x';

export interface PostCapturePendingState {
  caption?: string;
  textHash?: string;
  blogName?: string;
  username?: string;
}

export interface PostCaptureResult {
  platform: PostCapturePlatform;
  record: CapturedPostRecord;
}

interface PostCaptureRuleContext {
  origin: string;
  pending: PostCapturePendingState;
}

interface PostCapturePlan {
  platform: PostCapturePlatform;
  textHash?: string;
  blogName?: string;
  username?: string;
  body?: unknown;
}

export interface PurePostCaptureRule {
  id: PostCapturePlatform;
  supportsHost: (host: string) => boolean;
  prepare: (
    request: Readonly<ObservedNetworkRequest>,
    context: Readonly<PostCaptureRuleContext>,
  ) => PostCapturePlan | null;
  capture: (
    payload: unknown,
    plan: Readonly<PostCapturePlan>,
    now?: number,
  ) => PostCaptureResult | undefined;
}

export interface PagePostCaptureRuleOptions {
  host: string;
  origin: string;
  readPending: (platform: PostCapturePlatform) => PostCapturePendingState;
  onCaptured: (result: PostCaptureResult) => void;
}

export const POST_CAPTURE_RULES: readonly PurePostCaptureRule[] = [
  {
    id: 'instagram',
    supportsHost: (host) => /(?:^|\.)instagram\.com$/i.test(host),
    prepare: (request, { pending }) => {
      if (!isInstagramConfigureUrl(request.url)) return null;
      if (request.transport === 'xhr' && typeof request.body !== 'string') return null;
      if (typeof request.body !== 'string') {
        return { platform: 'instagram' };
      }
      const prepared = prepareInstagramConfigureBody(request.body, pending.caption);
      return {
        platform: 'instagram',
        textHash: prepared.textHash,
        ...(prepared.changed ? { body: prepared.body } : {}),
      };
    },
    capture: (payload, plan, now) => {
      const record = extractInstagramPostRecord(payload, plan.textHash, now);
      return record?.url ? { platform: 'instagram', record } : undefined;
    },
  },
  {
    id: 'mastodon',
    supportsHost: (host) => /^mastodon\.social$/i.test(host),
    prepare: (request, { origin, pending }) => (
      isMastodonStatusCreateRequest(request, origin)
        ? { platform: 'mastodon', textHash: pending.textHash }
        : null
    ),
    capture: (payload, plan, now) => {
      const record = extractMastodonPostRecord(payload, plan.textHash, now);
      return record?.url ? { platform: 'mastodon', record } : undefined;
    },
  },
  {
    id: 'tumblr',
    supportsHost: (host) => /(?:^|\.)tumblr\.com$/i.test(host),
    prepare: (request, { pending }) => {
      if (!isTumblrPostCreateRequest(request)) return null;
      return {
        platform: 'tumblr',
        textHash: pending.textHash,
        blogName: pending.blogName ?? tumblrBlogNameFromUrl(request.url),
      };
    },
    capture: (payload, plan, now) => {
      const record = extractTumblrPostRecord(
        payload,
        plan.blogName,
        plan.textHash,
        now,
      );
      return record?.url ? { platform: 'tumblr', record } : undefined;
    },
  },
  {
    id: 'threads',
    supportsHost: (host) => /(?:^|\.)threads\.(?:com|net)$/i.test(host),
    prepare: (request, { origin, pending }) => (
      isThreadsPostCreateRequest(request, origin)
        ? {
            platform: 'threads',
            textHash: pending.textHash,
            username: pending.username,
          }
        : null
    ),
    capture: (payload, plan, now) => {
      if (!plan.textHash && !plan.username) return undefined;
      const record = extractThreadsPostRecord(
        payload,
        plan.username,
        plan.textHash,
        now,
      );
      return record?.url ? { platform: 'threads', record } : undefined;
    },
  },
  {
    id: 'x',
    supportsHost: (host) => /^(?:x|twitter)\.com$/i.test(host),
    prepare: (request) => (
      /\/CreateTweet\b/i.test(request.url)
        ? { platform: 'x' }
        : null
    ),
    capture: (payload, _plan, now = Date.now()) => {
      const id = extractXPostId(payload);
      return id
        ? { platform: 'x', record: { id, capturedAt: now } }
        : undefined;
    },
  },
];

export function createPagePostCaptureRules(
  options: PagePostCaptureRuleOptions,
): NetworkCaptureRule[] {
  return POST_CAPTURE_RULES
    .filter((rule) => rule.supportsHost(options.host))
    .map((rule) => ({
      id: rule.id,
      prepare: (request): NetworkCapturePreparation | null => {
        const plan = rule.prepare(request, {
          origin: options.origin,
          pending: options.readPending(rule.id),
        });
        if (!plan) return null;
        return {
          context: plan,
          ...(Object.prototype.hasOwnProperty.call(plan, 'body')
            ? { body: plan.body }
            : {}),
        };
      },
      capture: (payload, _request, context) => {
        const result = rule.capture(payload, context as PostCapturePlan);
        if (result) options.onCaptured(result);
      },
    }));
}

function isMastodonStatusCreateRequest(
  request: Readonly<ObservedNetworkRequest>,
  origin: string,
): boolean {
  if (request.method !== 'POST') return false;
  try {
    const parsed = new URL(request.url, origin);
    return parsed.origin === origin && parsed.pathname === '/api/v1/statuses';
  } catch {
    return false;
  }
}

function isTumblrPostCreateRequest(
  request: Readonly<ObservedNetworkRequest>,
): boolean {
  return request.method === 'POST' && (
    /\/api\/v2\/blog\/[^/]+\/posts?(?:\?|$|\/)/.test(request.url)
    || /\/v2\/blog\/[^/]+\/posts?(?:\?|$|\/)/.test(request.url)
  );
}

function tumblrBlogNameFromUrl(url: string): string | undefined {
  return url
    .match(/\/(?:api\/)?v2\/blog\/([^/]+)\/posts?/)?.[1]
    ?.replace(/\.tumblr\.com$/i, '');
}

function isThreadsPostCreateRequest(
  request: Readonly<ObservedNetworkRequest>,
  origin: string,
): boolean {
  if (request.method !== 'POST') return false;
  try {
    const parsed = new URL(request.url, origin);
    if (!/(?:^|\.)threads\.(?:com|net)$/i.test(parsed.hostname)) return false;
    if (!/\/(?:api\/graphql|graphql|ajax|api\/v\d+)/i.test(parsed.pathname)) return false;
    const body = requestBodyText(request.body);
    if (!body) return false;
    if (!/(create|publish|composer|mutation|text_post|post_create|create_post)/i.test(body)) {
      return false;
    }
    return !/(feed|timeline|search|notification|inbox|viewer)/i.test(body);
  } catch {
    return false;
  }
}

function requestBodyText(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof FormData) {
    return Array.from(body.entries())
      .map(([key, value]) => `${key}=${typeof value === 'string' ? value : value.name}`)
      .join('&');
  }
  return '';
}
