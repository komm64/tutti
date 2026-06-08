import type { Message } from '../messages';
import { getBinary } from '../utils/binary-transfer';
import { arrayBufferToBase64 } from '../utils/base64';
import { log } from '../utils/logger';
import { t } from '../utils/i18n';

type BinaryChunkMessage = Extract<Message, { type: 'GET_BINARY_CHUNK' }>;

export async function handleBinaryChunkRequest(
  msg: BinaryChunkMessage,
  sendResponse: (response?: unknown) => void,
): Promise<void> {
  try {
    const bytes = await getBinary(msg.dataRef);
    if (bytes.length === 0) {
      log.warn(`GET_BINARY_CHUNK: dataRef=${msg.dataRef} は 0-byte (書き込み失敗の疑い)`);
      sendResponse({ error: t('runtimeIdbZeroByte', msg.dataRef) });
      return;
    }
    const start = Math.max(0, msg.offset);
    const end = Math.min(start + msg.length, bytes.length);
    const slice = bytes.subarray(start, end);
    const buf = new ArrayBuffer(slice.byteLength);
    new Uint8Array(buf).set(slice);
    sendResponse({ chunk: arrayBufferToBase64(buf), totalSize: bytes.length, end });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    log.error(`GET_BINARY_CHUNK 失敗: dataRef=${msg.dataRef} - ${errMsg}`);
    sendResponse({ error: errMsg });
  }
}
