/**
 * Compatibility facade for runtime message contracts.
 *
 * Existing callers can continue importing from `src/messages`. New category
 * modules own the definitions so each entrypoint can migrate independently.
 */

import type { DiagnosticsMessage } from './messages/diagnostics';
import type { MediaMessage } from './messages/media';
import type { PostingMessage } from './messages/posting';
import type { UpdateMessage } from './messages/update';
import type { UserSessionMessage } from './messages/user-session';

export type { PlatformId } from './types/platform';
export * from './messages/diagnostics';
export * from './messages/media';
export * from './messages/posting';
export * from './messages/update';
export * from './messages/user-session';

export type Message =
  | PostingMessage
  | MediaMessage
  | DiagnosticsMessage
  | UpdateMessage
  | UserSessionMessage;
