// src/utils/imageCache.ts

const DB_NAME = 'bible-ccm-cache';
const DB_VERSION = 2;
const STORE_NAME = 'music-sheets-v2';
const SONGS_STORE_NAME = 'user-songs-v2';

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(SONGS_STORE_NAME)) {
        db.createObjectStore(SONGS_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const imageCache = {
  // 캐싱된 이미지 조회
  getImage: async (fileId: string): Promise<Blob | null> => {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(fileId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          if (request.result) {
            if (request.result.buffer && request.result.type) {
              resolve(new Blob([request.result.buffer], { type: request.result.type }));
            } else if (request.result instanceof Blob) {
              resolve(request.result);
            } else {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };
      });
    } catch (e) {
      console.error('[imageCache] Failed to get image from IndexedDB:', e);
      return null;
    }
  },

  // 다운로드한 이미지 저장
  saveImage: async (fileId: string, blob: Blob): Promise<void> => {
    try {
      const buffer = await blob.arrayBuffer();
      const type = blob.type;
      
      const db = await getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ buffer, type }, fileId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (e) {
      console.error('[imageCache] Failed to save image to IndexedDB:', e);
    }
  },

  // 개별 이미지 Blob 완전 삭제
  removeImage: async (fileId: string): Promise<void> => {
    if (!fileId) return;
    try {
      const db = await getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(fileId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (e) {
      console.error('[imageCache] Failed to remove image from IndexedDB:', e);
    }
  },

  // 악보 메타데이터 저장 (용량 무제한, 100% 영구 보존)
  saveSongMeta: async (song: any): Promise<void> => {
    try {
      const db = await getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(SONGS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(SONGS_STORE_NAME);
        const request = store.put(song);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (e) {
      console.error('[imageCache] Failed to save song metadata to IndexedDB:', e);
    }
  },

  // 모든 사용자 악보 메타데이터 조회
  getAllSongsMeta: async (): Promise<any[]> => {
    try {
      const db = await getDB();
      return new Promise<any[]>((resolve, reject) => {
        const transaction = db.transaction(SONGS_STORE_NAME, 'readonly');
        const store = transaction.objectStore(SONGS_STORE_NAME);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
    } catch (e) {
      console.error('[imageCache] Failed to get all songs metadata from IndexedDB:', e);
      return [];
    }
  },

  // 악보 메타데이터 개별 삭제
  deleteSongMeta: async (songId: string): Promise<void> => {
    try {
      const db = await getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(SONGS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(SONGS_STORE_NAME);
        const request = store.delete(songId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (e) {
      console.error('[imageCache] Failed to delete song metadata from IndexedDB:', e);
    }
  },

  // 악보 캐시 전체 지우기
  clearCache: async (): Promise<void> => {
    try {
      const db = await getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SONGS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const songsStore = transaction.objectStore(SONGS_STORE_NAME);
        
        store.clear();
        songsStore.clear();

        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
      });
    } catch (e) {
      console.error('[imageCache] Failed to clear IndexedDB cache:', e);
      throw e;
    }
  }
};
