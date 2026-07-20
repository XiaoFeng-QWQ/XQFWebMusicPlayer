import { useState, useCallback, useRef, useEffect } from 'react';
import { parseBuffer } from 'music-metadata';
import type { Song } from '../types';
import { dbGet, dbSet, dbDelete } from '../utils/db';

const FOLDER_HANDLE_KEY = 'localFolderHandle';

/**
 * 扫描文件夹，提取 MP3 元数据和 LRC 歌词
 */
async function scanFolder(handle: FileSystemDirectoryHandle): Promise<{ songs: Song[]; blobUrls: string[] }> {
    const blobUrls: string[] = [];

    // 第一遍：收集所有 LRC 文件
    const lrcMap = new Map<string, string>();
    for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.lrc')) {
            const file = await entry.getFile();
            const text = await file.text();
            const baseName = entry.name.replace(/\.lrc$/i, '');
            lrcMap.set(baseName, text);
        }
    }

    // 第二遍：处理 MP3 文件
    const songList: Song[] = [];
    for await (const entry of handle.values()) {
        if (entry.kind === 'file' && /\.mp3$/i.test(entry.name)) {
            const file = await entry.getFile();
            const baseName = entry.name.replace(/\.mp3$/i, '');

            let name = baseName;
            let artist = 'Unknown';
            let pic: string | undefined;

            // 读取 ID3 标签
            try {
                const metadata = await parseBuffer(new Uint8Array(await file.arrayBuffer()), file.type, { skipCovers: false });
                name = metadata.common.title || baseName;
                artist = metadata.common.artist || 'Unknown';

                // 提取专辑封面
                if (metadata.common.picture && metadata.common.picture.length > 0) {
                    const picture = metadata.common.picture[0];
                    const mimeType = picture.format || 'image/jpeg';
                    const data = new Uint8Array(picture.data);
                    const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    blobUrls.push(url);
                    pic = url;
                }
            } catch {
                // 读取失败时使用文件名作为标题
            }

            // 创建 MP3 的 blob URL
            const audioUrl = URL.createObjectURL(file);
            blobUrls.push(audioUrl);

            // 创建 LRC 的 blob URL（如果存在同名 LRC 文件）
            let lrcUrl: string | undefined;
            const lrcText = lrcMap.get(baseName);
            if (lrcText) {
                const lrcBlob = new Blob([lrcText], { type: 'text/plain;charset=utf-8' });
                lrcUrl = URL.createObjectURL(lrcBlob);
                blobUrls.push(lrcUrl);
            }

            songList.push({
                name,
                artist,
                url: audioUrl,
                pic,
                lrc: lrcUrl,
            });
        }
    }

    return { songs: songList, blobUrls };
}

/**
 * 本地文件夹 Hook
 * 使用 File System Access API 让用户选择文件夹，
 * 读取 MP3 文件的 ID3 标签和同名 LRC 歌词文件。
 * 文件夹句柄持久化到 IndexedDB，刷新页面后自动恢复。
 */
export const useLocalFolder = () => {
    const [folderName, setFolderName] = useState('');
    const [songs, setSongs] = useState<Song[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isRestored, setIsRestored] = useState(false);
    const blobUrlsRef = useRef<string[]>([]);

    // 清理所有 blob URL
    const cleanup = useCallback(() => {
        blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
        blobUrlsRef.current = [];
    }, []);

    // 从 handle 加载歌曲
    const loadFromHandle = useCallback(async (handle: FileSystemDirectoryHandle) => {
        setIsLoading(true);
        setError(null);
        cleanup();

        try {
            setFolderName(handle.name);
            const result = await scanFolder(handle);
            blobUrlsRef.current = result.blobUrls;

            if (result.songs.length === 0) {
                setError('未找到 MP3 文件');
            } else {
                setSongs(result.songs);
            }
        } catch (err: any) {
            setError(err.message || '读取文件夹失败');
        } finally {
            setIsLoading(false);
        }
    }, [cleanup]);

    // 启动时尝试恢复持久化的文件夹（不弹窗，直接尝试读取）
    useEffect(() => {
        (async () => {
            try {
                if (!('showDirectoryPicker' in window)) {
                    setIsRestored(true);
                    return;
                }

                const savedHandle = await dbGet<FileSystemDirectoryHandle>(FOLDER_HANDLE_KEY);
                if (!savedHandle) {
                    setIsRestored(true);
                    return;
                }

                // 直接尝试读取，权限有效则成功，失败则清除
                await loadFromHandle(savedHandle);
            } catch {
                await dbDelete(FOLDER_HANDLE_KEY);
            } finally {
                setIsRestored(true);
            }
        })();
    }, [loadFromHandle]);

    const selectFolder = useCallback(async () => {
        try {
            if (!('showDirectoryPicker' in window)) {
                throw new Error('您的浏览器不支持 File System Access API，请使用 Chrome 或 Edge');
            }

            const handle = await window.showDirectoryPicker();
            await dbSet(FOLDER_HANDLE_KEY, handle);
            await loadFromHandle(handle);
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                setError(err.message || '读取文件夹失败');
            }
        }
    }, [loadFromHandle]);

    const clearFolder = useCallback(async () => {
        cleanup();
        setFolderName('');
        setSongs([]);
        setError(null);
        await dbDelete(FOLDER_HANDLE_KEY);
    }, [cleanup]);

    return {
        folderName,
        songs,
        isLoading,
        error,
        isRestored,
        selectFolder,
        clearFolder,
    };
};