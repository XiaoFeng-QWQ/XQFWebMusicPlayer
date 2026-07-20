import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import Visualizer from './components/Visualizer';
import {
    Sun, Moon, Disc3, SkipBack, SkipForward, Play, Pause,
    Repeat, Repeat1, Shuffle, ListMusic, Volume2, Volume1, VolumeX,
    Search, Loader2, Music, X, Heart, History, FolderOpen, Download } from 'lucide-react';

import { useTheme } from './hooks/useTheme';
import { useMusicPlayer } from './hooks/useMusicPlayer';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFavorites, getSongKey } from './hooks/useFavorites';
import { useLocalFolder } from './hooks/useLocalFolder';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useTouchGestures } from './hooks/useTouchGestures';
import { useAccentColor } from './hooks/useAccentColor';

const SONG_ITEM_HEIGHT = 36;
const LYRIC_ITEM_HEIGHT = 28;
const VIRTUAL_OVERSCAN = 5;

const DOCK_PAGES = [
    { name: 'Player', icon: Disc3, id: 0, path: '/' },
    { name: 'Playlist', icon: ListMusic, id: 1, path: '/playlist' },
    { name: 'Favorites', icon: Heart, id: 2, path: '/favorites' },
    { name: 'My Lists', icon: FolderOpen, id: 3, path: '/mylists' },
];

function AppContent() {
    const [isMounted, setIsMounted] = useState(false);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const { isDark, toggleTheme } = useTheme();
    const musicPlayer = useMusicPlayer();
    const { favorites, playHistory, toggleFavorite, isFavorite, addToHistory } = useFavorites();
    const { folderName, songs: localSongs, isLoading: isFolderLoading, error: folderError, isRestored: isFolderRestored, selectFolder, clearFolder } = useLocalFolder();
    const { canInstall, promptInstall } = useInstallPrompt();
    const accentColor = useAccentColor(musicPlayer.musicInfo.pic);

    const safeLyricColor = useMemo(() => {
        if (!accentColor) return null;
        const hex = accentColor.replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        const srgb = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        const luminance = 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
        // dark 背景为 #0b0b0d (luminance≈0.0017), light 背景为 #fafafa (luminance≈0.965)
        const bgLum = isDark ? 0.0017 : 0.965;
        const contrast = (Math.max(luminance, bgLum) + 0.05) / (Math.min(luminance, bgLum) + 0.05);
        return contrast >= 4.5 ? accentColor : null;
    }, [accentColor, isDark]);

    const mainRef = useRef<HTMLDivElement>(null);
    const dockRef = useRef<HTMLDivElement>(null);
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;

    const [songScrollTop, setSongScrollTop] = useState(0);
    const [songContainerHeight, setSongContainerHeight] = useState(0);

    const [dockWidth, setDockWidth] = useState(240);
    const [dockMouseX, setDockMouseX] = useState<number | null>(null);

    const location = useLocation();
    const navigate = useNavigate();

    const getPageId = (path: string) => {
        if (path === '/playlist') return 1;
        if (path === '/favorites') return 2;
        if (path === '/mylists') return 3;
        return 0;
    };

    const resolvedPage = getPageId(location.pathname);
    const [currentPage, setCurrentPage] = useState(resolvedPage);
    const [prevPage, setPrevPage] = useState(resolvedPage);

    if (resolvedPage !== currentPage) {
        setPrevPage(currentPage);
        setCurrentPage(resolvedPage);
    }

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        const updateSongHeight = () => {
            if (musicPlayer.playlistContainerRef.current) {
                setSongContainerHeight(musicPlayer.playlistContainerRef.current.clientHeight);
            }
        };
        updateSongHeight();
        window.addEventListener('resize', updateSongHeight);
        return () => window.removeEventListener('resize', updateSongHeight);
    }, []);

    useEffect(() => {
        requestAnimationFrame(() => {
            if (currentPage === 1 && musicPlayer.playlistContainerRef.current) {
                setSongContainerHeight(musicPlayer.playlistContainerRef.current.clientHeight);
            }
        });
    }, [currentPage]);

    useEffect(() => {
        if (musicPlayer.playlist.length > 0 && musicPlayer.playlist[musicPlayer.playlistIndex]) {
            addToHistory(musicPlayer.playlist[musicPlayer.playlistIndex]);
        }
    }, [musicPlayer.playlistIndex, musicPlayer.playlist]);

    useKeyboardShortcuts(useMemo(() => ({
        onPlayPause: () => musicPlayer.togglePlay(),
        onNext: () => musicPlayer.handleNextTrack(),
        onPrev: () => musicPlayer.handlePrevTrack(),
        onVolumeUp: () => musicPlayer.volumeUp(),
        onVolumeDown: () => musicPlayer.volumeDown(),
        onToggleMute: () => musicPlayer.toggleMute(),
        onSearchFocus: () => musicPlayer.focusSearch(),
        onSeekForward: () => musicPlayer.handleSeek(Math.min(musicPlayer.audioCurrentTime + 5, musicPlayer.audioDuration)),
        onSeekBackward: () => musicPlayer.handleSeek(Math.max(musicPlayer.audioCurrentTime - 5, 0)),
    }), [musicPlayer]));

    useTouchGestures(mainRef, useMemo(() => ({
        onSwipeLeft: () => musicPlayer.handleNextTrack(),
        onSwipeRight: () => musicPlayer.handlePrevTrack(),
        onSwipeUp: () => musicPlayer.volumeUp(),
        onSwipeDown: () => musicPlayer.volumeDown(),
    }), [musicPlayer]));

    const handleMouseMove = (e: React.MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });
    };

    const handleDockMouseEnter = () => {
        if (dockRef.current) {
            setDockWidth(dockRef.current.getBoundingClientRect().width);
        }
    };

    const handleDockMouseMove = (e: React.MouseEvent) => {
        if (!dockRef.current) return;
        const rect = dockRef.current.getBoundingClientRect();
        setDockMouseX(e.clientX - rect.left);
    };

    const getDynamicScaleStyle = (index: number) => {
        if (dockMouseX === null) return {};
        const itemCenter = (index + 0.5) * (dockWidth / DOCK_PAGES.length);
        const distance = Math.abs(dockMouseX - itemCenter);
        const maxScale = 0.12;
        const stdDev = 35;
        const scale = 1 + maxScale * Math.exp(-Math.pow(distance, 2) / (2 * Math.pow(stdDev, 2)));
        const translateY = (scale - 1) * -22;
        return {
            transform: `scale(${scale}) translateY(${translateY}px)`
        };
    };

    const getPageClass = (pageId: number) => {
        const isActive = currentPage === pageId;
        const baseClass = "w-full";

        if (currentPage === prevPage) {
            return isActive ? `${baseClass} relative z-10` : 'hidden';
        }

        const isPrevPage = prevPage === pageId;
        if (!isActive && !isPrevPage) {
            return 'hidden';
        }

        if (isActive) {
            const isForward = currentPage > prevPage;
            return `${baseClass} relative z-10 ${isForward ? 'animate-slide-up' : 'animate-slide-down'}`;
        }

        const isForward = currentPage > prevPage;
        if (isForward) {
            return `${baseClass} opacity-0 absolute inset-x-0 top-0 pointer-events-none z-0 animate-slide-out-up`;
        } else {
            return `${baseClass} opacity-0 absolute inset-x-0 top-0 pointer-events-none z-0 animate-slide-out-down`;
        }
    };

    const formatTime = (seconds: number): string => {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const progressPercent = musicPlayer.audioDuration > 0
        ? (musicPlayer.audioCurrentTime / musicPlayer.audioDuration) * 100
        : 0;

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        musicPlayer.handleSeek(percent * musicPlayer.audioDuration);
    };

    const handleProgressKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'ArrowRight') {
            musicPlayer.handleSeek(Math.min(musicPlayer.audioDuration, musicPlayer.audioCurrentTime + 5));
        } else if (e.key === 'ArrowLeft') {
            musicPlayer.handleSeek(Math.max(0, musicPlayer.audioCurrentTime - 5));
        }
    };

    const getVolumeIcon = () => {
        if (musicPlayer.volume === 0) return <VolumeX size={14} aria-hidden="true" />;
        if (musicPlayer.volume < 0.5) return <Volume1 size={14} aria-hidden="true" />;
        return <Volume2 size={14} aria-hidden="true" />;
    };

    const getPlayModeIcon = () => {
        switch (musicPlayer.playMode) {
            case 'single': return <Repeat1 size={14} aria-hidden="true" />;
            case 'shuffle': return <Shuffle size={14} aria-hidden="true" />;
            default: return <Repeat size={14} aria-hidden="true" />;
        }
    };

    const getPlayModeTitle = () => {
        switch (musicPlayer.playMode) {
            case 'single': return '单曲循环';
            case 'shuffle': return '随机播放';
            default: return '顺序播放';
        }
    };

    const filteredRemotePlaylist = useMemo(() => {
        const search = musicPlayer.songSearch.trim().toLowerCase();
        const list = musicPlayer.remotePlaylist;
        if (!search) return list.map((song, idx) => ({ song, idx }));
        return list
            .map((song, idx) => ({ song, idx }))
            .filter(({ song }) =>
                song.name.toLowerCase().includes(search) ||
                song.artist.toLowerCase().includes(search)
            );
    }, [musicPlayer.remotePlaylist, musicPlayer.songSearch]);

    const virtualSongList = useMemo(() => {
        const items = filteredRemotePlaylist;
        const totalHeight = items.length * SONG_ITEM_HEIGHT;
        const startIdx = Math.max(0, Math.floor(songScrollTop / SONG_ITEM_HEIGHT) - VIRTUAL_OVERSCAN);
        const endIdx = Math.min(
            items.length,
            Math.ceil((songScrollTop + songContainerHeight) / SONG_ITEM_HEIGHT) + VIRTUAL_OVERSCAN
        );
        const visibleItems = items.slice(startIdx, endIdx);
        const offsetY = startIdx * SONG_ITEM_HEIGHT;
        return { totalHeight, visibleItems, startIdx, offsetY };
    }, [filteredRemotePlaylist, songScrollTop, songContainerHeight]);

    const handleSongScroll = useCallback(() => {
        if (musicPlayer.playlistContainerRef.current) setSongScrollTop(musicPlayer.playlistContainerRef.current.scrollTop);
    }, []);

    const cardHover = 'transition-all duration-700 hover:border-neutral-300 dark:hover:border-white/8';

    return (
        <div
            ref={mainRef}
            onMouseMove={handleMouseMove}
            className={`min-h-screen w-full relative flex flex-col items-center text-neutral-900 dark:text-white transition-colors duration-1000 selection:bg-neutral-200 dark:selection:bg-neutral-800 overflow-hidden ${accentColor ? '' : 'bg-[#fafafa] dark:bg-[#0b0b0d]'}`}
            role="application"
            aria-label="XQF 音乐播放器"
            style={accentColor ? {
                background: isDark
                    ? `color-mix(in srgb, #0b0b0d 99%, ${accentColor} 1%)`
                    : `color-mix(in srgb, #fafafa 97%, ${accentColor} 3%)`
            } : undefined}
        >
            <div
                className={`absolute inset-0 bg-[linear-gradient(to_right,#80808005_1px,transparent_1px),linear-gradient(to_bottom,#80808005_1px,transparent_1px)] bg-size-[40px_40px] mask-[radial-gradient(ellipse_50%_40%_at_50%_50%,#000_60%,transparent_100%)] pointer-events-none transition-opacity duration-1500 ${isMounted ? 'opacity-100' : 'opacity-0'}`}
                aria-hidden="true"
            />

            <div
                className="absolute inset-0 pointer-events-none transition-opacity duration-1000 opacity-100 dark:opacity-40"
                style={{
                    background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, ${isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.008)'}, transparent 80%)`
                }}
                aria-hidden="true"
            />

            <header
                className={`relative z-10 w-full max-w-md sm:max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 flex justify-between items-center py-4 select-none transition-all duration-1000 ${isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}
                role="banner"
            >
                <div className="flex items-center gap-2">
                    <Disc3 size={16} className="text-neutral-400" aria-hidden="true" />
                    <span className="text-[10px] tracking-[0.25em] uppercase font-semibold text-neutral-400 hidden sm:inline">
                        XQF Music Player
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-[10px] text-neutral-400 font-mono hidden sm:inline" aria-live="polite">
                        {musicPlayer.playlist.length > 0 && `${musicPlayer.playlistIndex + 1} / ${musicPlayer.playlist.length}`}
                    </span>
                    {canInstall && (
                        <button
                            onClick={promptInstall}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-medium hover:bg-blue-500/20 dark:hover:bg-blue-500/30 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500"
                            title="安装为应用"
                            aria-label="安装为应用"
                        >
                            <Download size={12} aria-hidden="true" />
                            <span className="hidden sm:inline">安装应用</span>
                        </button>
                    )}
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-full hover:bg-neutral-200/50 dark:hover:bg-white/6 text-neutral-400 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 dark:focus:ring-offset-[#0b0b0d]"
                        title={isDark ? '切换浅色模式' : '切换深色模式'}
                        aria-label={isDark ? '切换浅色模式' : '切换深色模式'}
                    >
                        {isDark ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
                    </button>
                </div>
            </header>

            <div className="relative w-full max-w-md sm:max-w-2xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 sm:px-6 my-auto py-8 pb-32 min-h-[70vh]">

                <div className={getPageClass(0)}>
                    <div className="hidden lg:flex justify-center items-stretch gap-10 w-full lg:h-96">
                        {/* 左侧：歌曲信息 */}
                        <div className={`flex-1 max-w-115 p-6 rounded-3xl bg-white/70 dark:bg-white/3.5 border border-neutral-200/50 dark:border-white/6 backdrop-blur-md flex flex-col ${cardHover} select-none`}
                            role="region" aria-label="正在播放">
                            <div className="flex flex-col gap-4 h-full">
                                {/* 封面 */}
                                <div className="flex items-center gap-5 w-full">
                                    <div className="relative shrink-0">
                                        {accentColor && isDark && (
                                            <div className="absolute -inset-4 rounded-4xl pointer-events-none z-0"
                                                style={{ background: `radial-gradient(circle at center, ${accentColor}0D 0%, transparent 70%)` }}
                                                aria-hidden="true"
                                            />
                                        )}
                                        <div className="relative w-36 h-36 rounded-3xl overflow-hidden shadow-lg z-10">
                                            {musicPlayer.musicInfo.pic ? (
                                                <img src={musicPlayer.musicInfo.pic} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-neutral-200 dark:bg-white/6 flex items-center justify-center">
                                                    <Music size={36} className="text-neutral-400" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div key={`info-${musicPlayer.musicInfo.url}`} className="animate-song-change flex-1 min-w-0">
                                        <h2 className="text-xl lg:text-2xl font-light text-neutral-800 dark:text-neutral-200 truncate transition-colors duration-700">
                                            {musicPlayer.musicInfo.name}
                                        </h2>
                                        <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1 transition-colors duration-700 truncate">
                                            {musicPlayer.musicInfo.artist}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1 select-none w-full">
                                    <div
                                        className="w-full h-1 sm:h-1.5 rounded-full bg-neutral-200/80 dark:bg-white/8 cursor-pointer group/progress relative overflow-hidden"
                                        onClick={handleProgressClick}
                                        onKeyDown={handleProgressKeyDown}
                                        role="slider"
                                        tabIndex={0}
                                        aria-label="播放进度"
                                        aria-valuemin={0}
                                        aria-valuemax={musicPlayer.audioDuration}
                                        aria-valuenow={musicPlayer.audioCurrentTime}
                                        aria-valuetext={`${formatTime(musicPlayer.audioCurrentTime)} / ${formatTime(musicPlayer.audioDuration)}`}
                                    >
                                        <div className={`h-full rounded-full transition-all duration-200 group-hover/progress:bg-neutral-900 dark:group-hover/progress:bg-white ${accentColor ? '' : 'bg-neutral-600 dark:bg-neutral-400'}`} style={{ width: `${progressPercent}%`, ...(accentColor ? { background: accentColor } : {}) }} />
                                        <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-neutral-900 dark:bg-white opacity-0 group-hover/progress:opacity-100 transition-opacity" style={{ left: `calc(${progressPercent}% - 5px)` }} />
                                    </div>
                                    <div className="flex justify-between text-[9px] sm:text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
                                        <span>{formatTime(musicPlayer.audioCurrentTime)}</span>
                                        <span>{formatTime(musicPlayer.audioDuration)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-start gap-3 sm:gap-4 w-full" role="toolbar" aria-label="播放控制">
                                    <button onClick={musicPlayer.togglePlayMode}
                                        className={`p-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 ${musicPlayer.playMode !== 'sequence' ? 'text-neutral-900 dark:text-white bg-neutral-200/50 dark:bg-white/10' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}`}
                                        title={getPlayModeTitle()} aria-label={`播放模式: ${getPlayModeTitle()}`}>
                                        {getPlayModeIcon()}
                                    </button>
                                    <button onClick={musicPlayer.handlePrevTrack}
                                        className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500"
                                        title="上一首" aria-label="上一首">
                                        <SkipBack size={18} aria-hidden="true" />
                                    </button>
                                    <button onClick={musicPlayer.togglePlay}
                                        className="p-3 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all shadow-md hover:shadow-lg active:scale-95 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 dark:focus:ring-offset-[#0b0b0d]"
                                        title={musicPlayer.isMusicPlaying ? '暂停' : '播放'} aria-label={musicPlayer.isMusicPlaying ? '暂停' : '播放'}>
                                        {musicPlayer.isMusicPlaying ? <Pause size={18} aria-hidden="true" /> : <Play size={18} className="ml-0.5" aria-hidden="true" />}
                                    </button>
                                    <button onClick={musicPlayer.handleNextTrack}
                                        className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500"
                                        title="下一首" aria-label="下一首">
                                        <SkipForward size={18} aria-hidden="true" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            const song = musicPlayer.playlist[musicPlayer.playlistIndex];
                                            if (song) toggleFavorite(song);
                                        }}
                                        className={`p-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 ${isFavorite(musicPlayer.musicInfo) ? 'text-red-500 dark:text-red-400' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}`}
                                        title={isFavorite(musicPlayer.musicInfo) ? '取消收藏' : '收藏'} aria-label={isFavorite(musicPlayer.musicInfo) ? '取消收藏' : '收藏'}>
                                        <Heart size={16} fill={isFavorite(musicPlayer.musicInfo) ? 'currentColor' : 'none'} aria-hidden="true" />
                                    </button>
                                    <div className="flex items-center gap-1.5 ml-auto" role="group" aria-label="音量控制">
                                        <button onClick={musicPlayer.toggleMute}
                                            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 rounded-full"
                                            title={musicPlayer.volume === 0 ? '取消静音' : '静音'} aria-label={musicPlayer.volume === 0 ? '取消静音' : '静音'}>
                                            {getVolumeIcon()}
                                        </button>
                                        <input type="range" min="0" max="1" step="0.01" value={musicPlayer.volume}
                                            onChange={(e) => musicPlayer.setVolume(parseFloat(e.target.value))}
                                            className="w-12 sm:w-16 h-1 rounded-full appearance-none bg-neutral-200/80 dark:bg-white/8 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-neutral-600 dark:[&::-webkit-slider-thumb]:bg-neutral-400 [&::-webkit-slider-thumb]:cursor-pointer hover:[&::-webkit-slider-thumb]:bg-neutral-900 dark:hover:[&::-webkit-slider-thumb]:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500"
                                            aria-label="音量" title={`音量: ${Math.round(musicPlayer.volume * 100)}%`} />
                                    </div>
                                </div>
                                {/* 底部柱状频谱 */}
                                <div className="w-full h-8 overflow-hidden rounded-lg mt-auto">
                                    <Visualizer
                                        isPlaying={musicPlayer.isMusicPlaying}
                                        config={{ style: 'bars', colorTheme: 'neutral', density: 1.5, thickness: 0.8 }}
                                        analyserNode={musicPlayer.analyserNode}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 右侧：歌词 */}
                        <div className={`flex-1 max-w-115 p-4 rounded-3xl bg-white/70 dark:bg-white/3.5 border border-neutral-200/50 dark:border-white/6 backdrop-blur-md flex flex-col ${cardHover}`}
                            role="region" aria-label="歌词">
                            {/* 搜索栏 */}
                            <div className="shrink-0 flex items-center gap-2 border-b border-neutral-200/20 dark:border-white/4 pb-3 mb-3">
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <Music size={12} className="text-neutral-400" aria-hidden="true" />
                                    <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400">Lyrics</span>
                                </div>
                                <div className="relative flex-1 ml-auto">
                                    <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
                                    <input type="text" value={musicPlayer.lyricSearch} onChange={(e) => musicPlayer.setLyricSearch(e.target.value)} placeholder="搜索歌词..."
                                        className="w-full pl-6 pr-5 py-0.5 text-[10px] bg-neutral-100/50 dark:bg-white/4 rounded-md text-neutral-700 dark:text-neutral-300 outline-none placeholder:text-neutral-400/50 transition-colors focus:bg-neutral-100/80 dark:focus:bg-white/6 focus:ring-1 focus:ring-neutral-400/50"
                                        aria-label="搜索歌词" />
                                    {musicPlayer.lyricSearch && (
                                        <button onClick={musicPlayer.clearLyricSearch} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors" aria-label="清除搜索">
                                            <X size={10} aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div ref={musicPlayer.lyricsContainerRef} className="flex-1 overflow-y-auto min-h-0 scrollbar-none" role="list" aria-label="歌词列表">
                                {musicPlayer.lyrics.length > 0 ? (
                                    musicPlayer.filteredLyrics.length > 0 ? (
                                        musicPlayer.filteredLyrics.map(({ lyric, idx }) => {
                                            const isActive = idx === musicPlayer.currentLyricIndex && !musicPlayer.lyricSearch;
                                            return (
                                                <p key={idx} data-index={idx} onClick={() => musicPlayer.locateLyric(idx)}
                                                    className={`text-[11px] transition-all duration-300 px-3 leading-relaxed cursor-pointer truncate text-center ${isActive ? (safeLyricColor ? 'font-semibold scale-105' : 'text-neutral-900 dark:text-white font-semibold scale-105') : 'text-neutral-400/50 dark:text-neutral-600/50 hover:text-neutral-600 dark:hover:text-neutral-400'}`}
                                                    style={{ height: LYRIC_ITEM_HEIGHT, ...(isActive && safeLyricColor ? { color: safeLyricColor } : {}) }} role="listitem" aria-current={isActive ? 'true' : undefined}>
                                                    {lyric.text}
                                                </p>
                                            );
                                        })
                                    ) : (
                                        <div className="flex items-center justify-center py-6"><p className="text-[11px] text-neutral-400/50 dark:text-neutral-600/50 italic" role="status">无匹配歌词</p></div>
                                    )
                                ) : (
                                    <div className="flex items-center justify-center h-full py-6"><p className="text-[11px] text-neutral-400/50 dark:text-neutral-600/50 italic" role="status">{musicPlayer.playlist.length === 0 ? 'No song selected' : 'No lyrics available'}</p></div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex lg:hidden flex-col gap-4">
                        <div className={`p-4 sm:p-5 rounded-3xl bg-white/50 dark:bg-white/2.5 border border-neutral-200/50 dark:border-white/5 backdrop-blur-sm select-none ${cardHover} ${isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                            role="region" aria-label="正在播放">
                            <div className="flex flex-col items-center gap-4">
                                <div className="flex items-center gap-3 w-full">
                                    <div className="relative shrink-0">
                                        {accentColor && isDark && (
                                            <div className="absolute -inset-2 rounded-xl pointer-events-none z-0"
                                                style={{ background: `radial-gradient(circle at center, ${accentColor}0D 0%, transparent 70%)` }}
                                                aria-hidden="true"
                                            />
                                        )}
                                        {musicPlayer.musicInfo.pic ? (
                                            <img
                                                key={`cover-mb-${musicPlayer.musicInfo.pic}`}
                                                src={musicPlayer.musicInfo.pic}
                                                alt="封面"
                                                className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover shadow-sm z-10"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        ) : (
                                            <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-lg shadow-sm z-10 bg-neutral-200 dark:bg-white/6 flex items-center justify-center">
                                                <Music size={16} className="text-neutral-400" />
                                            </div>
                                        )}
                                    </div>
                                    <div key={`info-mb-${musicPlayer.musicInfo.url}`} className="min-w-0 animate-song-change">
                                        <h2 className="text-lg sm:text-xl font-light text-neutral-800 dark:text-neutral-200 truncate transition-colors duration-700">
                                            {musicPlayer.musicInfo.name}
                                        </h2>
                                        <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-500 mt-0.5 transition-colors duration-700">
                                            {musicPlayer.musicInfo.artist}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1 select-none w-full">
                                    <div
                                        className="w-full h-1 sm:h-1.5 rounded-full bg-neutral-200/80 dark:bg-white/8 cursor-pointer group/progress relative overflow-hidden"
                                        onClick={handleProgressClick}
                                        onKeyDown={handleProgressKeyDown}
                                        role="slider"
                                        tabIndex={0}
                                        aria-label="播放进度"
                                        aria-valuemin={0}
                                        aria-valuemax={musicPlayer.audioDuration}
                                        aria-valuenow={musicPlayer.audioCurrentTime}
                                        aria-valuetext={`${formatTime(musicPlayer.audioCurrentTime)} / ${formatTime(musicPlayer.audioDuration)}`}
                                    >
                                        <div className={`h-full rounded-full transition-all duration-200 group-hover/progress:bg-neutral-900 dark:group-hover/progress:bg-white ${accentColor ? '' : 'bg-neutral-600 dark:bg-neutral-400'}`} style={{ width: `${progressPercent}%`, ...(accentColor ? { background: accentColor } : {}) }} />
                                        <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-neutral-900 dark:bg-white opacity-0 group-hover/progress:opacity-100 transition-opacity" style={{ left: `calc(${progressPercent}% - 5px)` }} />
                                    </div>
                                    <div className="flex justify-between text-[9px] sm:text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
                                        <span>{formatTime(musicPlayer.audioCurrentTime)}</span>
                                        <span>{formatTime(musicPlayer.audioDuration)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-center gap-3 sm:gap-4 w-full flex-wrap" role="toolbar" aria-label="播放控制">
                                    <button onClick={musicPlayer.togglePlayMode}
                                        className={`p-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 ${musicPlayer.playMode !== 'sequence' ? 'text-neutral-900 dark:text-white bg-neutral-200/50 dark:bg-white/10' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}`}
                                        title={getPlayModeTitle()} aria-label={`播放模式: ${getPlayModeTitle()}`}>
                                        {getPlayModeIcon()}
                                    </button>
                                    <button onClick={musicPlayer.handlePrevTrack}
                                        className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500"
                                        title="上一首" aria-label="上一首">
                                        <SkipBack size={18} aria-hidden="true" />
                                    </button>
                                    <button onClick={musicPlayer.togglePlay}
                                        className="p-3 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all shadow-md hover:shadow-lg active:scale-95 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 focus:ring-offset-2 dark:focus:ring-offset-[#0b0b0d]"
                                        title={musicPlayer.isMusicPlaying ? '暂停' : '播放'} aria-label={musicPlayer.isMusicPlaying ? '暂停' : '播放'}>
                                        {musicPlayer.isMusicPlaying ? <Pause size={18} aria-hidden="true" /> : <Play size={18} className="ml-0.5" aria-hidden="true" />}
                                    </button>
                                    <button onClick={musicPlayer.handleNextTrack}
                                        className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500"
                                        title="下一首" aria-label="下一首">
                                        <SkipForward size={18} aria-hidden="true" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            const song = musicPlayer.playlist[musicPlayer.playlistIndex];
                                            if (song) toggleFavorite(song);
                                        }}
                                        className={`p-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 ${isFavorite(musicPlayer.musicInfo) ? 'text-red-500 dark:text-red-400' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}`}
                                        title={isFavorite(musicPlayer.musicInfo) ? '取消收藏' : '收藏'} aria-label={isFavorite(musicPlayer.musicInfo) ? '取消收藏' : '收藏'}>
                                        <Heart size={16} fill={isFavorite(musicPlayer.musicInfo) ? 'currentColor' : 'none'} aria-hidden="true" />
                                    </button>
                                    <div className="flex items-center gap-1.5" role="group" aria-label="音量控制">
                                        <button onClick={musicPlayer.toggleMute}
                                            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500 rounded-full"
                                            title={musicPlayer.volume === 0 ? '取消静音' : '静音'} aria-label={musicPlayer.volume === 0 ? '取消静音' : '静音'}>
                                            {getVolumeIcon()}
                                        </button>
                                        <input type="range" min="0" max="1" step="0.01" value={musicPlayer.volume}
                                            onChange={(e) => musicPlayer.setVolume(parseFloat(e.target.value))}
                                            className="w-12 sm:w-16 h-1 rounded-full appearance-none bg-neutral-200/80 dark:bg-white/12 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-neutral-600 dark:[&::-webkit-slider-thumb]:bg-neutral-400 [&::-webkit-slider-thumb]:cursor-pointer hover:[&::-webkit-slider-thumb]:bg-neutral-900 dark:hover:[&::-webkit-slider-thumb]:bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500"
                                            aria-label="音量" title={`音量: ${Math.round(musicPlayer.volume * 100)}%`} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={`p-3 sm:p-4 rounded-2xl bg-white/50 dark:bg-white/2.5 border border-neutral-200/50 dark:border-white/5 backdrop-blur-sm h-52 flex flex-col transition-all duration-700 ${isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                            role="region" aria-label="歌词">
                            <div className="flex flex-nowrap items-center gap-2 border-b border-neutral-200/20 dark:border-white/4 pb-2 mb-2 shrink-0">
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <Music size={12} className="text-neutral-400" aria-hidden="true" />
                                    <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400">Lyrics</span>
                                </div>
                                <div className="relative flex-1 ml-auto">
                                    <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
                                    <input type="text" value={musicPlayer.lyricSearch} onChange={(e) => musicPlayer.setLyricSearch(e.target.value)} placeholder="搜索歌词..."
                                        className="w-full pl-6 pr-5 py-0.5 text-[10px] bg-neutral-100/50 dark:bg-white/4 rounded-md text-neutral-700 dark:text-neutral-300 outline-none placeholder:text-neutral-400/50 transition-colors focus:bg-neutral-100/80 dark:focus:bg-white/6 focus:ring-1 focus:ring-neutral-400/50"
                                        aria-label="搜索歌词" />
                                    {musicPlayer.lyricSearch && (
                                        <button onClick={musicPlayer.clearLyricSearch} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors" aria-label="清除搜索">
                                            <X size={10} aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div ref={musicPlayer.mobileLyricsContainerRef} className="flex-1 overflow-y-auto min-h-0 scrollbar-none" role="list" aria-label="歌词列表">
                                {musicPlayer.lyrics.length > 0 ? (
                                    musicPlayer.filteredLyrics.length > 0 ? (
                                        musicPlayer.filteredLyrics.map(({ lyric, idx }) => {
                                            const isActive = idx === musicPlayer.currentLyricIndex && !musicPlayer.lyricSearch;
                                            return (
                                                <p key={idx} data-index={idx} onClick={() => musicPlayer.locateLyric(idx)}
                                                    className={`text-[11px] transition-all duration-300 px-3 leading-relaxed cursor-pointer truncate text-center ${isActive ? (safeLyricColor ? 'font-semibold scale-105' : 'text-neutral-900 dark:text-white font-semibold scale-105') : 'text-neutral-400/50 dark:text-neutral-600/50 hover:text-neutral-600 dark:hover:text-neutral-400'}`}
                                                    style={{ height: LYRIC_ITEM_HEIGHT, ...(isActive && safeLyricColor ? { color: safeLyricColor } : {}) }} role="listitem" aria-current={isActive ? 'true' : undefined}>
                                                    {lyric.text}
                                                </p>
                                            );
                                        })
                                    ) : (
                                        <div className="flex items-center justify-center py-6"><p className="text-[11px] text-neutral-400/50 dark:text-neutral-600/50 italic" role="status">无匹配歌词</p></div>
                                    )
                                ) : (
                                    <div className="flex items-center justify-center h-full py-6"><p className="text-[11px] text-neutral-400/50 dark:text-neutral-600/50 italic" role="status">{musicPlayer.playlist.length === 0 ? 'No song selected' : 'No lyrics available'}</p></div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={getPageClass(1)}>
                    <div className="flex flex-col gap-3 sm:gap-4">
                        <div className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-2xl bg-white/30 dark:bg-white/1.5 border border-neutral-200/40 dark:border-white/4 ${cardHover} select-none`}>
                            <Search size={12} className="text-neutral-400 shrink-0" aria-hidden="true" />
                            <label htmlFor="playlist-id-input" className="sr-only">网易云歌单ID</label>
                            <input id="playlist-id-input" type="text" value={musicPlayer.playlistIdInput}
                                onChange={(e) => musicPlayer.setPlaylistIdInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') musicPlayer.loadPlaylist(musicPlayer.playlistIdInput); }}
                                placeholder="输入网易云歌单ID..." className="flex-1 bg-transparent text-xs text-neutral-700 dark:text-neutral-300 outline-none placeholder:text-neutral-400/50 min-w-0" aria-label="网易云歌单ID" />
                            <button onClick={() => musicPlayer.loadPlaylist(musicPlayer.playlistIdInput)}
                                disabled={musicPlayer.isLoadingPlaylist || !musicPlayer.playlistIdInput.trim()}
                                className="px-3 py-1 rounded-lg bg-neutral-200/60 dark:bg-white/8 text-[10px] font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-300/60 dark:hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:focus:ring-neutral-500" aria-label="加载歌单">
                                {musicPlayer.isLoadingPlaylist ? 'Loading...' : 'Load'}
                            </button>
                        </div>

                        <div className={`flex flex-col p-3 sm:p-4 rounded-2xl bg-white/40 dark:bg-white/2 border border-neutral-200/50 dark:border-white/5 ${cardHover} lg:h-96`} role="region" aria-label="歌单">
                                <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 border-b border-neutral-200/20 dark:border-white/4 pb-2 mb-2 shrink-0">
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <ListMusic size={12} className="text-neutral-400" aria-hidden="true" />
                                        <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400">Playlist</span>
                                        {musicPlayer.isLoadingPlaylist && <Loader2 size={10} className="text-neutral-400 animate-spin" aria-label="加载中" />}
                                    </div>
                                    <div className="relative w-full lg:flex-1">
                                        <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
                                        <input ref={musicPlayer.songSearchInputRef} type="text" value={musicPlayer.songSearch}
                                            onChange={(e) => musicPlayer.setSongSearch(e.target.value)} placeholder="搜索歌曲..."
                                            className="w-full pl-6 pr-5 py-0.5 text-[10px] bg-neutral-100/50 dark:bg-white/4 rounded-md text-neutral-700 dark:text-neutral-300 outline-none placeholder:text-neutral-400/50 transition-colors focus:bg-neutral-100/80 dark:focus:bg-white/6 focus:ring-1 focus:ring-neutral-400/50"
                                            aria-label="搜索歌曲" />
                                        {musicPlayer.songSearch && (
                                            <button onClick={musicPlayer.clearSongSearch} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors" aria-label="清除搜索">
                                                <X size={10} aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>
                                    <span className="text-[9px] text-neutral-400 font-mono shrink-0 w-full lg:w-auto text-right lg:text-left">{musicPlayer.remotePlaylist.length} songs</span>
                                </div>
                                <div ref={musicPlayer.playlistContainerRef} onScroll={handleSongScroll} className="flex-1 overflow-y-auto min-h-0 max-h-48 lg:max-h-none scrollbar-none" role="listbox" aria-label="歌曲列表">
                                    {musicPlayer.remotePlaylist.length > 0 ? (
                                        filteredRemotePlaylist.length > 0 ? (
                                            <div style={{ height: virtualSongList.totalHeight, position: 'relative' }}>
                                                <div style={{ position: 'absolute', top: virtualSongList.offsetY, left: 0, right: 0 }}>
                                                    {virtualSongList.visibleItems.map(({ song, idx }) => (
                                                        <div key={song.id || idx} data-song-index={idx} onClick={() => musicPlayer.locateSong(idx)}
                                                            className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-all ${idx === musicPlayer.playlistIndex ? 'bg-neutral-200/55 dark:bg-white/10 text-neutral-900 dark:text-white font-medium' : 'hover:bg-neutral-100/50 dark:hover:bg-white/4 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
                                                            style={{ height: SONG_ITEM_HEIGHT }} role="option" aria-selected={idx === musicPlayer.playlistIndex} title={`${song.name} - ${song.artist}`}>
                                                            <div className="flex items-center gap-2 truncate">
                                                                <span className="font-mono text-[9px] w-4 opacity-60 shrink-0">{String(idx + 1).padStart(2, '0')}</span>
                                                                <span className="truncate">{song.name}</span>
                                                            </div>
                                                            <span className="text-[10px] opacity-60 shrink-0 ml-2 hidden sm:inline">{song.artist}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center py-6"><p className="text-[11px] text-neutral-400/50 dark:text-neutral-600/50 italic" role="status">无匹配歌曲</p></div>
                                        )
                                    ) : (
                                        <div className="flex items-center justify-center py-6"><p className="text-[11px] text-neutral-400/50 dark:text-neutral-600/50 italic" role="status">{musicPlayer.isLoadingPlaylist ? 'Loading...' : 'Empty playlist'}</p></div>
                                    )}
                                </div>
                            </div>
                    </div>
                </div>

                <div className={getPageClass(2)}>
                    <div className="flex flex-col lg:flex-row gap-3 sm:gap-4">
                        <div className={`flex flex-col p-3 sm:p-4 rounded-2xl bg-white/40 dark:bg-white/2 border border-neutral-200/50 dark:border-white/5 ${cardHover} flex-1 lg:h-96`} role="region" aria-label="收藏列表">
                            <div className="flex items-center gap-1.5 shrink-0 border-b border-neutral-200/20 dark:border-white/4 pb-2 mb-2">
                                <Heart size={12} className="text-neutral-400" aria-hidden="true" />
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400">Favorites</span>
                                <span className="text-[9px] text-neutral-400 font-mono ml-auto">{favorites.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto min-h-0 scrollbar-none" role="list" aria-label="收藏歌曲">
                                {favorites.length > 0 ? (
                                    favorites.map((song, idx) => (
                                        <div key={song.url || idx}
                                            onClick={() => {
                                                const resolvedUrl = song.url.startsWith('blob:')
                                                    ? localSongs.find(s => getSongKey(s) === getSongKey(song))?.url || song.url
                                                    : song.url;
                                                const remoteIdx = musicPlayer.remotePlaylist.findIndex((s: any) => s.url === resolvedUrl);
                                                const localIdx = musicPlayer.localPlaylist.findIndex((s: any) => s.url === resolvedUrl);
                                                if (remoteIdx !== -1) {
                                                    musicPlayer.selectSong(remoteIdx, 'remote');
                                                } else if (localIdx !== -1) {
                                                    musicPlayer.selectSong(localIdx, 'local');
                                                }
                                            }}
                                            className="flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer text-xs hover:bg-neutral-100/50 dark:hover:bg-white/4 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-all"
                                            role="listitem" title={`${song.name} - ${song.artist}`}>
                                            <div className="flex items-center gap-2 truncate">
                                                <span className="font-mono text-[9px] w-4 opacity-60 shrink-0">{String(idx + 1).padStart(2, '0')}</span>
                                                <span className="truncate">{song.name}</span>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); toggleFavorite(song); }}
                                                className="text-red-500 dark:text-red-400 hover:text-red-600 transition-colors p-0.5 focus:outline-none focus:ring-1 focus:ring-red-400 rounded"
                                                aria-label={`从收藏中移除 ${song.name}`}>
                                                <X size={10} aria-hidden="true" />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex items-center justify-center h-full py-4"><p className="text-[11px] text-neutral-400/50 dark:text-neutral-600/50 italic" role="status">暂无收藏歌曲</p></div>
                                )}
                            </div>
                        </div>

                        <div className={`flex flex-col p-3 sm:p-4 rounded-2xl bg-white/40 dark:bg-white/2 border border-neutral-200/50 dark:border-white/5 ${cardHover} flex-1 lg:h-96`} role="region" aria-label="播放历史">
                            <div className="flex items-center gap-1.5 shrink-0 border-b border-neutral-200/20 dark:border-white/4 pb-2 mb-2">
                                <History size={12} className="text-neutral-400" aria-hidden="true" />
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400">History</span>
                                <span className="text-[9px] text-neutral-400 font-mono ml-auto">{playHistory.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto min-h-0 scrollbar-none" role="list" aria-label="播放历史">
                                {playHistory.length > 0 ? (
                                    playHistory.map((song, idx) => (
                                        <div key={song.url || idx}
                                            onClick={() => {
                                                const resolvedUrl = song.url.startsWith('blob:')
                                                    ? localSongs.find(s => getSongKey(s) === getSongKey(song))?.url || song.url
                                                    : song.url;
                                                const remoteIdx = musicPlayer.remotePlaylist.findIndex((s: any) => s.url === resolvedUrl);
                                                const localIdx = musicPlayer.localPlaylist.findIndex((s: any) => s.url === resolvedUrl);
                                                if (remoteIdx !== -1) {
                                                    musicPlayer.selectSong(remoteIdx, 'remote');
                                                } else if (localIdx !== -1) {
                                                    musicPlayer.selectSong(localIdx, 'local');
                                                }
                                            }}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs hover:bg-neutral-100/50 dark:hover:bg-white/4 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-all"
                                            role="listitem" title={`${song.name} - ${song.artist}`}>
                                            <span className="font-mono text-[9px] w-4 opacity-60 shrink-0">{String(idx + 1).padStart(2, '0')}</span>
                                            <span className="truncate flex-1">{song.name}</span>
                                            <span className="text-[10px] opacity-60 shrink-0 hidden sm:inline">{song.artist}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex items-center justify-center h-full py-4"><p className="text-[11px] text-neutral-400/50 dark:text-neutral-600/50 italic" role="status">暂无播放历史</p></div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={getPageClass(3)}>
                    <div className={`flex flex-col p-3 sm:p-4 rounded-2xl bg-white/40 dark:bg-white/2 border border-neutral-200/50 dark:border-white/5 ${cardHover} lg:h-96`} role="region" aria-label="本地音乐">
                        <div className="flex items-center gap-2 border-b border-neutral-200/20 dark:border-white/4 pb-2 mb-2 shrink-0">
                            <FolderOpen size={12} className="text-neutral-400" aria-hidden="true" />
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400">Local Music</span>
                            {localSongs.length > 0 && (
                                <span className="text-[9px] text-neutral-400 font-mono ml-auto">{localSongs.length} songs</span>
                            )}
                        </div>

                        <div className="flex items-center gap-2 mb-2 shrink-0">
                            <button
                                onClick={selectFolder}
                                disabled={isFolderLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-200/60 dark:bg-white/8 text-[10px] font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-300/60 dark:hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 focus:outline-none focus:ring-1 focus:ring-neutral-400/50"
                                aria-label="选择文件夹"
                            >
                                {isFolderLoading ? (
                                    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                                ) : (
                                    <FolderOpen size={12} aria-hidden="true" />
                                )}
                                {folderName ? '更换文件夹' : '选择文件夹'}
                            </button>
                            {folderName && (
                                <>
                                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate" title={folderName}>
                                        {folderName}
                                    </span>
                                    <button
                                        onClick={clearFolder}
                                        className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors p-0.5 ml-auto shrink-0"
                                        title="清除" aria-label="清除文件夹"
                                    >
                                        <X size={12} aria-hidden="true" />
                                    </button>
                                </>
                            )}
                        </div>

                        {folderError && (
                            <p className="text-[10px] text-red-400 dark:text-red-500 mb-2 px-1" role="alert">{folderError}</p>
                        )}

                        {!folderName && !isFolderLoading && (
                            <div className="flex-1 flex items-center justify-center min-h-50">
                                {!isFolderRestored ? (
                                    <Loader2 size={20} className="text-neutral-400 animate-spin" aria-label="恢复中" />
                                ) : (
                                    <div className="text-center">
                                        <FolderOpen size={32} className="text-neutral-300 dark:text-neutral-700 mx-auto mb-2" aria-hidden="true" />
                                        <p className="text-[11px] text-neutral-400/50 dark:text-neutral-600/50 italic">
                                            点击「选择文件夹」加载本地音乐
                                        </p>
                                        <p className="text-[10px] text-neutral-400/30 dark:text-neutral-600/30 mt-1">
                                            自动读取 MP3 标签和同名 LRC 歌词
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {isFolderLoading && (
                            <div className="flex-1 flex items-center justify-center">
                                <Loader2 size={20} className="text-neutral-400 animate-spin" aria-label="加载中" />
                            </div>
                        )}

                        {folderName && !isFolderLoading && localSongs.length > 0 && (
                            <>
                                <button
                                    onClick={() => {
                                                    musicPlayer.setPlaylist([...localSongs], 'local');
                                                    musicPlayer.selectSong(0, 'local');
                                                }}
                                    className="flex items-center gap-1.5 text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors px-1 mb-1 shrink-0"
                                    aria-label="播放全部"
                                >
                                    <Play size={12} aria-hidden="true" />
                                    <span>播放全部</span>
                                </button>
                                <div className="flex-1 overflow-y-auto min-h-0 scrollbar-none" role="list" aria-label="本地歌曲列表">
                                    {localSongs.map((song, idx) => {
                                        const isActive = musicPlayer.activePlaylistSource === 'local' && idx === musicPlayer.playlistIndex;
                                        return (
                                        <div
                                            key={song.url}
                                            onClick={() => {
                                                const realIdx = musicPlayer.localPlaylist.findIndex((s: any) => s.url === song.url);
                                                if (realIdx !== -1) {
                                                    musicPlayer.selectSong(realIdx, 'local');
                                                } else {
                                                    musicPlayer.setPlaylist([...localSongs], 'local');
                                                    musicPlayer.selectSong(idx, 'local');
                                                }
                                            }}
                                            className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-all ${isActive ? 'bg-neutral-200/55 dark:bg-white/10 text-neutral-900 dark:text-white font-medium' : 'hover:bg-neutral-100/50 dark:hover:bg-white/4 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
                                            role="listitem" title={`${song.name} - ${song.artist}`}
                                            aria-selected={isActive}
                                        >
                                            <div className="flex items-center gap-2 truncate">
                                                <span className="font-mono text-[9px] w-4 opacity-60 shrink-0">{String(idx + 1).padStart(2, '0')}</span>
                                                <span className="truncate">{song.name}</span>
                                            </div>
                                            <span className="text-[10px] opacity-60 shrink-0 ml-2 hidden sm:inline">{song.artist}</span>
                                        </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <footer className={`fixed bottom-8 inset-x-0 flex justify-center z-30 select-none pointer-events-none transition-all duration-1200 ease-[cubic-bezier(0.16,1,0.3,1)] delay-500 ${isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div
                    ref={dockRef}
                    onMouseEnter={handleDockMouseEnter}
                    onMouseMove={handleDockMouseMove}
                    onMouseLeave={() => setDockMouseX(null)}
                    className="pointer-events-auto flex items-end gap-1.5 px-2.5 py-1.5 rounded-2xl bg-white/5 dark:bg-white/3 backdrop-blur-xl border border-neutral-200/15 dark:border-white/4 shadow-lg transition-all duration-700"
                >
                    {DOCK_PAGES.map((item, i) => {
                        const isActive = currentPage === item.id;
                        return (
                            <div key={item.name} style={getDynamicScaleStyle(i)}
                                className="group flex flex-col items-center justify-end origin-bottom transition-all duration-200 ease-out">
                                <button
                                    type="button"
                                    onClick={() => { if (currentPage !== item.id) navigate(item.path); }}
                                    className={`p-2.5 rounded-xl relative transition-all duration-300 ${isActive
                                        ? 'bg-white/80 dark:bg-white/12 text-neutral-950 dark:text-neutral-50 shadow-md shadow-neutral-200/30 dark:shadow-black/20 border border-neutral-200/40 dark:border-white/8'
                                        : 'bg-white/5 dark:bg-white/1 text-neutral-300 dark:text-neutral-600 hover:bg-white/30 dark:hover:bg-white/6 hover:text-neutral-800 dark:hover:text-neutral-200 border border-transparent hover:border-neutral-200/20 dark:hover:border-white/4'
                                        }`}
                                    title={item.name}
                                    aria-label={item.name}
                                    aria-current={isActive ? 'page' : undefined}
                                >
                                    <item.icon size={16} className={`transition-transform duration-300 ${isActive ? 'scale-110' : ''}`} />
                                    <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-neutral-900/90 dark:bg-neutral-100/90 text-[10px] text-white dark:text-neutral-900 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 shadow-md font-medium whitespace-nowrap scale-75 group-hover:scale-100 z-20">
                                        {item.name}
                                    </span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </footer>

            {!isPWA && (
            <div className={`absolute bottom-0 left-0 right-0 z-10 flex justify-center pb-1 select-none transition-all duration-1000 delay-300 ${isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <p className="text-[9px] sm:text-[10px] text-neutral-400/60 dark:text-neutral-600/60">
                    Powered by 小枫_QWQ | <a href="https://bing.com/search?q=%E5%B0%8F%E6%9E%AB_QWQ" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-600 dark:hover:text-neutral-400 transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-400 rounded" aria-label="关于开发者">AboutDev</a>
                </p>
            </div>
            )}
        </div>
    );
}

export default function App() {
    return (
        <HashRouter>
            <AppContent />
        </HashRouter>
    );
}