/**
 * 履歴 entry に紐づくメディア (画像 / 動画) を IndexedDB に保存・取り出す。
 *
 * 用途 (v0.5.5〜):
 * - 投稿時に常に書き込まれる。History は直近の投稿をメディア込みで表示する
 * - 「失敗 SNS だけ再送」 を popup から仕掛ける時に再アップロード元として使う
 * - 7 日経過 entry は startup sweep で自動削除 (storage quota 圧迫回避)
 *
 * chrome.storage.local だと quota が tight + binary が base64 化される無駄が
 * 大きいので、 IndexedDB を採用 (拡張機能 contexts でそのまま使える、 unlimited 同梱)。
 */

const DB_NAME = 'tutti-history-media';
const STORE = 'media';
const VERSION = 1;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

interface MediaRecord {
  id: string;        // `${entryId}-${index}`
  blob: Blob;
  ts: number;        // 保存時刻 (epoch ms)
  mime: string;
  size: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('ts', 'ts', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

const HISTORY_THUMB_MAX_PX = 480;
const HISTORY_THUMB_QUALITY = 0.75;

/**
 * 画像 Blob を履歴サムネイル用に圧縮する。
 * max 480px / JPEG 0.75。 OffscreenCanvas は SW でも使えるので background.ts から呼べる。
 * 非画像 (動画等) はそのまま返す。
 */
export async function compressImageForHistory(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith('image/')) return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, HISTORY_THUMB_MAX_PX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return blob; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.convertToBlob({ type: 'image/jpeg', quality: HISTORY_THUMB_QUALITY });
  } catch {
    return blob;
  }
}

export async function putMedia(id: string, blob: Blob): Promise<void> {
  const record: MediaRecord = { id, blob, ts: Date.now(), mime: blob.type, size: blob.size };
  await tx('readwrite', (s) => s.put(record));
}

export async function getMedia(id: string): Promise<Blob | null> {
  const rec = (await tx('readonly', (s) => s.get(id))) as MediaRecord | undefined;
  return rec?.blob ?? null;
}

export async function deleteMedia(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

export async function deleteMediaRefs(ids?: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  await Promise.all(ids.map((id) => deleteMedia(id)));
}

/**
 * `now - ts > maxAgeMs` の record を全削除。 戻り値は削除数。
 * default 7 日。 bg startup から呼ぶ想定。
 */
export async function sweepExpired(maxAgeMs: number = RETENTION_MS): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    const idx = store.index('ts');
    const range = IDBKeyRange.upperBound(cutoff);
    let deleted = 0;
    const cur = idx.openCursor(range);
    cur.onsuccess = () => {
      const cursor = cur.result;
      if (cursor) {
        cursor.delete();
        deleted += 1;
        cursor.continue();
      }
    };
    cur.onerror = () => reject(cur.error);
    t.oncomplete = () => {
      db.close();
      resolve(deleted);
    };
    t.onerror = () => reject(t.error);
  });
}

/**
 * History 全 entry IDs を渡して、 「entry が消えてる media」 を一括 GC する。
 * popup の「履歴クリア」 を押された後などに呼ぶ想定。
 */
export async function dropOrphans(keepEntryIds: Set<string>): Promise<number> {
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    let dropped = 0;
    const cur = store.openCursor();
    cur.onsuccess = () => {
      const cursor = cur.result;
      if (cursor) {
        const rec = cursor.value as MediaRecord;
        const belongsToKeptEntry = Array.from(keepEntryIds)
          .some((entryId) => rec.id.startsWith(`${entryId}-`));
        if (!belongsToKeptEntry) {
          cursor.delete();
          dropped += 1;
        }
        cursor.continue();
      }
    };
    cur.onerror = () => reject(cur.error);
    t.oncomplete = () => {
      db.close();
      resolve(dropped);
    };
    t.onerror = () => reject(t.error);
  });
}
