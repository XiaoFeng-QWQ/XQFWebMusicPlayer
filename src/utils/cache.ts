/**
 * API 响应缓存层
 * 基于内存 Map + TTL 过期机制，减少重复网络请求
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const DEFAULT_TTL = 5 * 60 * 1000; // 默认 5 分钟过期

const cache = new Map<string, CacheEntry<unknown>>();

export const cacheGet = <T>(key: string, ttl: number = DEFAULT_TTL): T | null => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttl) {
        cache.delete(key);
        return null;
    }
    return entry.data as T;
};

export const cacheSet = <T>(key: string, data: T): void => {
    cache.set(key, { data, timestamp: Date.now() });
};

export const cacheClear = (): void => {
    cache.clear();
};

export const cacheDelete = (key: string): void => {
    cache.delete(key);
};