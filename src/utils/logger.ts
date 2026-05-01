/**
 * Tutti のログ機構。Python の logging に倣って 4 レベル + OFF。
 *
 * - 各 context (popup / background / content scripts / inject helper) から
 *   `log.info(...)` のように呼ぶ。
 * - 出力経路は 2 系統:
 *   1. console.{error,warn,log,debug} — 開発者が DevTools で見る
 *   2. background へ runtime.sendMessage で転送 → background が ring buffer に貯める
 *      → Settings から「ログをダウンロード」で .json として落とせる(Beta の障害報告用)
 * - level は `Settings.logLevel` (storage.sync) で実行時に切替え。デフォルトは
 *   Beta = INFO、将来正式版なら ERROR。Settings.svelte からドロップダウンで変更可。
 *
 * バッファ転送は fire-and-forget で失敗を握りつぶす(background が sleeping
 * 中などに sendMessage が通らないこともある、その場合は console には残るので諦める)。
 */
import type { LogAppendMessage, LogEntry, LogLevel } from '../messages';

const LEVEL_RANK: Record<LogLevel, number> = {
  OFF: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
};

/**
 * 実行時の閾値。Settings.logLevel の値に合わせて変える。
 * 各 context が独自に保持する(content script は SNS タブごと、popup は popup ごと)
 */
let runtimeLevel: LogLevel = 'INFO';

export function setLogLevel(level: LogLevel): void {
  runtimeLevel = level;
}

export function getLogLevel(): LogLevel {
  return runtimeLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] <= LEVEL_RANK[runtimeLevel];
}

/**
 * console と background buffer の両方に出す。background への転送は失敗を無視
 * (service worker が寝てるとき等)。
 */
function emit(level: LogLevel, args: unknown[]): void {
  if (!shouldLog(level)) return;

  // serializable な形に整形して buffer 用 string を作る
  const ts = Date.now();
  const parts = args.map((a) => {
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  });
  const message = parts.join(' ');

  // 1. console
  const prefix = `[Tutti ${level}]`;
  switch (level) {
    case 'ERROR': console.error(prefix, ...args); break;
    case 'WARN':  console.warn(prefix, ...args); break;
    case 'DEBUG': console.debug(prefix, ...args); break;
    default:      console.log(prefix, ...args); break;
  }

  // 2. background buffer (fire-and-forget)
  const entry: LogEntry = {
    ts,
    level,
    context: detectContext(),
    message,
  };
  try {
    const msg: LogAppendMessage = { type: 'LOG_APPEND', entry };
    void browser.runtime.sendMessage(msg).catch(() => { /* ignore */ });
  } catch { /* ignore */ }
}

/**
 * どの context から出たログか軽く識別。content script / popup / background などの判別。
 */
function detectContext(): string {
  try {
    if (typeof location !== 'undefined') {
      const u = location.href;
      if (u.startsWith('chrome-extension://')) {
        if (u.endsWith('/popup.html')) return 'popup';
        if (u.endsWith('/options.html')) return 'options';
        if (u.endsWith('/offscreen.html')) return 'offscreen';
        return 'extension';
      }
      // SNS host name で識別
      try { return new URL(u).hostname; } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return 'background';
}

export const log = {
  error: (...args: unknown[]) => emit('ERROR', args),
  warn:  (...args: unknown[]) => emit('WARN', args),
  info:  (...args: unknown[]) => emit('INFO', args),
  debug: (...args: unknown[]) => emit('DEBUG', args),
};

/**
 * popup / content script 起動直後に呼んで、storage の logLevel と同期する。
 * 同期失敗してもデフォルトの INFO のまま動く(grace 設計)。
 */
export async function initLogLevelFromSettings(): Promise<void> {
  try {
    const s = await browser.storage.sync.get('settings');
    const settings = s['settings'] as { logLevel?: LogLevel } | undefined;
    if (settings?.logLevel && settings.logLevel in LEVEL_RANK) {
      runtimeLevel = settings.logLevel;
    }
  } catch { /* ignore */ }
}
