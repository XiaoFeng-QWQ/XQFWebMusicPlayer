import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Song, MusicInfo, LyricLine, VisualizerConfig } from '../types';
import { parseLRC } from '../utils/lyrics';
import { dbGet, dbSet } from '../utils/db';
import { cacheGet, cacheSet } from '../utils/cache';
import { debounce } from '../utils/debounce';

export type PlayMode = 'sequence' | 'single' | 'shuffle';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.xiaofengqwq.com';
const SEARCH_DEBOUNCE_MS = 150;
const FADE_DURATION = 0.25; // 音频淡入淡出时长（秒）

/**
 * 音乐播放器 Hook
 * 提供音乐播放控制、歌词同步、播放顺序、进度控制等功能
 * 使用 IndexedDB 持久化存储播放器状态
 */
export const useMusicPlayer = () => {
    // 两个独立的歌单，各自维护索引
    const [remotePlaylist, setRemotePlaylist] = useState<Song[]>([]);
    const [remoteIndex, setRemoteIndex] = useState(0);
    const [localPlaylist, setLocalPlaylist] = useState<Song[]>([]);
    const [localIndex, setLocalIndex] = useState(0);
    const [activePlaylistSource, setActivePlaylistSource] = useState<'remote' | 'local'>('remote');
    const activeSourceRef = useRef<'remote' | 'local'>('remote');

    // 当前的活跃歌单和索引（派生值）
    const playlist = activePlaylistSource === 'remote' ? remotePlaylist : localPlaylist;
    const playlistIndex = activePlaylistSource === 'remote' ? remoteIndex : localIndex;

    // 设置当前活跃歌单（供外部调用，同时切换 source）
    const setPlaylist = useCallback((songs: Song[], source?: 'remote' | 'local') => {
        const s = source ?? activeSourceRef.current;
        if (s === 'remote') {
            setRemotePlaylist(songs);
        } else {
            setLocalPlaylist(songs);
        }
        activeSourceRef.current = s;
        setActivePlaylistSource(s);
    }, []);

    // 设置当前活跃索引
    const setPlaylistIndex = useCallback((index: number | ((prev: number) => number)) => {
        const source = activeSourceRef.current;
        if (source === 'remote') {
            setRemoteIndex(index);
        } else {
            setLocalIndex(index);
        }
    }, []);

    const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
    const [isImmersive, setIsImmersive] = useState(false);
    const [expandedTab, setExpandedTab] = useState<'playlist' | 'lyrics'>('playlist');
    const [musicInfo, setMusicInfo] = useState<MusicInfo>({
        name: 'Loading...',
        artist: 'Please wait',
        pic: '',
        url: ''
    });
    const [isMusicPlaying, setIsMusicPlaying] = useState(false);
    const [playMode, setPlayMode] = useState<PlayMode>('sequence');
    const [playlistId, setPlaylistId] = useState('6634356386');
    const [playlistLoadKey, setPlaylistLoadKey] = useState(0);
    const [playlistIdInput, setPlaylistIdInput] = useState('6634356386');
    const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);

    // 歌词状态
    const [lyrics, setLyrics] = useState<LyricLine[]>([]);
    const [audioCurrentTime, setAudioCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);

    // 搜索状态（即时输入 + 防抖后搜索）
    const [songSearchInput, setSongSearchInput] = useState('');
    const [songSearch, setSongSearch] = useState('');
    const [lyricSearchInput, setLyricSearchInput] = useState('');
    const [lyricSearch, setLyricSearch] = useState('');

    // 音量状态
    const [volume, setVolume] = useState(0.7);

    // 频谱可视化配置
    const [visualizerConfig, setVisualizerConfig] = useState<VisualizerConfig>({
        style: 'bars',
        colorTheme: 'neutral',
        density: 1.0,
        thickness: 1.0,
    });

    // 是否已从 IndexedDB 恢复（用于延迟首次 API 请求）
    const [isRestored, setIsRestored] = useState(false);

    // DOM 元素引用
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lyricsContainerRef = useRef<HTMLDivElement>(null);
    const mobileLyricsContainerRef = useRef<HTMLDivElement>(null);
    const playlistContainerRef = useRef<HTMLDivElement>(null);
    const restoredProgressRef = useRef<number | null>(null);
    const mainRef = useRef<HTMLDivElement>(null);
    const songSearchInputRef = useRef<HTMLInputElement>(null);

    // 音频淡入淡出
    const fadeAnimRef = useRef<number>(0);

    // AudioContext + Analyser（音频分析和频谱可视化）
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const [analyserNode, setAnalyserNodeState] = useState<AnalyserNode | null>(null);
    const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

    // 当前歌曲标识（用于频谱组件 key，强制重挂载）
    const [songKey, setSongKey] = useState(0);

    const isPlayingRef = useRef(isMusicPlaying);
    useEffect(() => {
        isPlayingRef.current = isMusicPlaying;
    }, [isMusicPlaying]);

    // 音频淡入淡出工具（后台标签页自动跳过动画）
    const fadeTo = useCallback((targetVol: number, duration: number): Promise<void> => {
        return new Promise(resolve => {
            cancelAnimationFrame(fadeAnimRef.current);
            const audio = audioRef.current;
            if (!audio) { resolve(); return; }

            // 后台标签页 rAF 会暂停，直接设置音量避免卡死
            if (document.hidden) {
                audio.volume = targetVol;
                resolve();
                return;
            }

            const startVol = audio.volume;
            const startTime = performance.now();

            const step = () => {
                const elapsed = (performance.now() - startTime) / 1000;
                const progress = Math.min(elapsed / duration, 1);
                // easeInOutQuad
                const eased = progress < 0.5
                    ? 2 * progress * progress
                    : -1 + (4 - 2 * progress) * progress;
                audio.volume = startVol + (targetVol - startVol) * eased;

                if (progress < 1) {
                    fadeAnimRef.current = requestAnimationFrame(step);
                } else {
                    resolve();
                }
            };
            fadeAnimRef.current = requestAnimationFrame(step);
        });
    }, []);

    // 确保 AudioContext 运行并连接 AnalyserNode
    const ensureAudioContext = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;

        try {
            if (!audioCtxRef.current) {
                const Ctx = window.AudioContext || (window as any).webkitAudioContext;
                audioCtxRef.current = new Ctx();
            }
            const ctx = audioCtxRef.current;
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            if (!analyserRef.current) {
                analyserRef.current = ctx.createAnalyser();
                analyserRef.current.fftSize = 512;
                analyserRef.current.smoothingTimeConstant = 0.65;

                try {
                    sourceNodeRef.current = ctx.createMediaElementSource(audio);
                    sourceNodeRef.current.connect(analyserRef.current);
                    analyserRef.current.connect(ctx.destination);
                    setAnalyserNodeState(analyserRef.current);
                } catch {
                    // createMediaElementSource 失败（如已连接过或 CORS 问题）
                    analyserRef.current = null;
                    setAnalyserNodeState(null);
                }
            }
        } catch { /* 静默 */ }
    }, []);

    // 防抖搜索
    const debouncedSetSongSearch = useMemo(
        () => debounce((val: string) => setSongSearch(val), SEARCH_DEBOUNCE_MS),
        []
    );
    const debouncedSetLyricSearch = useMemo(
        () => debounce((val: string) => setLyricSearch(val), SEARCH_DEBOUNCE_MS),
        []
    );

    const handleSongSearchChange = useCallback((val: string) => {
        setSongSearchInput(val);
        debouncedSetSongSearch(val);
    }, [debouncedSetSongSearch]);

    const handleLyricSearchChange = useCallback((val: string) => {
        setLyricSearchInput(val);
        debouncedSetLyricSearch(val);
    }, [debouncedSetLyricSearch]);

    const clearSongSearch = useCallback(() => {
        setSongSearchInput('');
        setSongSearch('');
    }, []);

    const clearLyricSearch = useCallback(() => {
        setLyricSearchInput('');
        setLyricSearch('');
    }, []);

    // 从 IndexedDB 恢复持久化状态
    useEffect(() => {
        (async () => {
            const [savedPlaylistId, savedPlayMode, savedVolume, savedPlaylist, savedRemoteIndex, savedLocalIndex, savedActiveSource, savedProgress] = await Promise.all([
                dbGet<string>('playlistId'),
                dbGet<PlayMode>('playMode'),
                dbGet<number>('volume'),
                dbGet<Song[]>('playlist'),
                dbGet<number>('remotePlaylistIndex'),
                dbGet<number>('localPlaylistIndex'),
                dbGet<string>('activePlaylistSource'),
                dbGet<number>('progress'),
            ]);
            if (savedPlaylistId) {
                setPlaylistId(savedPlaylistId);
                setPlaylistIdInput(savedPlaylistId);
            }
            if (savedPlayMode) setPlayMode(savedPlayMode);
            if (typeof savedVolume === 'number') setVolume(savedVolume);

            // 恢复缓存的歌单数据（避免白屏等待 API）
            if (Array.isArray(savedPlaylist) && savedPlaylist.length > 0) {
                setRemotePlaylist(savedPlaylist);
                const idx = typeof savedRemoteIndex === 'number' && savedRemoteIndex < savedPlaylist.length
                    ? savedRemoteIndex
                    : 0;
                setRemoteIndex(idx);
                const song = savedPlaylist[idx];
                setMusicInfo({
                    name: song.name || 'Unknown',
                    artist: song.artist || 'Unknown',
                    pic: song.pic || '',
                    url: song.url || ''
                });
            }

            // 恢复本地歌单索引
            if (typeof savedLocalIndex === 'number') {
                setLocalIndex(savedLocalIndex);
            }

            // 恢复活跃歌单来源
            if (savedActiveSource === 'local' || savedActiveSource === 'remote') {
                activeSourceRef.current = savedActiveSource;
                setActivePlaylistSource(savedActiveSource);
            }

            // 恢复播放进度
            if (typeof savedProgress === 'number') {
                restoredProgressRef.current = savedProgress;
            }

            // 标记已从缓存恢复，避免 applyPlaylist 重置索引和歌曲信息
            if (Array.isArray(savedPlaylist) && savedPlaylist.length > 0) {
                initialLoadedRef.current = true;
            }

            setIsRestored(true);
        })();
    }, []);

    // 持久化播放模式
    useEffect(() => {
        dbSet('playMode', playMode);
    }, [playMode]);

    // 持久化音量
    useEffect(() => {
        dbSet('volume', volume);
    }, [volume]);

    // 持久化歌单ID
    useEffect(() => {
        dbSet('playlistId', playlistId);
    }, [playlistId]);

    // 持久化远端歌单当前播放索引
    useEffect(() => {
        if (isRestored) dbSet('remotePlaylistIndex', remoteIndex);
    }, [remoteIndex, isRestored]);

    // 持久化本地歌单当前播放索引
    useEffect(() => {
        if (isRestored) dbSet('localPlaylistIndex', localIndex);
    }, [localIndex, isRestored]);

    // 持久化活跃歌单来源
    useEffect(() => {
        if (isRestored) dbSet('activePlaylistSource', activePlaylistSource);
    }, [activePlaylistSource, isRestored]);

    // 是否已经根据恢复的歌单ID完成首次请求
    const initialLoadedRef = useRef(false);

    // 获取歌单列表（恢复完成后才请求，避免重复请求，带缓存）
    useEffect(() => {
        if (!isRestored) return;

        const cacheKey = `playlist:${playlistId}`;
        const cached = cacheGet<Song[]>(cacheKey);
        const applyPlaylist = (songs: Song[]) => {
            setRemotePlaylist(songs);
            activeSourceRef.current = 'remote';
            setActivePlaylistSource('remote');
            dbSet('playlist', songs);
            // 只有在首次加载或用户主动切换歌单ID时才跳到第 0 首
            if (!initialLoadedRef.current) {
                setRemoteIndex(0);
                const song = songs[0];
                if (song) {
                    setMusicInfo({
                        name: song.name || 'Unknown',
                        artist: song.artist || 'Unknown',
                        pic: song.pic || '',
                        url: song.url || ''
                    });
                }
                initialLoadedRef.current = true;
            }
        };

        if (cached) {
            applyPlaylist(cached);
            setIsLoadingPlaylist(false);
            return;
        }

        setIsLoadingPlaylist(true);
        fetch(`${API_BASE}/api/v1/music/playlist?server=netease&id=${playlistId}`)
            .then(r => r.json())
            .then(res => {
                if (res.code === 200 && Array.isArray(res.data) && res.data.length > 0) {
                    cacheSet(cacheKey, res.data);
                    applyPlaylist(res.data);
                } else {
                    setRemotePlaylist([]);
                    setRemoteIndex(0);
                    setMusicInfo({ name: 'No songs found', artist: 'Try another playlist ID', pic: '', url: '' });
                }
            })
            .catch(err => {
                console.error("Failed to fetch playlist", err);
                if (playlist.length === 0) {
                    const fallback = [
                        {
                            name: 'Solar Echoes',
                            artist: 'John Stanford',
                            url: `${API_BASE}/api/v1/music/url?server=netease&id=29753363`,
                            pic: `${API_BASE}/api/v1/music/pic?server=netease&id=6620159511974252`,
                            lrc: ''
                        }
                    ];
                    applyPlaylist(fallback);
                }
            })
            .finally(() => setIsLoadingPlaylist(false));
    }, [playlistId, playlistLoadKey, isRestored]);

    // 用户主动切换歌单 ID 时允许重置到第一首
    useEffect(() => {
        if (isRestored) {
            initialLoadedRef.current = false;
        }
    }, [playlistId, isRestored]);

    // 切换歌曲时更新信息和歌词，重置所有相关状态
    useEffect(() => {
        if (playlist.length > 0 && playlist[playlistIndex]) {
            const currentSong = playlist[playlistIndex];

            // 完全重置播放相关状态
            setLyrics([]);
            setCurrentLyricIndex(-1);
            setAudioCurrentTime(0);
            setAudioDuration(0);
            setLyricSearchInput('');
            setLyricSearch('');
            cancelAnimationFrame(fadeAnimRef.current);

            // 递增 songKey 强制频谱组件重挂载
            setSongKey(k => k + 1);

            setMusicInfo({
                name: currentSong.name || 'Unknown',
                artist: currentSong.artist || 'Unknown',
                pic: currentSong.pic || '',
                url: currentSong.url || ''
            });

            if (currentSong.lrc) {
                const cacheKey = `lyrics:${currentSong.lrc}`;
                const cached = cacheGet<string>(cacheKey, 30 * 60 * 1000);
                if (cached) {
                    setLyrics(parseLRC(cached));
                } else {
                    fetch(currentSong.lrc)
                        .then(r => r.text())
                        .then(text => {
                            cacheSet(cacheKey, text);
                            setLyrics(parseLRC(text));
                        })
                        .catch(() => {
                            setLyrics([]);
                        });
                }
            }
        }
    }, [playlistIndex, playlist]);

    // 音频播放器实例管理 - 复用同一个 Audio 实例，仅切换 src
    useEffect(() => {
        if (!musicInfo.url) return;

        if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.preload = 'auto';
            audioRef.current.crossOrigin = 'anonymous';
        }

        const audio = audioRef.current;
        audio.pause();
        audio.currentTime = 0;
        audio.src = musicInfo.url;
        audio.volume = isMusicPlaying ? 0 : volume;
        audio.loop = playMode === 'single';
        audio.load();

        const handleTimeUpdate = () => {
            setAudioCurrentTime(audio.currentTime);
        };

        const handleLoadedMetadata = () => {
            setAudioDuration(audio.duration);
            if (restoredProgressRef.current !== null && restoredProgressRef.current < audio.duration) {
                audio.currentTime = restoredProgressRef.current;
                setAudioCurrentTime(restoredProgressRef.current);
                restoredProgressRef.current = null;
            }
        };

        const handleEnded = () => {
            if (playMode === 'single') {
                return;
            }
            if (playMode === 'shuffle') {
                const randomIndex = Math.floor(Math.random() * playlist.length);
                setPlaylistIndex(randomIndex);
            } else {
                setPlaylistIndex(prev => (prev + 1) % playlist.length);
            }
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('ended', handleEnded);

        if (isMusicPlaying) {
            ensureAudioContext();
            audio.play()
                .then(() => fadeTo(volume, FADE_DURATION))
                .catch(() => setIsMusicPlaying(false));
        }

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('ended', handleEnded);
        };
    }, [musicInfo.url]);

    // 播放/暂停控制（带淡入淡出）
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isMusicPlaying) {
            if (audio.paused) {
                ensureAudioContext();
                audio.currentTime = audio.currentTime || 0;
                audio.volume = 0;
                audio.play()
                    .then(() => fadeTo(volume, FADE_DURATION))
                    .catch(() => setIsMusicPlaying(false));
            }
        } else {
            fadeTo(0, FADE_DURATION * 0.6).then(() => {
                if (audio && !isPlayingRef.current) {
                    audio.pause();
                    audio.volume = volume;
                    dbSet('progress', audio.currentTime);
                }
            });
        }
    }, [isMusicPlaying]);

    // 定期保存播放进度 + 切歌时保存
    useEffect(() => {
        if (!isMusicPlaying) return;
        const interval = setInterval(() => {
            if (audioRef.current) {
                dbSet('progress', audioRef.current.currentTime);
            }
        }, 5000);
        return () => {
            clearInterval(interval);
            if (audioRef.current) {
                dbSet('progress', audioRef.current.currentTime);
            }
        };
    }, [isMusicPlaying, musicInfo.url]);

    // 音量控制
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    // 系统媒体中心集成
    useEffect(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = isMusicPlaying ? 'playing' : 'paused';
        }
    }, [isMusicPlaying]);

    useEffect(() => {
        if ('mediaSession' in navigator && playlist.length > 0) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: musicInfo.name,
                artist: musicInfo.artist,
                album: 'XQF Music Player',
                artwork: musicInfo.pic ? [
                    { src: musicInfo.pic, sizes: '512x512', type: 'image/jpeg' }
                ] : []
            });

            navigator.mediaSession.setActionHandler('play', () => setIsMusicPlaying(true));
            navigator.mediaSession.setActionHandler('pause', () => setIsMusicPlaying(false));
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                setPlaylistIndex(prev => (prev - 1 + playlist.length) % playlist.length);
            });
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                setPlaylistIndex(prev => (prev + 1) % playlist.length);
            });
        }
    }, [musicInfo, playlist, playlistIndex]);

    // 计算当前高亮歌词行索引
    useEffect(() => {
        if (lyrics.length === 0) {
            setCurrentLyricIndex(-1);
            return;
        }
        let activeIdx = -1;
        for (let i = 0; i < lyrics.length; i++) {
            if (audioCurrentTime >= lyrics[i].time) {
                activeIdx = i;
            } else {
                break;
            }
        }
        setCurrentLyricIndex(activeIdx);
    }, [audioCurrentTime, lyrics]);

    // 歌词平滑滚动（搜索时不自动滚动，使用 rAF 确保 DOM 就绪）
    // 同时处理桌面端和移动端两个歌词容器
    useEffect(() => {
        if (currentLyricIndex === -1 || lyricSearch) return;

        const containers = [lyricsContainerRef.current, mobileLyricsContainerRef.current].filter(Boolean) as HTMLDivElement[];
        if (containers.length === 0) return;

        requestAnimationFrame(() => {
            for (const container of containers) {
                const activeEl = container.querySelector(`[data-index="${currentLyricIndex}"]`) as HTMLElement | null;
                if (activeEl) {
                    const containerRect = container.getBoundingClientRect();
                    const elRect = activeEl.getBoundingClientRect();
                    const targetScroll = container.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2);
                    container.scrollTo({
                        top: targetScroll,
                        behavior: 'smooth'
                    });
                }
            }
        });
    }, [currentLyricIndex, lyricSearch]);

    // 切换上一首/下一首
    const handleNextTrack = useCallback((e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (playlist.length === 0) return;
        setPlaylistIndex(prev => (prev + 1) % playlist.length);
    }, [playlist.length]);

    const handlePrevTrack = useCallback((e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (playlist.length === 0) return;
        setPlaylistIndex(prev => (prev - 1 + playlist.length) % playlist.length);
    }, [playlist.length]);

    // 选择特定歌曲（可指定来源切换活跃歌单）
    const selectSong = useCallback((index: number, source?: 'remote' | 'local') => {
        if (source) {
            activeSourceRef.current = source;
            setActivePlaylistSource(source);
        }
        setPlaylistIndex(index);
        if (!isMusicPlaying) {
            setIsMusicPlaying(true);
        }
    }, [isMusicPlaying]);

    // 切换播放模式
    const togglePlayMode = useCallback(() => {
        setPlayMode((prev: PlayMode) => {
            if (prev === 'sequence') return 'single';
            if (prev === 'single') return 'shuffle';
            return 'sequence';
        });
    }, []);

    // 进度条拖动
    const handleSeek = useCallback((time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setAudioCurrentTime(time);
        }
    }, []);

    // 歌词点击跳转
    const seekToLyric = useCallback((time: number) => {
        handleSeek(time);
        if (!isMusicPlaying) {
            setIsMusicPlaying(true);
        }
    }, [handleSeek, isMusicPlaying]);

    // 加载新歌单
    const loadPlaylist = useCallback((id: string) => {
        const trimmed = id.trim();
        if (!trimmed) return;
        setPlaylistIdInput(trimmed);
        setPlaylistId(trimmed);
        activeSourceRef.current = 'remote';
        setActivePlaylistSource('remote');
        setPlaylistLoadKey(k => k + 1);
    }, []);

    // 定位到歌曲（搜索后点击跳转，仅限远程歌单）
    const locateSong = useCallback((index: number) => {
        selectSong(index, 'remote');
        clearSongSearch();
        setTimeout(() => {
            if (playlistContainerRef.current) {
                const el = playlistContainerRef.current.querySelector(`[data-song-index="${index}"]`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }, 100);
    }, [selectSong, clearSongSearch]);

    // 定位到歌词（搜索后点击跳转）
    const locateLyric = useCallback((index: number) => {
        const lyric = lyrics[index];
        if (lyric) {
            seekToLyric(lyric.time);
            clearLyricSearch();
            setTimeout(() => {
                [lyricsContainerRef.current, mobileLyricsContainerRef.current].forEach(container => {
                    if (!container) return;
                    const el = container.querySelector(`[data-index="${index}"]`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                });
            }, 100);
        }
    }, [lyrics, seekToLyric, clearLyricSearch]);

    // 音量调整
    const volumeUp = useCallback(() => {
        setVolume(prev => Math.min(1, +(prev + 0.05).toFixed(2)));
    }, []);

    const volumeDown = useCallback(() => {
        setVolume(prev => Math.max(0, +(prev - 0.05).toFixed(2)));
    }, []);

    const toggleMute = useCallback(() => {
        setVolume(prev => prev === 0 ? 0.7 : 0);
    }, []);

    // 播放/暂停切换
    const togglePlay = useCallback(() => {
        if (playlist.length > 0) {
            setIsMusicPlaying(prev => !prev);
        }
    }, [playlist.length]);

    // 沉浸模式切换
    const toggleImmersive = useCallback(() => {
        setIsImmersive(prev => !prev);
    }, []);

    // 聚焦搜索框
    const focusSearch = useCallback(() => {
        songSearchInputRef.current?.focus();
    }, []);

    // 过滤后的歌曲列表
    const filteredPlaylist = useMemo(() =>
        songSearch.trim()
            ? playlist.map((song, idx) => ({ song, idx })).filter(({ song }) =>
                song.name.toLowerCase().includes(songSearch.toLowerCase().trim()) ||
                song.artist.toLowerCase().includes(songSearch.toLowerCase().trim())
            )
            : playlist.map((song, idx) => ({ song, idx })),
        [playlist, songSearch]
    );

    // 过滤后的歌词列表
    const filteredLyrics = useMemo(() =>
        lyricSearch.trim()
            ? lyrics.map((lyric, idx) => ({ lyric, idx })).filter(({ lyric }) =>
                lyric.text.toLowerCase().includes(lyricSearch.toLowerCase().trim())
            )
            : lyrics.map((lyric, idx) => ({ lyric, idx })),
        [lyrics, lyricSearch]
    );

    return {
        playlist,
        remotePlaylist,
        localPlaylist,
        activePlaylistSource,
        setPlaylist,
        playlistIndex,
        isPlaylistOpen,
        setIsPlaylistOpen,
        isImmersive,
        toggleImmersive,
        expandedTab,
        setExpandedTab,
        musicInfo,
        isMusicPlaying,
        setIsMusicPlaying,
        lyrics,
        currentLyricIndex,
        playMode,
        volume,
        setVolume,
        audioCurrentTime,
        audioDuration,
        playlistId,
        playlistIdInput,
        setPlaylistIdInput,
        isLoadingPlaylist,
        lyricsContainerRef,
        mobileLyricsContainerRef,
        playlistContainerRef,
        audioRef,
        mainRef,
        songSearchInputRef,
        songSearch: songSearchInput,
        setSongSearch: handleSongSearchChange,
        lyricSearch: lyricSearchInput,
        setLyricSearch: handleLyricSearchChange,
        clearSongSearch,
        clearLyricSearch,
        filteredPlaylist,
        filteredLyrics,
        handleNextTrack,
        handlePrevTrack,
        selectSong,
        togglePlayMode,
        handleSeek,
        seekToLyric,
        loadPlaylist,
        locateSong,
        locateLyric,
        togglePlay,
        volumeUp,
        volumeDown,
        toggleMute,
        focusSearch,
        // 频谱配置
        visualizerConfig,
        setVisualizerConfig,
        songKey,
        analyserNode,
    };
};