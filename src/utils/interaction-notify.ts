/**
 * v0.5.10: bg-side orchestrator for interaction polling + notifications.
 *
 * - alarm が定期発火 → eligible なすべての watched post を見る
 * - 各 post の age に応じて polling cadence を判定 (5min / 15min / 1h / stop)
 * - cadence で OK なら poll → diff → 新着があれば browser.notifications.create
 *
 * MV3 service worker は idle で sleep するが browser.alarms は wake up させる。
 * 5 min 間隔以下は alarm が clamp されるので 1 min minimum 制約に注意。
 */

import { getInteractionSnapshots, getPostHistory, pruneInteractionSnapshots, setInteractionSnapshots, type InteractionSnapshot } from '../storage';
import type { PlatformId } from '../messages';
import { extractPollingTarget, isPollingSupported, pollBluesky, pollMastodon, pollMisskey, type InteractionCounts } from './interaction-poll';
import { t } from './i18n';

const ALARM_NAME = 'tutti-interaction-poll';
/** alarm の発火頻度 (min)。 1 min が最短 (Chrome 仕様)。 5 min にしておけば cadence の上限と整合。 */
const ALARM_PERIOD_MIN = 5;

/** post age に対する polling cadence (msec)。 stop 過ぎたら poll しない。 */
function cadenceForAge(ageMs: number): number | null {
  if (ageMs < 60 * 60 * 1000) return 5 * 60 * 1000;        // 0-1h: 5 min
  if (ageMs < 6 * 60 * 60 * 1000) return 15 * 60 * 1000;   // 1-6h: 15 min
  if (ageMs < 24 * 60 * 60 * 1000) return 60 * 60 * 1000;  // 6-24h: 1 hour
  return null;                                               // 24h+: stop
}

/** snapshots を history と sync (新 post を追加、 retire 済を掃除)。 */
export async function syncWatchedPostsFromHistory(): Promise<void> {
  const history = await getPostHistory();
  const snapshots = await getInteractionSnapshots();
  const RETIRE_AGE_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const entry of history) {
    if (now - entry.timestamp >= RETIRE_AGE_MS) continue;
    for (const platform of entry.platforms) {
      if (!isPollingSupported(platform)) continue;
      const r = entry.results[platform];
      if (!r?.success || !r.url) continue;
      const target = extractPollingTarget(platform, r.url);
      if (!target) continue;
      const id = target.bluesky?.tid ?? target.mastodon?.statusId ?? target.misskey?.noteId;
      if (!id) continue;
      const key = `${platform}:${id}`;
      if (snapshots[key]) continue; // 既に登録済
      snapshots[key] = {
        postedAt: entry.timestamp,
        url: r.url,
        textHead: (entry.text ?? entry.textPreview).slice(0, 60),
      };
    }
  }

  // retire (24h 過ぎ)
  for (const [key, snap] of Object.entries(snapshots)) {
    if (now - snap.postedAt >= RETIRE_AGE_MS) delete snapshots[key];
  }

  await setInteractionSnapshots(snapshots);
}

/** Snapshot URL と同じ host の open tab を探す。custom instance でも動く。 */
async function findOpenTabForHost(host: string): Promise<{ id?: number } | null> {
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return null;
  try {
    const tabs = await browser.tabs.query({ url: `https://${host}/*` });
    return tabs[0] ?? null;
  } catch {
    return null;
  }
}

/** 単一 watched post を poll。 返り値: 新着差分があれば counts、 無ければ null */
async function pollOne(platform: PlatformId, id: string, snap: InteractionSnapshot): Promise<InteractionCounts | null> {
  const target = extractPollingTarget(platform, snap.url);
  let counts: InteractionCounts | null = null;

  if (target?.bluesky) {
    counts = await pollBluesky(target.bluesky.handle, target.bluesky.tid);
  } else if (target?.mastodon) {
    const tab = await findOpenTabForHost(target.mastodon.instanceHost);
    if (tab?.id == null) return null; // tab 不要、 次の cycle で
    counts = await pollMastodon(tab.id, target.mastodon.statusId);
  } else if (target?.misskey) {
    const tab = await findOpenTabForHost(target.misskey.instanceHost);
    if (tab?.id == null) return null;
    counts = await pollMisskey(tab.id, target.misskey.noteId);
  }

  return counts;
}

/** counts 差分があるか判定。 lastNotified 基準 (= 通知済以降の新着) */
function hasNewInteractions(counts: InteractionCounts, last?: InteractionCounts): boolean {
  if (!last) {
    // 初回 poll: 投稿直後で count が 0 でない場合 (= self-test 等) は通知しない
    return false;
  }
  return counts.likes > last.likes || counts.replies > last.replies || counts.reposts > last.reposts;
}

/** browser.notifications で通知を出す。 click で post URL を open。 */
async function fireNotification(key: string, snap: InteractionSnapshot, counts: InteractionCounts, prev: InteractionCounts): Promise<void> {
  const platform = key.split(':')[0]!;
  const deltaLikes = counts.likes - prev.likes;
  const deltaReplies = counts.replies - prev.replies;
  const deltaReposts = counts.reposts - prev.reposts;
  const parts: string[] = [];
  if (deltaLikes > 0) parts.push(t('interactionLike', deltaLikes.toString()));
  if (deltaReplies > 0) parts.push(t('interactionReply', deltaReplies.toString()));
  if (deltaReposts > 0) parts.push(t('interactionRepost', deltaReposts.toString()));
  if (parts.length === 0) return;
  const message = parts.join(', ');

  // WXT の PublicPath 型推論は icon/* を含まないので cast (build 時 manifest 経由で配置済)
  const getUrl = browser.runtime.getURL as (p: string) => string;
  await browser.notifications.create(`tutti-interaction:${key}`, {
    type: 'basic',
    iconUrl: getUrl('icon/128.png'),
    title: t('interactionNotifyTitle', platform),
    message: `${message}\n${snap.textHead}`,
    contextMessage: snap.url.replace(/^https?:\/\//, ''),
    priority: 0,
  });
}

/** 全 watched post を 1 サイクル分 poll する。 */
export async function runPollCycle(): Promise<void> {
  await syncWatchedPostsFromHistory();
  const snapshots = await getInteractionSnapshots();
  const now = Date.now();
  let changed = false;

  for (const [key, snap] of Object.entries(snapshots)) {
    const ageMs = now - snap.postedAt;
    const cadence = cadenceForAge(ageMs);
    if (cadence == null) continue; // 24h+: stop
    if (snap.lastChecked && now - snap.lastChecked < cadence) continue; // 待ち中

    const platform = key.split(':')[0] as PlatformId;
    const id = key.slice(platform.length + 1);
    let counts: InteractionCounts | null = null;
    try {
      counts = await pollOne(platform, id, snap);
    } catch (e) {
      console.warn('[interaction-poll]', key, e);
    }

    if (counts) {
      const prev = snap.lastNotified;
      if (hasNewInteractions(counts, prev)) {
        await fireNotification(key, snap, counts, prev!);
        snap.lastNotified = counts;
      } else if (!prev) {
        // 初回 poll: baseline をセット (この時点の counts は 「投稿直後」 として skip)
        snap.lastNotified = counts;
      }
      snap.counts = counts;
      snap.lastChecked = now;
      changed = true;
    } else {
      // poll 失敗 (tab 無し / API エラー) は lastChecked を更新せず、 次サイクルで再試行
    }
  }

  if (changed) await setInteractionSnapshots(snapshots);
}

/** alarm をセット (idempotent)。 既にあれば no-op、 無ければ作る。 */
export async function ensureAlarm(): Promise<void> {
  const existing = await browser.alarms.get(ALARM_NAME);
  if (existing) return;
  await browser.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN });
}

/** alarm を解除 (Settings で OFF にした時)。 */
export async function clearAlarm(): Promise<void> {
  await browser.alarms.clear(ALARM_NAME);
}

/** click 時 post URL を open + 通知 dismiss */
export async function handleNotificationClick(notificationId: string): Promise<void> {
  if (!notificationId.startsWith('tutti-interaction:')) return;
  const key = notificationId.slice('tutti-interaction:'.length);
  const snapshots = await getInteractionSnapshots();
  const snap = snapshots[key];
  if (snap) {
    await browser.tabs.create({ url: snap.url, active: true });
  }
  await browser.notifications.clear(notificationId);
}

export { ALARM_NAME, pruneInteractionSnapshots };
