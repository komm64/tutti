import { describe, expect, it } from 'vitest';
import { hasYouTubeDailyUploadLimit } from './youtube';

describe('hasYouTubeDailyUploadLimit', () => {
  it.each([
    'Daily upload limit reached',
    'Daily upload limit has been reached',
    "You've reached your daily upload limit",
    'You have reached the daily upload limit',
    'Daily\u00a0upload\nlimit reached',
    '1日のアップロード上限に達しました',
    '1 日あたりのアップロード制限に達しました',
  ])('detects %j', (text) => {
    expect(hasYouTubeDailyUploadLimit(text)).toBe(true);
  });

  it.each([
    '',
    'Upload complete',
    'Learn more about daily upload limits',
    'Your video is ready to publish',
  ])('does not misclassify %j', (text) => {
    expect(hasYouTubeDailyUploadLimit(text)).toBe(false);
  });
});
