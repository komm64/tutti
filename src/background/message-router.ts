import type {
  Message,
  PostRequestMessage,
  PostResultMessage,
} from '../messages';
import {
  decodeMessageWithDiagnostics,
  type MessageDecodeDiagnostics,
} from '../utils/message-decoder';
import type { DiagnosticsReport } from './diagnostics';
import type { ApplyExtensionUpdateResult } from './extension-update';
import type { PersistentLogBuffer } from './log-buffer';
import type { createPostingStateManager } from './posting-state';
import type { UserActionNotifier } from './user-action-notifier';
import type { UserRefreshBroadcaster } from './user-refresh';

export const BACKGROUND_MESSAGE_TYPES = [
  'USER_ACTION_REQUIRED',
  'CURRENT_USER',
  'BROADCAST_REFRESH_USERS',
  'CONVERSION_PROGRESS',
  'CONVERSION_COMPLETE',
  'CONVERSION_ERROR',
  'CLEAR_POSTING_STATE',
  'POSTING_MEDIA_FOCUS',
  'GET_BG_STATE',
  'GET_EXTENSION_UPDATE_STATE',
  'APPLY_EXTENSION_UPDATE',
  'GET_BINARY_CHUNK',
  'LOG_APPEND',
  'LOG_EXPORT_REQUEST',
  'LOG_CLEAR',
  'DIAGNOSE_REQUEST',
  'POST_REQUEST',
] as const satisfies readonly Message['type'][];

export type BackgroundMessageType = (typeof BACKGROUND_MESSAGE_TYPES)[number];
type BackgroundMessage = Extract<Message, { type: BackgroundMessageType }>;
type MessageOf<T extends BackgroundMessageType> = Extract<BackgroundMessage, { type: T }>;

export interface RuntimeMessageSender {
  tab?: {
    id?: number;
    windowId?: number;
  };
}

export type RuntimeSendResponse = (response?: unknown) => void;
export type RuntimeMessageListener = (
  rawMessage: unknown,
  sender: RuntimeMessageSender,
  sendResponse: RuntimeSendResponse,
) => boolean | void;

interface HandlerContext {
  sender: RuntimeMessageSender;
  sendResponse: RuntimeSendResponse;
}

type TypedHandler<T extends BackgroundMessageType> = (
  message: MessageOf<T>,
  context: HandlerContext,
) => boolean | void;

type TypedHandlerRegistry = {
  [T in BackgroundMessageType]: TypedHandler<T>;
};

interface PostingStateManager {
  setCompression: ReturnType<typeof createPostingStateManager>['setCompression'];
  clearPostingState: ReturnType<typeof createPostingStateManager>['clearPostingState'];
  failRequest: ReturnType<typeof createPostingStateManager>['failRequest'];
  shouldClearBadgeOnRead: ReturnType<typeof createPostingStateManager>['shouldClearBadgeOnRead'];
  snapshot: ReturnType<typeof createPostingStateManager>['snapshot'];
}

interface ExtensionUpdateManager {
  getState(): Promise<unknown>;
  applyUpdate(): Promise<ApplyExtensionUpdateResult>;
}

export interface BackgroundMessageRouterOptions {
  logBuffer: PersistentLogBuffer;
  userActionNotifier: UserActionNotifier;
  userRefreshBroadcaster: UserRefreshBroadcaster;
  postingState: PostingStateManager;
  extensionUpdateManager: ExtensionUpdateManager;
  setLastSeenUser(message: MessageOf<'CURRENT_USER'>): Promise<void>;
  clearBadge(): void;
  handleBinaryChunkRequest(
    message: MessageOf<'GET_BINARY_CHUNK'>,
    sendResponse: RuntimeSendResponse,
  ): Promise<void>;
  buildDiagnosticsReport(
    platforms: MessageOf<'DIAGNOSE_REQUEST'>['platforms'],
  ): Promise<DiagnosticsReport>;
  handlePostingMediaFocus(
    message: MessageOf<'POSTING_MEDIA_FOCUS'>,
    sender: RuntimeMessageSender,
  ): Promise<unknown>;
  handlePostRequest(message: PostRequestMessage): Promise<PostResultMessage[]>;
}

export function createBackgroundMessageRouter(
  options: BackgroundMessageRouterOptions,
): RuntimeMessageListener {
  const handlers = defineHandlers({
    USER_ACTION_REQUIRED: (message, { sender }) => {
      const tabId = sender.tab?.id;
      if (typeof tabId === 'number') {
        void options.userActionNotifier.notify(message.platform, message.reason, tabId);
      }
    },
    CURRENT_USER: (message) => {
      void options.setLastSeenUser(message);
    },
    BROADCAST_REFRESH_USERS: () => {
      options.userRefreshBroadcaster.broadcast();
    },
    CONVERSION_PROGRESS: (message) => {
      options.postingState.setCompression({
        progress: message.progress,
        stage: message.stage ?? 'transcode',
      });
    },
    CONVERSION_COMPLETE: () => {
      options.postingState.setCompression(null);
    },
    CONVERSION_ERROR: () => {
      options.postingState.setCompression(null);
    },
    CLEAR_POSTING_STATE: (_message, { sendResponse }) => {
      options.postingState.clearPostingState();
      options.clearBadge();
      sendResponse({ ok: true });
      return false;
    },
    POSTING_MEDIA_FOCUS: (message, { sender, sendResponse }) => {
      void options.handlePostingMediaFocus(message, sender)
        .then((result) => sendResponse(result))
        .catch((error: unknown) => sendResponse({
          ok: false,
          error: errorMessage(error),
        }));
      return true;
    },
    GET_BG_STATE: (_message, { sendResponse }) => {
      if (options.postingState.shouldClearBadgeOnRead()) {
        options.clearBadge();
      }
      sendResponse(options.postingState.snapshot());
      return true;
    },
    GET_EXTENSION_UPDATE_STATE: (_message, { sendResponse }) => {
      void options.extensionUpdateManager.getState()
        .then((state) => sendResponse({ state }))
        .catch((error: unknown) => sendResponse({ error: errorMessage(error) }));
      return true;
    },
    APPLY_EXTENSION_UPDATE: (_message, { sendResponse }) => {
      void options.extensionUpdateManager.applyUpdate()
        .then((result) => sendResponse(result))
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: 'reload_failed',
            detail: errorMessage(error),
          });
        });
      return true;
    },
    GET_BINARY_CHUNK: (message, { sendResponse }) => {
      void options.handleBinaryChunkRequest(message, sendResponse);
      return true;
    },
    LOG_APPEND: (message) => {
      options.logBuffer.append(message.entry);
    },
    LOG_EXPORT_REQUEST: (_message, { sendResponse }) => {
      sendResponse({ entries: options.logBuffer.entries() });
      return true;
    },
    LOG_CLEAR: () => {
      options.logBuffer.clear();
    },
    DIAGNOSE_REQUEST: (message, { sendResponse }) => {
      void options.buildDiagnosticsReport(message.platforms)
        .then((report) => sendResponse({ report }))
        .catch((error: unknown) => sendResponse({ error: errorMessage(error) }));
      return true;
    },
    POST_REQUEST: (message, { sendResponse }) => {
      void options.handlePostRequest(message)
        .catch((error: unknown) => {
          const detail = errorMessage(error);
          options.logBuffer.appendBackground(
            `POST_REQUEST failed requestId=${message.requestId}: ${detail}`,
          );
          options.postingState.failRequest(
            message.requestId,
            message.platforms,
            detail,
          );
        });
      sendResponse({ accepted: true, requestId: message.requestId });
      return false;
    },
  });

  return (rawMessage, sender, sendResponse) => {
    const decoded = decodeMessageWithDiagnostics(rawMessage);
    if (!decoded) return;

    logContractDefaults(decoded.message, decoded.diagnostics, options.logBuffer);
    if (!isBackgroundMessage(decoded.message)) return;

    const handler = handlers[decoded.message.type] as TypedHandler<BackgroundMessageType>;
    return handler(decoded.message, { sender, sendResponse });
  };
}

function defineHandlers(registry: TypedHandlerRegistry): TypedHandlerRegistry {
  return registry;
}

const BACKGROUND_MESSAGE_TYPE_SET = new Set<Message['type']>(BACKGROUND_MESSAGE_TYPES);

function isBackgroundMessage(message: Message): message is BackgroundMessage {
  return BACKGROUND_MESSAGE_TYPE_SET.has(message.type);
}

function logContractDefaults(
  message: Message,
  diagnostics: MessageDecodeDiagnostics,
  logBuffer: PersistentLogBuffer,
): void {
  if (message.type !== 'POST_REQUEST' ||
      (!diagnostics.requestIdDefaulted && !diagnostics.intentDefaulted)) {
    return;
  }
  const detail = [
    diagnostics.requestIdDefaulted ? 'requestId' : '',
    diagnostics.intentDefaulted
      ? `intent${diagnostics.receivedIntent ? `(${diagnostics.receivedIntent})` : ''}`
      : '',
  ].filter(Boolean).join(',');
  logBuffer.appendBackground(
    `POST_REQUEST contract defaulted ${detail}; ` +
    `requestId=${message.requestId} intent=${message.intent}`,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
