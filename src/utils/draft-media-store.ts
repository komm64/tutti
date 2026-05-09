/**
 * 大きい media (動画・画像 base64) を IndexedDB に保存。
 *
 * `chrome.storage.session` には 10MB quota があり、50MB+ の動画は保存できない。
 * 旧コードは quota 例外で text のみ保存にフォールバックして media を捨てていた
 * (popup を閉じると動画添付が消える regression の原因)。media だけ IndexedDB に
 * 逃がして、text + selected 等の小さい state は引き続き session storage に置く。
 *
 * IndexedDB はブラウザ再起動を跨いで残るが、`clearDraft` 経路で削除する設計。
 * 起動時の draft 復元で `getDraftMedia` が呼ばれる。
 */

const DB_NAME = 'tutti-draft';
const DB_VERSION = 1;
const STORE = 'media';
const KEY = 'current';

export interface DraftMediaRecord {
  /** 画像 0..N + 動画 0/1。schema は src/storage.ts の Draft と整合 */
  images?: Array<{ name: string; type: string; data: string }>;
  video?: { name: string; type: string; data: string; durationS?: number } | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function saveDraftMedia(media: DraftMediaRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(media, KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('IndexedDB write failed')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IndexedDB tx aborted')); };
  });
}

export async function getDraftMedia(): Promise<DraftMediaRecord | null> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => { db.close(); resolve((req.result as DraftMediaRecord | undefined) ?? null); };
    req.onerror = () => { db.close(); resolve(null); };
  });
}

export async function clearDraftMedia(): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}
