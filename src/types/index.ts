/**
 * 歌词行接口
 */
export interface LyricLine {
    time: number;
    text: string;
}

/**
 * 音乐信息接口
 */
export interface MusicInfo {
    name: string;
    artist: string;
    pic: string;
    url: string;
    album?: string;
}

/**
 * 歌曲接口
 */
export interface Song {
    id?: string | number;
    name: string;
    artist: string;
    url: string;
    pic?: string;
    lrc?: string;
}

/**
 * 频谱可视化样式类型
 */
export type VisualizerStyle = 'bars' | 'wave' | 'dots' | 'circle' | 'ring';

/**
 * 频谱颜色主题
 */
export type VisualizerColorTheme = 'neutral' | 'cyan' | 'green' | 'purple' | 'orange' | 'rainbow';

/**
 * 频谱配置
 */
export interface VisualizerConfig {
    style: VisualizerStyle;
    colorTheme: VisualizerColorTheme;
    density: number; // 柱数/点数密度 (0.5 ~ 2.0)
    thickness: number; // 粗细 (0.5 ~ 2.0)
}

// File System Access API 类型声明
declare global {
    interface Window {
        showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
    }
}