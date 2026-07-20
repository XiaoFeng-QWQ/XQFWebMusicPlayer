import { useEffect } from 'react';

interface KeyboardShortcutHandlers {
    onPlayPause: () => void;
    onNext: () => void;
    onPrev: () => void;
    onVolumeUp: () => void;
    onVolumeDown: () => void;
    onToggleMute: () => void;
    onSearchFocus: () => void;
    onSeekForward: () => void;
    onSeekBackward: () => void;
}

/**
 * 键盘快捷键 Hook
 * 支持空格播放/暂停，Shift+左右箭头快进快退，左右箭头切歌，上下箭头调音量，M 静音，Ctrl+F 搜索
 */
export const useKeyboardShortcuts = (handlers: KeyboardShortcutHandlers) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 不在输入框内时响应快捷键
            const target = e.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

            if (isInput) return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    handlers.onPlayPause();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (e.shiftKey) {
                        handlers.onSeekForward();
                        break;
                    }
                    handlers.onNext();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (e.shiftKey) {
                        handlers.onSeekBackward();
                        break;
                    }
                    handlers.onPrev();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    handlers.onVolumeUp();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    handlers.onVolumeDown();
                    break;
                case 'm':
                case 'M':
                    handlers.onToggleMute();
                    break;
                case 'f':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        handlers.onSearchFocus();
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handlers]);
};