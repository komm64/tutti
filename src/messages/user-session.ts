/**
 * Active-user detection, account refresh, and borrowed web-session contracts.
 */

import type { PlatformId } from '../types/platform';

export interface CurrentUserMessage {
  type: 'CURRENT_USER';
  platform: PlatformId;
  username: string | null;
}

export interface GetBlueskySessionMessage {
  type: 'GET_BLUESKY_SESSION';
}

export interface BlueskySessionResult {
  type: 'BLUESKY_SESSION_RESULT';
  accessJwt: string;
  did: string;
  handle: string;
  pdsHost?: string;
}

export interface RefreshUserMessage {
  type: 'REFRESH_USER';
}

export interface BroadcastRefreshUsersMessage {
  type: 'BROADCAST_REFRESH_USERS';
}

export interface UserActionRequiredMessage {
  type: 'USER_ACTION_REQUIRED';
  platform: PlatformId;
  reason: 'captcha' | 'confirmation';
}

export type UserSessionMessage =
  | CurrentUserMessage
  | GetBlueskySessionMessage
  | BlueskySessionResult
  | RefreshUserMessage
  | BroadcastRefreshUsersMessage
  | UserActionRequiredMessage;
