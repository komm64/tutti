/**
 * popup で使う表示用 formatter (v0.4.80〜、 App.svelte から切り出し)。
 * 純粋関数のみ、 unit test 可能。
 */

/**
 * Unix ms timestamp を相対表記 ("1 minute ago", "3 hours ago" etc.) に整形。
 * Intl.RelativeTimeFormat(undefined) でブラウザロケールに自動追随。
 */
export function formatRelTime(ts: number, now: number = Date.now()): string {
  const diffS = Math.floor((now - ts) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (diffS < 60) return rtf.format(0, 'second');
  if (diffS < 3600) return rtf.format(-Math.floor(diffS / 60), 'minute');
  if (diffS < 86400) return rtf.format(-Math.floor(diffS / 3600), 'hour');
  if (diffS < 86400 * 30) return rtf.format(-Math.floor(diffS / 86400), 'day');
  if (diffS < 86400 * 365) return rtf.format(-Math.floor(diffS / (86400 * 30)), 'month');
  return rtf.format(-Math.floor(diffS / (86400 * 365)), 'year');
}

/** 動画長 (秒) を `M:SS` に整形。 */
export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * バイト数を `MB` / `KB` に整形。
 * 1MB 以上は `1.2MB`、 それ未満は `KB` 表示。
 */
export function formatBytes(b: number): string {
  return b >= 1024 * 1024
    ? `${(b / 1024 / 1024).toFixed(1)}MB`
    : `${Math.round(b / 1024)}KB`;
}
