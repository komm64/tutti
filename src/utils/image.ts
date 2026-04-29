import type { ImageAttachment } from '../messages';
import { sleep, waitForElement } from './dom';

/**
 * 画像を SNS の compose フォームの file input に注入する。
 * React/Vue 管理下の hidden input でも native setter 経由で確実に反応させる。
 */
export async function injectImages(
  images: ImageAttachment[],
  fileInputSelector: string,
): Promise<void> {
  const input = await waitForElement<HTMLInputElement>(fileInputSelector, 5000);
  if (!input) {
    throw new Error('画像添付用の input が見つかりませんでした(SNS の UI が変わった可能性)');
  }

  const dt = new DataTransfer();
  for (const img of images) {
    const blob = new Blob([img.data], { type: img.type });
    dt.items.add(new File([blob], img.name, { type: img.type, lastModified: Date.now() }));
  }

  // React 管理の input はネイティブ setter 経由でないと変更を検知しない
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
  if (nativeSetter) {
    nativeSetter.call(input, dt.files);
  } else {
    input.files = dt.files;
  }
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));

  // SNS 側がサムネイル生成などの非同期処理を終えるまで待つ
  await sleep(1500);
}
