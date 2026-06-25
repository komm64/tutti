/**
 * ImageAttachment の wire format / runtime format 変換 helpers。
 *
 * - `data`: base64 string (popup 状態 / draft / history で標準)
 * - `dataRef`: IndexedDB id (message wire 用、64MB cap 回避)
 *
 * 大きい media (5MB+) を sendMessage で渡すと Chrome の hard cap (64MB) で
 * 死ぬので、popup → background → offscreen 間では IndexedDB 経由で運ぶ。
 * content script (web page origin) は extension IndexedDB を読めないので、
 * content script 境界で base64 に materialize する。
 */

import type { ImageAttachment } from '../messages';
import { arrayBufferToBase64, base64ByteLength, base64ToUint8Array } from './base64';
import { deleteBinary, getBinary, putBinary } from './binary-transfer';

/**
 * 5MB を超える binary は IndexedDB 経由で運ぶ。base64 化すると 33% 増しなので
 * 5MB binary → ~7MB base64、4 枚の画像で 28MB、動画 1 つでも 50MB 超は普通に
 * あるので、cap 64MB に対して margin を取って 5MB に設定。
 */
const TRANSFER_THRESHOLD = 5 * 1024 * 1024;

/**
 * 必要に応じて binary を IndexedDB に書いて dataRef + bytes を持つ形に変換。
 * 小さい media は data (base64) のまま、bytes だけ充足させる。
 */
export async function packAttachmentForTransfer(att: ImageAttachment): Promise<ImageAttachment> {
  if (att.dataRef) return att; // already packed
  if (!att.data) return att; // nothing to do
  const size = base64ByteLength(att.data);
  if (size < TRANSFER_THRESHOLD) {
    return { ...att, bytes: size };
  }
  // 大きいので IndexedDB へ
  const bytes = base64ToUint8Array(att.data);
  const id = await putBinary(bytes);
  return {
    name: att.name,
    type: att.type,
    durationS: att.durationS,
    ...(att.videoCodec ? { videoCodec: att.videoCodec } : {}),
    ...(att.videoCodecParameters ? { videoCodecParameters: att.videoCodecParameters } : {}),
    dataRef: id,
    bytes: bytes.length,
  };
}

/** content script 等 base64 を期待する側に渡す前に materialize (extension 内 IndexedDB 直接アクセス) */
export async function resolveAttachmentToBase64(att: ImageAttachment): Promise<ImageAttachment> {
  if (att.data) return att;
  if (!att.dataRef) throw new Error('attachment has no data and no dataRef');
  const bytes = await getBinary(att.dataRef);
  // structured clone から取り出した buffer は SharedArrayBuffer-backed の場合があるので copy
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return {
    name: att.name,
    type: att.type,
    durationS: att.durationS,
    ...(att.videoCodec ? { videoCodec: att.videoCodec } : {}),
    ...(att.videoCodecParameters ? { videoCodecParameters: att.videoCodecParameters } : {}),
    bytes: bytes.length,
    data: arrayBufferToBase64(buf),
  };
}

/**
 * Content script 用: extension IndexedDB に直接アクセスできない context から
 * background に GET_BINARY_CHUNK を loop 投げて binary を assemble する。
 *
 * tabs.sendMessage の 64MB cap を回避する設計 (1 メッセージ ≤ 30MB binary =
 * base64 ≤ 40MB に抑える)。複数 chunk なら 2-N メッセージで完結。
 */
export async function resolveAttachmentToBase64ViaMessage(
  att: ImageAttachment,
): Promise<ImageAttachment> {
  if (att.data) return att;
  if (!att.dataRef) throw new Error('attachment has no data and no dataRef');

  const CHUNK = 30 * 1024 * 1024;
  let offset = 0;
  let totalSize = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const res = (await browser.runtime.sendMessage({
      type: 'GET_BINARY_CHUNK',
      dataRef: att.dataRef,
      offset,
      length: CHUNK,
    })) as { chunk?: string; totalSize?: number; end?: number; error?: string } | undefined;
    if (!res || res.error || typeof res.chunk !== 'string') {
      throw new Error(`GET_BINARY_CHUNK failed: ${res?.error ?? 'no response'}`);
    }
    const chunkBytes = base64ToUint8Array(res.chunk);
    parts.push(chunkBytes);
    totalSize = res.totalSize ?? 0;
    offset = res.end ?? offset + chunkBytes.length;
    if (offset >= totalSize) break;
  }
  const combined = new Uint8Array(totalSize);
  let pos = 0;
  for (const p of parts) {
    combined.set(p, pos);
    pos += p.length;
  }
  if (combined.length === 0) {
    throw new Error(
      `binary-transfer materialize: 0-byte 取得 (dataRef=${att.dataRef}、IDB に空の binary が書き込まれてる疑い)`,
    );
  }
  return {
    name: att.name,
    type: att.type,
    durationS: att.durationS,
    ...(att.videoCodec ? { videoCodec: att.videoCodec } : {}),
    ...(att.videoCodecParameters ? { videoCodecParameters: att.videoCodecParameters } : {}),
    bytes: combined.length,
    data: arrayBufferToBase64(combined.buffer as ArrayBuffer),
  };
}

/** ffmpeg / Blob 構築等 raw bytes を扱う側に渡す */
export async function resolveAttachmentToBytes(att: ImageAttachment): Promise<Uint8Array> {
  if (att.dataRef) return await getBinary(att.dataRef);
  if (att.data) return base64ToUint8Array(att.data);
  throw new Error('attachment has neither data nor dataRef');
}

/** 制約チェック等で size が要る時。デコードが必要なら fallback で計算する */
export function attachmentSize(att: ImageAttachment): number {
  if (typeof att.bytes === 'number') return att.bytes;
  if (att.data) return base64ByteLength(att.data);
  return 0;
}

/** 投稿完了 / 失敗時の dataRef cleanup (best-effort) */
export async function releaseAttachmentTransfers(images?: ImageAttachment[]): Promise<void> {
  if (!images) return;
  await Promise.all(
    images.map(async (a) => {
      if (a.dataRef) await deleteBinary(a.dataRef);
    }),
  );
}
