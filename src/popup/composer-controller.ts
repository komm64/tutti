import type { ExtensionUpdateState } from '../messages';
import type { PlatformId } from '../types/platform';
import { decodeMessage } from '../utils/message-decoder';
import {
  getDraft,
  getSelectedPlatforms,
  saveDraft,
  saveSelectedPlatforms,
  type Draft,
  type HistoryEntry,
  type SelectedPlatforms,
} from '../storage';
import {
  loadPopupHistoryThumbs,
  revokeHistoryThumbUrls,
  type PopupHistoryThumbs,
} from './history-thumbs';
import {
  openPopupGitHubIssue,
  submitPopupErrorReport,
  type PopupReportContext,
} from './error-report-submit';
import {
  restoreImagePreviews,
  restoreVideoPreview,
  serializeImagesForDraft,
  serializeVideoForDraft,
} from './media-preview';
import {
  addFilesToMediaState,
  moveImageAt,
  removeImageAt,
  removeVideoFromState,
} from './media-state';
import {
  applyBackgroundState,
  applyProgressMessage,
  type BgStateResponse,
  type PostingViewState,
} from './posting-progress';
import type {
  ImagePreview,
  ReportResult,
  VideoPreview,
} from './types';

const DEFAULT_REPORT_ENDPOINT = 'https://tutti-report.komm64.workers.dev';

export interface ComposerDraftState {
  text: string;
  images: ImagePreview[];
  video: VideoPreview | null;
}

export interface ComposerDraftSnapshot {
  text: string;
  images: readonly ImagePreview[];
  video: VideoPreview | null;
}

export interface ComposerMediaState {
  images: ImagePreview[];
  video: VideoPreview | null;
  imageAlts: string[];
}

export interface ComposerHistoryState {
  entries: HistoryEntry[];
  thumbs: Record<string, string[]>;
}

type HistoryStorageChangeListener = (
  changes: Record<string, unknown>,
  area: string,
) => void;

export interface ComposerBackgroundSyncCallbacks {
  getPostingState: () => PostingViewState;
  onPostingState: (
    state: PostingViewState,
    source: 'restore' | 'progress',
  ) => void;
  onUpdateAvailable: (state: ExtensionUpdateState) => void;
}

export type ComposerReportContext = PopupReportContext;

export interface ComposerUpdateApplyResult {
  ok: boolean;
  error?: string;
  detail?: string;
}

export interface ComposerControllerOptions {
  getDraft?: () => Promise<Draft | null>;
  saveDraft?: (draft: Draft) => Promise<void>;
  getSelectedPlatforms?: () => Promise<SelectedPlatforms | null>;
  saveSelectedPlatforms?: (selected: SelectedPlatforms) => Promise<void>;
  loadHistory?: () => Promise<PopupHistoryThumbs>;
  revokeHistoryUrls?: (urls: readonly string[]) => void;
  subscribeStorageChanges?: (
    listener: HistoryStorageChangeListener,
  ) => () => void;
  sendRuntimeMessage?: (message: unknown) => Promise<unknown>;
  subscribeRuntimeMessages?: (
    listener: (message: unknown) => void,
  ) => () => void;
  submitErrorReport?: typeof submitPopupErrorReport;
  openGitHubIssue?: typeof openPopupGitHubIssue;
  writeClipboard?: (text: string) => Promise<void>;
  reportEndpoint?: string;
  draftDebounceMs?: number;
  selectionDebounceMs?: number;
}

function subscribeStorageChanges(
  listener: HistoryStorageChangeListener,
): () => void {
  const rawListener = listener as Parameters<
    typeof browser.storage.onChanged.addListener
  >[0];
  browser.storage.onChanged.addListener(rawListener);
  return () => browser.storage.onChanged.removeListener(rawListener);
}

function subscribeRuntimeMessages(
  listener: (message: unknown) => void,
): () => void {
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}

export function createComposerController(options: ComposerControllerOptions = {}) {
  const readDraft = options.getDraft ?? getDraft;
  const writeDraft = options.saveDraft ?? saveDraft;
  const readSelected = options.getSelectedPlatforms ?? getSelectedPlatforms;
  const writeSelected = options.saveSelectedPlatforms ?? saveSelectedPlatforms;
  const readHistory = options.loadHistory ?? loadPopupHistoryThumbs;
  const revokeHistory = options.revokeHistoryUrls ?? revokeHistoryThumbUrls;
  const watchStorage = options.subscribeStorageChanges ?? subscribeStorageChanges;
  const sendRuntimeMessage = options.sendRuntimeMessage ??
    ((message: unknown) => browser.runtime.sendMessage(message));
  const watchRuntime = options.subscribeRuntimeMessages ?? subscribeRuntimeMessages;
  const submitReport = options.submitErrorReport ?? submitPopupErrorReport;
  const openGitHubIssue = options.openGitHubIssue ?? openPopupGitHubIssue;
  const writeClipboard = options.writeClipboard ??
    ((text: string) => navigator.clipboard.writeText(text));
  const reportEndpoint = options.reportEndpoint ?? DEFAULT_REPORT_ENDPOINT;
  const draftDebounceMs = options.draftDebounceMs ?? 300;
  const selectionDebounceMs = options.selectionDebounceMs ?? 200;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  let selectionTimer: ReturnType<typeof setTimeout> | undefined;
  let historyObjectUrls: string[] = [];
  let historySubscriber: ((state: ComposerHistoryState) => void) | undefined;
  let stopHistorySubscription: (() => void) | undefined;
  let stopBackgroundSubscription: (() => void) | undefined;
  let historyRequest = 0;
  let disposed = false;

  const refreshHistory = async (): Promise<void> => {
    const request = ++historyRequest;
    const { entries, thumbs, objectUrls } = await readHistory();
    if (disposed || request !== historyRequest) {
      revokeHistory(objectUrls);
      return;
    }
    revokeHistory(historyObjectUrls);
    historyObjectUrls = objectUrls;
    historySubscriber?.({ entries, thumbs });
  };

  return {
    async loadDraft(): Promise<ComposerDraftState | null> {
      const draft = await readDraft();
      if (!draft) return null;
      return {
        text: draft.text,
        images: restoreImagePreviews(draft.images),
        video: restoreVideoPreview(draft.video),
      };
    },

    async loadSelectedPlatforms(
      defaults: Readonly<Record<PlatformId, boolean>>,
    ): Promise<Record<PlatformId, boolean>> {
      const stored = await readSelected();
      const selected = { ...defaults };
      if (!stored) return selected;
      for (const [key, value] of Object.entries(stored)) {
        if (typeof value === 'boolean' && key in selected) {
          selected[key as PlatformId] = value;
        }
      }
      return selected;
    },

    scheduleDraftSave(snapshot: ComposerDraftSnapshot): void {
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        draftTimer = undefined;
        void writeDraft({
          text: snapshot.text,
          images: serializeImagesForDraft(snapshot.images),
          video: serializeVideoForDraft(snapshot.video),
        });
      }, draftDebounceMs);
    },

    scheduleSelectedPlatformsSave(
      selected: Readonly<Record<PlatformId, boolean>>,
    ): void {
      if (selectionTimer) clearTimeout(selectionTimer);
      const snapshot = { ...selected };
      selectionTimer = setTimeout(() => {
        selectionTimer = undefined;
        void writeSelected(snapshot);
      }, selectionDebounceMs);
    },

    async saveSelectedPlatforms(
      selected: Readonly<Record<PlatformId, boolean>>,
    ): Promise<void> {
      if (selectionTimer) {
        clearTimeout(selectionTimer);
        selectionTimer = undefined;
      }
      await writeSelected({ ...selected });
    },

    async addFiles(
      state: ComposerMediaState,
      files: readonly File[],
    ): Promise<ComposerMediaState> {
      return await addFilesToMediaState(state, files);
    },

    removeImage(state: ComposerMediaState, index: number): ComposerMediaState {
      return removeImageAt(state, index);
    },

    moveImage(
      state: ComposerMediaState,
      index: number,
      delta: -1 | 1,
    ): ComposerMediaState {
      return moveImageAt(state, index, delta);
    },

    removeVideo(state: ComposerMediaState): ComposerMediaState {
      return removeVideoFromState(state);
    },

    setImageAlt(
      state: ComposerMediaState,
      index: number,
      value: string,
    ): ComposerMediaState {
      const imageAlts = state.imageAlts.slice();
      imageAlts[index] = value;
      return { ...state, imageAlts };
    },

    refreshHistory,

    subscribeHistory(
      subscriber: (state: ComposerHistoryState) => void,
    ): () => void {
      historySubscriber = subscriber;
      stopHistorySubscription?.();
      const onStorageChange: HistoryStorageChangeListener = (changes, area) => {
        if (area === 'local' && 'postHistory' in changes) {
          void refreshHistory().catch(() => {});
        }
      };
      stopHistorySubscription = watchStorage(onStorageChange);
      void refreshHistory().catch(() => {});
      return () => {
        if (historySubscriber === subscriber) historySubscriber = undefined;
        stopHistorySubscription?.();
        stopHistorySubscription = undefined;
      };
    },

    subscribeBackgroundSync(
      callbacks: ComposerBackgroundSyncCallbacks,
    ): () => void {
      stopBackgroundSubscription?.();
      let active = true;
      const listener = (rawMessage: unknown): void => {
        if (!active || disposed) return;
        const message = decodeMessage(rawMessage);
        if (!message) return;
        const next = applyProgressMessage(message, callbacks.getPostingState());
        if (next) callbacks.onPostingState(next, 'progress');
        if (message.type === 'EXTENSION_UPDATE_AVAILABLE') {
          callbacks.onUpdateAvailable(message.state);
        }
      };
      const stop = watchRuntime(listener);
      stopBackgroundSubscription = () => {
        active = false;
        stop();
      };
      void sendRuntimeMessage({ type: 'GET_BG_STATE' })
        .then((response) => {
          if (!active || disposed) return;
          const next = applyBackgroundState(
            response as BgStateResponse | undefined,
            callbacks.getPostingState(),
          );
          callbacks.onPostingState(next, 'restore');
        })
        .catch(() => {});
      return () => {
        if (!active) return;
        stopBackgroundSubscription?.();
        stopBackgroundSubscription = undefined;
      };
    },

    async runDiagnostics(): Promise<string> {
      try {
        const response = await sendRuntimeMessage({ type: 'DIAGNOSE_REQUEST' }) as
          | { report?: unknown; error?: string }
          | undefined;
        return response?.error
          ? `error: ${response.error}`
          : JSON.stringify(response?.report ?? null, null, 2);
      } catch (error) {
        return `error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },

    async copyDiagnostics(text: string): Promise<boolean> {
      if (!text) return false;
      try {
        await writeClipboard(text);
        return true;
      } catch {
        return false;
      }
    },

    async refreshExtensionUpdateState(): Promise<ExtensionUpdateState | undefined> {
      try {
        const response = await sendRuntimeMessage({
          type: 'GET_EXTENSION_UPDATE_STATE',
        }) as { state?: ExtensionUpdateState } | undefined;
        return response?.state ?? { available: false };
      } catch {
        return undefined;
      }
    },

    async applyExtensionUpdate(): Promise<ComposerUpdateApplyResult> {
      try {
        const response = await sendRuntimeMessage({
          type: 'APPLY_EXTENSION_UPDATE',
        }) as ComposerUpdateApplyResult | undefined;
        return response ?? { ok: false, error: 'reload_failed' };
      } catch (error) {
        return {
          ok: false,
          error: 'reload_failed',
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async submitErrorReport(
      errorText: string,
      context: ComposerReportContext,
      dedupedMessage: (hours: number) => string,
    ): Promise<ReportResult> {
      return await submitReport({
        errorText,
        context,
        endpoint: reportEndpoint,
        dedupedMessage,
      });
    },

    async openGitHubIssue(
      errorText: string,
      context: ComposerReportContext,
      note: string,
      overflowNote: string,
    ): Promise<void> {
      await openGitHubIssue({ errorText, context, note, overflowNote });
    },

    dispose(): void {
      disposed = true;
      if (draftTimer) clearTimeout(draftTimer);
      if (selectionTimer) clearTimeout(selectionTimer);
      draftTimer = undefined;
      selectionTimer = undefined;
      historyRequest++;
      stopHistorySubscription?.();
      stopHistorySubscription = undefined;
      stopBackgroundSubscription?.();
      stopBackgroundSubscription = undefined;
      historySubscriber = undefined;
      revokeHistory(historyObjectUrls);
      historyObjectUrls = [];
    },
  };
}
