import { useState, useEffect, useCallback } from 'react';
import type { Song } from '../types';
import { dbGet, dbSet } from '../utils/db';

const FAVORITES_KEY = 'favorites';
const HISTORY_KEY = 'playHistory';
const MAX_HISTORY = 50;

/**
 * 获取歌曲的稳定标识键
 * 本地歌曲（blob URL）使用 name+artist，网络歌曲使用 url
 */
export const getSongKey = (song: Song): string =>
    song.url.startsWith('blob:') ? `${song.name}|${song.artist}` : song.url;

/**
 * 比较两首歌曲是否相同
 */
export const isSameSong = (a: Song, b: Song): boolean => getSongKey(a) === getSongKey(b);

/**
 * 收藏和播放历史 Hook
 * 使用 IndexedDB 持久化存储收藏歌曲和播放历史
 */
export const useFavorites = () => {
    const [favorites, setFavorites] = useState<Song[]>([]);
    const [playHistory, setPlayHistory] = useState<Song[]>([]);

    // 恢复持久化数据
    useEffect(() => {
        (async () => {
            const savedFavorites = await dbGet<Song[]>(FAVORITES_KEY);
            const savedHistory = await dbGet<Song[]>(HISTORY_KEY);
            if (savedFavorites) setFavorites(savedFavorites);
            if (savedHistory) setPlayHistory(savedHistory);
        })();
    }, []);

    // 添加/移除收藏
    const toggleFavorite = useCallback((song: Song) => {
        setFavorites(prev => {
            const exists = prev.some(s => isSameSong(s, song));
            const next = exists
                ? prev.filter(s => !isSameSong(s, song))
                : [song, ...prev];
            dbSet(FAVORITES_KEY, next);
            return next;
        });
    }, []);

    // 检查是否已收藏
    const isFavorite = useCallback((song: Song) => {
        return favorites.some(s => isSameSong(s, song));
    }, [favorites]);

    // 添加到播放历史
    const addToHistory = useCallback((song: Song) => {
        setPlayHistory(prev => {
            const filtered = prev.filter(s => !isSameSong(s, song));
            const next = [song, ...filtered].slice(0, MAX_HISTORY);
            dbSet(HISTORY_KEY, next);
            return next;
        });
    }, []);

    return {
        favorites,
        playHistory,
        toggleFavorite,
        isFavorite,
        addToHistory,
    };
};