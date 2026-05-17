/**
 * 画像を正方形 letterbox に変換 (ぼかし背景 + 中央に元画像)。
 *
 * IG は default で 1:1 crop に強制するため、横長/縦長写真は左右 (or 上下) が
 * 見切れる。Tutti 側で **canvas 経由で正方形に letterbox** することで、画像
 * 全体を保ちながら IG の 1:1 制約に合わせる (v0.4.62)。
 *
 * - 既に square な画像 (許容差 2px) は no-op
 * - 出力は JPEG (quality 0.92)、最大 1080x1080
 * - 背景は元画像を canvas 全体に stretch + blur filter
 * - 中央に元画像を sharp で配置
 *
 * OffscreenCanvas + createImageBitmap は service worker でも使える。
 */
import { arrayBufferToBase64, base64ToUint8Array } from './base64';

const TARGET_LONGEST_PX = 1080; // IG 推奨上限
const BLUR_RATIO = 0.05; // canvas size の 5% を blur radius に

export async function letterboxToSquare(
  base64Data: string,
  mimeType: string,
): Promise<{ data: string; type: string; changed: boolean }> {
  const bytes = base64ToUint8Array(base64Data);
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
  const bitmap = await createImageBitmap(blob);

  // 既に正方形 (差 2px 以内) なら no-op
  if (Math.abs(bitmap.width - bitmap.height) <= 2) {
    bitmap.close();
    return { data: base64Data, type: mimeType, changed: false };
  }

  // longest 軸を TARGET_LONGEST_PX に縮小 (元画像が小さければそのまま)
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > TARGET_LONGEST_PX ? TARGET_LONGEST_PX / longest : 1;
  const drawW = Math.max(1, Math.round(bitmap.width * scale));
  const drawH = Math.max(1, Math.round(bitmap.height * scale));
  const canvasSize = Math.max(drawW, drawH);

  const canvas = new OffscreenCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('letterboxToSquare: OffscreenCanvas 2D context unavailable');
  }

  // ぼかし背景: 元画像を canvas 全体に stretch + blur
  ctx.filter = `blur(${Math.round(canvasSize * BLUR_RATIO)}px)`;
  ctx.drawImage(bitmap, 0, 0, canvasSize, canvasSize);

  // 中央に元画像を sharp で配置
  ctx.filter = 'none';
  const dx = Math.round((canvasSize - drawW) / 2);
  const dy = Math.round((canvasSize - drawH) / 2);
  ctx.drawImage(bitmap, dx, dy, drawW, drawH);

  bitmap.close();

  const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  const outBuf = await outBlob.arrayBuffer();
  return {
    data: arrayBufferToBase64(outBuf),
    type: 'image/jpeg',
    changed: true,
  };
}
