/**
 * 画像を指定バイト数以下にリサイズする(Canvas API + createImageBitmap)。
 * 出力は JPEG(quality 0.85)。スケールを 15% ずつ縮小して限界以下に収める。
 */
export async function resizeImage(
  data: ArrayBuffer,
  type: string,
  maxBytes: number,
): Promise<ArrayBuffer> {
  if (data.byteLength <= maxBytes) return data;

  const blob = new Blob([data], { type });
  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context が利用できません');

  let scale = 1;
  let resultBlob: Blob | null = null;

  while (scale > 0.05) {
    canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
    canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    resultBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob 失敗'))),
        'image/jpeg',
        0.85,
      );
    });
    if (resultBlob.size <= maxBytes) break;
    scale *= 0.85;
  }

  bitmap.close();
  if (!resultBlob) throw new Error('リサイズに失敗しました');
  return await resultBlob.arrayBuffer();
}
