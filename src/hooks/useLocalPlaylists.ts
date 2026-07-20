import { useState, useEffect, useCallback } from 'react';
import type { Song } from '../types';
import { dbGet, dbSet } from '../utils/db';

export interface LocalPlaylist {
    id: string;
    name: string;
    songs: Song[];
    createdAt: number;
}

const LOCAL_PLAYLISTS_KEY = 'localPlaylists';

/**
 * 本地歌单管理 Hook
 * 支持创建、编辑、删除本地歌单，存储在 IndexedDB 中
 */
export const useLocalPlaylists = () => {
    const [localPlaylists, setLocalPlaylists] = useState<LocalPlaylist[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // 恢复持久化数据
    useEffect(() => {
        (async () => {
            const saved = await dbGet<LocalPlaylist[]>(LOCAL_PLAYLISTS_KEY);
            if (saved) setLocalPlaylists(saved);
            setIsLoaded(true);
        })();
    }, []);

    const persist = useCallback(async (playlists: LocalPlaylist[]) => {
        setLocalPlaylists(playlists);
        await dbSet(LOCAL_PLAYLISTS_KEY, playlists);
    }, []);

    // 创建本地歌单
    const createPlaylist = useCallback(async (name: string) => {
        const newPlaylist: LocalPlaylist = {
            id: `local_${Date.now()}`,
            name: name.trim(),
            songs: [],
            createdAt: Date.now(),
        };
        const next = [newPlaylist, ...localPlaylists];
        await persist(next);
        return newPlaylist;
    }, [localPlaylists, persist]);

    // 删除本地歌单
    const deletePlaylist = useCallback(async (id: string) => {
        const next = localPlaylists.filter(p => p.id !== id);
        await persist(next);
    }, [localPlaylists, persist]);

    // 重命名歌单
    const renamePlaylist = useCallback(async (id: string, newName: string) => {
        const next = localPlaylists.map(p =>
            p.id === id ? { ...p, name: newName.trim() } : p
        );
        await persist(next);
    }, [localPlaylists, persist]);

    // 添加歌曲到歌单
    const addSongToPlaylist = useCallback(async (playlistId: string, song: Song) => {
        const next = localPlaylists.map(p => {
            if (p.id !== playlistId) return p;
            // 去重
            if (p.songs.some(s => s.url === song.url)) return p;
            return { ...p, songs: [...p.songs, song] };
        });
        await persist(next);
    }, [localPlaylists, persist]);

    // 从歌单中移除歌曲
    const removeSongFromPlaylist = useCallback(async (playlistId: string, songUrl: string) => {
        const next = localPlaylists.map(p => {
            if (p.id !== playlistId) return p;
            return { ...p, songs: p.songs.filter(s => s.url !== songUrl) };
        });
        await persist(next);
    }, [localPlaylists, persist]);

    // 获取歌单歌曲数量
    const getSongCount = useCallback((playlistId: string) => {
        const pl = localPlaylists.find(p => p.id === playlistId);
        return pl ? pl.songs.length : 0;
    }, [localPlaylists]);

    return {
        localPlaylists,
        isLoaded,
        createPlaylist,
        deletePlaylist,
        renamePlaylist,
        addSongToPlaylist,
        removeSongFromPlaylist,
        getSongCount,
    };
};