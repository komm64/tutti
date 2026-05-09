/**
 * Context 間 (popup ↔ background ↔ offscreen) で binary を運ぶ用の ephemeral
 * IndexedDB store。
 *
 * ## なぜ
 * `chrome.runtime.sendMessage` の payload 上限は 64MB (Chrome の hard cap)。
 * base64 化した 50MB 動画 + JSON wrapper で簡単に超える。base64 そのものが
 * 33% 増しなので元 binary 50MB → message ~67MB で確実に死ぬ。
 *
 * IndexedDB は **拡張 origin で共有** され (popup / background / offscreen 全部
 * `chrome-extension://<id>`)、Uint8Array を structured clone で直接格納できる。
 * sendMessage で渡すのは小さい id 文字列だけ。
 *
 * ## 制限
 * - content script は **web page origin** で動くので拡張 IndexedDB を読めない
 *   (= popup ↔ background ↔ offscreen の 3 文脈間でのみ使える)。content script
 *   への配信は base64 のまま (圧縮後は 64MB cap 内に収まる前提)
 * - browser を完全に閉じると消える (永続化したくない transient buffer)
 *
 * ## API
 * - `putBinary(bytes)` → id を返す
 * - `getBinary(id)` → Uint8Array を返す (失敗で例外)
 * - `deleteBinary(id)` → 削除 (post 完了 / エラー時の cleanup)
 */

const DB_NAME = 'tutti-transfer';
const DB_VERSION = 1;
const STORE = 'blobs';

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

let counter = 0;
function newId(): string {
  return `${Date.now()}-${counter++}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function putBinary(bytes: Uint8Array): Promise<string> {
  const id = newId();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(bytes, id);
    tx.oncomplete = () => { db.close(); resolve(id); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('putBinary failed')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('putBinary aborted')); };
  });
}

export async function getBinary(id: string): Promise<Uint8Array> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => {
      db.close();
      const v = req.result;
      if (v instanceof Uint8Array) resolve(v);
      else if (v instanceof ArrayBuffer) resolve(new Uint8Array(v));
      else reject(new Error(`binary-transfer: id ${id} not found`));
    };
    req.onerror = () => { db.close(); reject(req.error ?? new Error('getBinary failed')); };
  });
}

export async function deleteBinary(id: string): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}
