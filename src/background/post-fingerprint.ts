import type { ImageAttachment } from '../messages';
import { resolveAttachmentToBytes } from '../utils/attachment';
import { computeBodyHash, sha256Hex } from '../utils/body-hash';

export type AttachmentBytesResolver = (attachment: ImageAttachment) => Promise<Uint8Array>;

/**
 * Computes the canonical fingerprint used by both SubmissionGuard and History.
 * Attachment names and transfer IDs are transport metadata; binary contents are
 * the stable identity.
 */
export async function computePostFingerprint(
  text: string,
  attachments?: readonly ImageAttachment[],
  resolveBytes: AttachmentBytesResolver = resolveAttachmentToBytes,
): Promise<string> {
  const mediaDigests = await Promise.all(
    (attachments ?? []).map(async (attachment) => sha256Hex(await resolveBytes(attachment))),
  );
  return await computeBodyHash(text, mediaDigests);
}
