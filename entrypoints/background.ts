import { log } from '../src/utils/logger';
import type {
  ImageAttachment,
  Message,
  PlatformId,
  PostResultMessage,
} from '../src/messages';
import { getSettings, setLastSeenUser } from '../src/storage';
import { sweepExpired } from '../src/utils/history-media';
import {
  ALARM_NAME as INTERACTION_ALARM_NAME,
  clearAlarm as clearInteractionAlarm,
  ensureAlarm as ensureInteractionAlarm,
  handleNotificationClick as handleInteractionNotificationClick,
  pruneInteractionSnapshots,
  runPollCycle as runInteractionPollCycle,
} from '../src/utils/interaction-notify';
import { fetchOverridesFrom } from '../src/utils/selector-overrides';
import { notifyResults, clearBadge, updateProgressBadge } from '../src/background/post-status-ui';
import { runPostWorkerPool } from '../src/background/post-worker-pool';
import { resolvePostConcurrency } from '../src/background/post-concurrency';
import { buildDiagnosticsReport } from '../src/background/diagnostics';
import { recordHistoryEntry, releasePostAttachments } from '../src/background/history-recorder';
import { normalizePostEvidence, shouldRunPostCompletionSideEffects } from '../src/background/post-result-policy';
import { applyDisplayModeBehavior, installFloatingWindowCleanup, openFloatingTutti, resolveAutoDisplayMode } from '../src/background/display-mode';
import { createPersistentLogBuffer } from '../src/background/log-buffer';
import { createUserActionNotifier } from '../src/background/user-action-notifier';
import { createUserRefreshBroadcaster } from '../src/background/user-refresh';
import { handleBinaryChunkRequest } from '../src/background/binary-chunk-handler';
import { createOpenedTabRegistry } from '../src/background/opened-tab-registry';
import { createPostingStateManager } from '../src/background/posting-state';
import { createPlatformPoster } from '../src/background/platform-poster';
import { maybeCompressVideoForBudget } from '../src/background/media-preprocess';
import { createExtensionUpdateManager } from '../src/background/extension-update';

const logBuffer = createPersistentLogBuffer();
const userActionNotifier = createUserActionNotifier();
const userRefreshBroadcaster = createUserRefreshBroadcaster();
const openedTabRegistry = createOpenedTabRegistry();
const postingState = createPostingStateManager({ onProgressUpdate: updateProgressBadge });
const platformPoster = createPlatformPoster({
  openedTabs: openedTabRegistry,
  appendBackgroundLog: (message) => logBuffer.appendBackground(message),
});
const extensionUpdateManager = createExtensionUpdateManager({
  runtime: browser.runtime,
  storage: browser.storage.local,
  isBusy: () => postingState.snapshot().posting,
  notifyAvailable: (state) => {
    void browser.runtime
      .sendMessage({ type: 'EXTENSION_UPDATE_AVAILABLE', state })
      .catch(() => { /* popup が閉じていれば届かないので無視 */ });
  },
});

export default defineBackground(() => {
  log.info('background started', { id: browser.runtime.id });
  void logBuffer.load();
  void extensionUpdateManager.init().catch((e) => log.warn('extension update manager init failed', e));
  installFloatingWindowCleanup();

  // 拡張インストール / 起動時に selectorOverrideUrl が設定されてれば自動 fetch。
  // SNS UI が変わって Tutti 自体に新しい selector を取り込まずに済むようにする。
  void (async () => {
    try {
      const { selectorOverrideUrl } = await getSettings();
      if (selectorOverrideUrl) {
        const r = await fetchOverridesFrom(selectorOverrideUrl);
        log.info('selector overrides bootstrap fetch:', r);
      }
    } catch (e) {
      log.warn('override bootstrap failed', e);
    }
  })();

  // v0.5.5: 履歴メディア (IndexedDB) の 7 日 retention sweep。 起動時に古い
  // record を一掃して storage を圧迫しないようにする。 失敗しても拡張機能本体
  // には影響しないので catch して swallow。
  void sweepExpired().catch((e) => log.warn('history media sweep failed', e));

  // v0.5.10: interaction polling alarm 起動。 Settings.notifyInteractions=true
  // の時のみ alarm を作る。 settings 変更時にも追随。
  void (async () => {
    try {
      const settings = await getSettings();
      if (settings.notifyInteractions) {
        await ensureInteractionAlarm();
        await pruneInteractionSnapshots();
      }
    } catch (e) {
      log.warn('interaction alarm bootstrap failed', e);
    }
  })();

  // chrome.alarms 発火 (5 分おき) → poll cycle 実行
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== INTERACTION_ALARM_NAME) return;
    void (async () => {
      try {
        const settings = await getSettings();
        if (!settings.notifyInteractions) {
          await clearInteractionAlarm();
          return;
        }
        await runInteractionPollCycle();
      } catch (e) {
        log.warn('interaction poll cycle failed', e);
      }
    })();
  });

  // 通知 click → captcha 等の操作待ちなら対象 tab を前面化。
  // interaction 通知なら post URL を open + 通知 dismiss。
  browser.notifications.onClicked.addListener((notificationId: string) => {
    if (userActionNotifier.handleNotificationClick(notificationId)) return;
    void handleInteractionNotificationClick(notificationId).catch((e) => {
      log.warn('notification click handler failed', e);
    });
  });

  // v0.5.0: displayMode に応じて action click 動作を切替。
  // - popup: manifest の default_popup が処理 (= 何もしない)
  // - sidepanel: setPanelBehavior でアイコン click → side panel open
  // - floating: action.onClicked で popup window を spawn
  void applyDisplayModeBehavior();
  // settings 変更時に再適用
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      void applyDisplayModeBehavior();
      // v0.5.10: notifyInteractions toggle に追随。 ON で alarm 生成、 OFF で停止。
      void (async () => {
        try {
          const settings = await getSettings();
          if (settings.notifyInteractions) await ensureInteractionAlarm();
          else await clearInteractionAlarm();
        } catch (e) {
          log.warn('interaction alarm toggle failed', e);
        }
      })();
    }
  });

  // floating mode のアイコン click handler。
  // sidepanel/popup mode のときは setPanelBehavior + default_popup が処理するので
  // この listener は call されない (= floating mode 限定)。
  browser.action.onClicked.addListener(async () => {
    try {
      const { displayMode } = await getSettings();
      const effective = displayMode === 'auto' ? resolveAutoDisplayMode() : displayMode;
      if (effective === 'floating') {
        await openFloatingTutti();
      } else if (effective === 'popup') {
        // setPanelBehavior=false + default_popup=空 のはずだが、 念のため fallback
        try { await browser.action.openPopup(); } catch { /* user gesture が足りなければ skip */ }
      }
      // sidepanel mode の場合は setPanelBehavior が click を吸って onClicked は発火しない
    } catch (e) {
      log.warn(`action click handler failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  browser.runtime.onMessage.addListener((rawMsg, sender, sendResponse) => {
    const msg = rawMsg as Message;

    if (msg.type === 'USER_ACTION_REQUIRED') {
      const tabId = sender.tab?.id;
      if (typeof tabId === 'number') {
        void userActionNotifier.notify(msg.platform, msg.reason, tabId);
      }
      return;
    }

    if (msg.type === 'CURRENT_USER') {
      void setLastSeenUser(msg.platform, msg.username);
      return; // fire-and-forget
    }

    if (msg.type === 'BROADCAST_REFRESH_USERS') {
      // v0.4.83: popup mount 時に全 SNS tab に REFRESH_USER を送って
      // active user を再検出させる。 multi-account 切替後の stale を防ぐ。
      // v0.4.85: 5 秒 throttle。 popup を高速で何度も開閉した場合に
      // 無駄な detection 連発を防ぐ。 5s 以内なら lastSeenUsers の cache を
      // そのまま使う方が安全 (account は数秒単位で変わらない)。
      userRefreshBroadcaster.broadcast();
      return; // fire-and-forget、 結果は CURRENT_USER 経由で storage に
    }

    // P19: 進捗 UI を popup 閉じ→再開でも復活させるため、background で進捗状態を覚える
    if (msg.type === 'CONVERSION_PROGRESS') {
      postingState.setCompression({ progress: msg.progress, stage: msg.stage ?? 'transcode' });
      return; // popup 側でも listen してるので fire-and-forget
    }
    if (msg.type === 'CONVERSION_COMPLETE' || msg.type === 'CONVERSION_ERROR') {
      postingState.setCompression(null);
      return; // 同上
    }
    if (msg.type === 'CLEAR_POSTING_STATE') {
      // popup から明示的に「結果を消す / 新規投稿に備える」 ためのクリア。
      // v0.4.96: postingStateInMemory を完了後も保持するようにした (popup の
      // 再 open で 「結果が消える」 事故防止) ことに対するペアの API。
      postingState.clearPostingState();
      clearBadge();
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === 'GET_BG_STATE') {
      // v0.4.96: popup が開かれた = user が結果を見た → badge を clear する。
      // postingState 自体は保持 (popup を閉じて再 open でも結果が見えるように)。
      // v0.4.100: 投稿中 (postingInMemory=true) は clear しない (進捗が見えなくなる
      // bug の原因)。 完了済 state を user が popup で確認したタイミング =
      // postingInMemory=false かつ postingStateInMemory.done=true の場合のみ clear。
      if (postingState.shouldClearBadgeOnRead()) {
        clearBadge();
      }
      sendResponse(postingState.snapshot());
      return true;
    }

    if (msg.type === 'GET_EXTENSION_UPDATE_STATE') {
      void extensionUpdateManager.getState()
        .then((state) => sendResponse({ state }))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ error: message });
        });
      return true;
    }

    if (msg.type === 'APPLY_EXTENSION_UPDATE') {
      void extensionUpdateManager.applyUpdate()
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error: 'reload_failed', detail: message });
        });
      return true;
    }

    // P19: content script からの chunked binary 取得 (tabs.sendMessage 64MB cap 回避)
    if (msg.type === 'GET_BINARY_CHUNK') {
      void handleBinaryChunkRequest(msg, sendResponse);
      return true;
    }

    if (msg.type === 'LOG_APPEND') {
      logBuffer.append(msg.entry);
      return; // fire-and-forget
    }
    if (msg.type === 'LOG_EXPORT_REQUEST') {
      sendResponse({ entries: logBuffer.entries() });
      return true;
    }
    if (msg.type === 'LOG_CLEAR') {
      logBuffer.clear();
      return; // fire-and-forget
    }

    if (msg.type === 'DIAGNOSE_REQUEST') {
      void buildDiagnosticsReport({ platforms: msg.platforms })
        .then((report) => sendResponse({ report }))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ error: message });
        });
      return true;
    }

    if (msg.type !== 'POST_REQUEST') return;

    void handlePostRequest(msg.text, msg.platforms, msg.images, msg.cw, msg.visibility, msg.trimVideoToSeconds, msg.autoPost)
      .then((results) => sendResponse({ results }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({ error: message });
      });

    return true;
  });
});

async function handlePostRequest(
  text: string,
  platforms: PlatformId[],
  images?: ImageAttachment[],
  cw?: string,
  visibility?: 'public' | 'unlisted' | 'private' | 'direct',
  trimVideoToSeconds?: number,
  requestAutoPost?: boolean,
): Promise<PostResultMessage[]> {
  const settings = await getSettings();
  const autoPost = requestAutoPost ?? settings.autoPost;
  // POST_REQUEST ごとに tab cleanup の所有権を切る。preview で開いた tab を
  // 後続の実投稿 cleanup が巻き込む事故を防ぐ。
  openedTabRegistry.clear();
  // v0.4.97: 新規 post 開始 = 前回 state を完全上書き
  postingState.start(platforms);
  try {
    // P16: 動画があり、いずれかの選択中 SNS の maxBytes を超える場合は事前に圧縮
    const adjustedImages = await maybeCompressVideoForBudget(platforms, images, trimVideoToSeconds, {
      onConversionFinished: () => {
        postingState.setCompression(null);
      },
    });
    const results = await runPostWorkerPool({
      platforms,
      concurrency: resolvePostConcurrency(platforms, autoPost),
      post: async (platform) => normalizePostEvidence(
        await platformPoster.postToPlatform(platform, text, adjustedImages, cw, visibility, autoPost),
      ),
      onResult: recordPlatformProgress,
    });

    if (shouldRunPostCompletionSideEffects(autoPost, results)) {
      notifyResults(results);
      // v0.5.5: schema v1 用の metadata 計算 → addToPostHistory に渡す
      await recordHistoryEntry(text, results, adjustedImages);
      // v0.5.7: 成功 SNS の compose / share タブを cleanup (Tutti が新規 open したものに限る)
      void openedTabRegistry.cleanup(results);
    } else {
      clearBadge();
      openedTabRegistry.clear();
    }
    // IndexedDB binary-transfer の cleanup (元 dataRef + 圧縮結果 dataRef 両方)
    releasePostAttachments(images, adjustedImages);
    return results;
  } finally {
    // v0.4.96: postingStateInMemory は null 化せず、 done=true + finishedAt で
    // 「完了済結果」 として保持。 popup 再 open 時に GET_BG_STATE で結果が
    // 戻る。 次の POST_REQUEST 起動時に上書き、 もしくは popup から
    // CLEAR_POSTING_STATE で明示クリア。
    postingState.markDone();
  }
}

function recordPlatformProgress(result: PostResultMessage): void {
  // background 側の state を更新 (popup 再 open 時に GET_BG_STATE で復元される)
  postingState.recordResult(result);
  // popup へストリーム配信(popup が開いていれば届く、閉じてれば↑の state で復元)
  void browser.runtime
    .sendMessage({ type: 'PLATFORM_PROGRESS', result })
    .catch(() => { /* popup 閉じてれば失敗、無視 */ });
}
