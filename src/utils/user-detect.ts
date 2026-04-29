import type { PlatformId } from '../messages';
import { sleep } from './dom';

/**
 * ページに描画されているログイン中アカウント名を取得して background に通知する。
 * 検出に失敗してもエラーにしない(未ログイン / 未対応 UI / 描画途中の可能性)。
 */
export async function detectAndReportUser(
  platform: PlatformId,
  detector: () => string | null,
  initialDelayMs = 2500,
): Promise<void> {
  try {
    await sleep(initialDelayMs);
    // 1 度ダメでも 2 秒置きに 3 回まで再試行(SPA で遅延描画されることがある)
    let username: string | null = null;
    for (let i = 0; i < 3; i++) {
      username = detector();
      if (username) break;
      await sleep(2000);
    }
    if (username) {
      console.log(`[Tutti] ${platform} detected user: ${username}`);
      void browser.runtime.sendMessage({
        type: 'CURRENT_USER',
        platform,
        username,
      });
    } else {
      console.warn(`[Tutti] ${platform} user detection failed (no match found after retries)`);
    }
  } catch (err) {
    console.warn(`[Tutti] ${platform} user detection threw:`, err);
  }
}
