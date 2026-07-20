/**
 * IndexedDB 持久化存储工具
 * 存储播放器状态：歌单ID、播放模式、音量、当前歌曲索引、收藏、历史
 */

const DB_NAME = 'xqf-music-player';
const DB_VERSION = 2;
const STORE_NAME = 'player-state';

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
};

export const dbGet = async <T>(key: string): Promise<T | null> => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get(key);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve((request.result ?? null) as T | null);
        });
    } catch {
        return null;
    }
};

export const dbSet = async <T>(key: string, value: T): Promise<void> => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(value, key);
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => resolve();
        });
    } catch {
        // 静默失败
    }
};

export const dbDelete = async (key: string): Promise<void> => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(key);
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => resolve();
        });
    } catch {
        // 静默失败
    }
};