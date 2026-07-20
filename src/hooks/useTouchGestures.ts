import { useEffect, useRef, useCallback } from 'react';

interface TouchGestureHandlers {
    onSwipeLeft: () => void;
    onSwipeRight: () => void;
    onSwipeUp: () => void;
    onSwipeDown: () => void;
    onTap: () => void;
}

/**
 * 移动端触摸手势 Hook
 * 支持左滑/右滑切歌，上滑/下滑调音量，单击播放/暂停
 */
export const useTouchGestures = (
    ref: React.RefObject<HTMLElement | null>,
    handlers: TouchGestureHandlers,
    threshold: number = 50
) => {
    const startX = useRef(0);
    const startY = useRef(0);
    const startTime = useRef(0);

    const handleTouchStart = useCallback((e: TouchEvent) => {
        const touch = e.touches[0];
        startX.current = touch.clientX;
        startY.current = touch.clientY;
        startTime.current = Date.now();
    }, []);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
        const touch = e.changedTouches[0];
        const dx = touch.clientX - startX.current;
        const dy = touch.clientY - startY.current;
        const dt = Date.now() - startTime.current;

        // 快速轻触（< 300ms 且移动距离 < threshold/2）
        if (dt < 300 && Math.abs(dx) < threshold / 2 && Math.abs(dy) < threshold / 2) {
            handlers.onTap();
            return;
        }

        // 判断滑动方向
        if (Math.abs(dx) > Math.abs(dy)) {
            // 水平滑动
            if (Math.abs(dx) >= threshold) {
                if (dx > 0) {
                    handlers.onSwipeRight();
                } else {
                    handlers.onSwipeLeft();
                }
            }
        } else {
            // 垂直滑动
            if (Math.abs(dy) >= threshold) {
                if (dy > 0) {
                    handlers.onSwipeDown();
                } else {
                    handlers.onSwipeUp();
                }
            }
        }
    }, [handlers, threshold]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        el.addEventListener('touchstart', handleTouchStart, { passive: true });
        el.addEventListener('touchend', handleTouchEnd, { passive: true });

        return () => {
            el.removeEventListener('touchstart', handleTouchStart);
            el.removeEventListener('touchend', handleTouchEnd);
        };
    }, [ref, handleTouchStart, handleTouchEnd]);
};