// src/lib/indexedDbCache.js

const DB_NAME = 'KartaCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'routes';

let dbPromise;

function getDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        e.target.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export async function saveRouteCache(key, data) {
  window.dispatchEvent(new Event('cache-sync-start'));
  const db = await getDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ key, data, timestamp: Date.now() });
      tx.oncomplete = () => {
        window.dispatchEvent(new Event('cache-sync-end'));
        resolve();
      };
      tx.onerror = () => {
        window.dispatchEvent(new Event('cache-sync-error'));
        reject(tx.error);
      };
    } catch(err) {
      window.dispatchEvent(new Event('cache-sync-error'));
      reject(err);
    }
  });
}

export async function loadRouteCache(key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ? request.result.data : null);
    request.onerror = () => reject(request.error);
  });
}
