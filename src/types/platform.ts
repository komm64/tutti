/** Tutti が投稿・診断・履歴で識別する platform ID の canonical tuple。 */
export const PLATFORM_IDS = [
  'x',
  'bluesky',
  'threads',
  'mastodon',
  'misskey',
  'tumblr',
  'pixiv',
  'deviantart',
  'instagram',
  'tiktok',
  'youtube',
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];
