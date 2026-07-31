import { log } from '../src/utils/logger';
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
import { fetchOverridesFrom } from '../src/utils/selector-feed-runtime';
import { clearBadge, updateProgressBadge } from '../src/background/post-status-ui';
import { buildDiagnosticsReport } from '../src/background/diagnostics';
import { applyDisplayModeBehavior, installFloatingWindowCleanup, openFloatingTutti, resolveAutoDisplayMode } from '../src/background/display-mode';
import { createPersistentLogBuffer } from '../src/background/log-buffer';
import { createUserActionNotifier } from '../src/background/user-action-notifier';
import { createUserRefreshBroadcaster } from '../src/background/user-refresh';
import { handleBinaryChunkRequest } from '../src/background/binary-chunk-handler';
import { createOpenedTabRegistry } from '../src/background/opened-tab-registry';
import { createPostingStateManager } from '../src/background/posting-state';
import { createPlatformPoster } from '../src/background/platform-poster';
import { createExtensionUpdateManager } from '../src/background/extension-update';
import { createSubmissionGuard } from '../src/background/submission-guard';
import { createPostRequestHandler } from '../src/background/post-request-handler';
import { createBackgroundMessageRouter } from '../src/background/message-router';
import { handlePostingMediaFocus } from '../src/background/posting-window';

const logBuffer = createPersistentLogBuffer();
const userActionNotifier = createUserActionNotifier();
const userRefreshBroadcaster = createUserRefreshBroadcaster();
const openedTabRegistry = createOpenedTabRegistry();
const postingState = createPostingStateManager({ onProgressUpdate: updateProgressBadge });
const submissionGuard = createSubmissionGuard();
const platformPoster = createPlatformPoster({
  openedTabs: openedTabRegistry,
  appendBackgroundLog: (message) => logBuffer.appendBackground(message),
});
const handlePostRequest = createPostRequestHandler({
  submissionGuard,
  openedTabs: openedTabRegistry,
  postingState,
  platformPoster,
  appendBackgroundLog: (message) => logBuffer.appendBackground(message),
  sendRuntimeMessage: (message) => browser.runtime.sendMessage(message),
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
const handleRuntimeMessage = createBackgroundMessageRouter({
  logBuffer,
  userActionNotifier,
  userRefreshBroadcaster,
  postingState,
  extensionUpdateManager,
  setLastSeenUser: (message) => setLastSeenUser(message.platform, message.username),
  clearBadge,
  handleBinaryChunkRequest,
  buildDiagnosticsReport: (platforms) => buildDiagnosticsReport({ platforms }),
  handlePostingMediaFocus: (message, sender) =>
    handlePostingMediaFocus(sender.tab?.windowId, message.phase),
  handlePostRequest,
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

  browser.runtime.onMessage.addListener(handleRuntimeMessage);
});
