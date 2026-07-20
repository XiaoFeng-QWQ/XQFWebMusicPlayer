import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

/**
 * 主题切换 Hook
 * 提供深色/浅色主题切换功能，支持平滑过渡动画
 */
export const useTheme = () => {
    const [isDark, setIsDark] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') !== 'light';
        }
        return true;
    });

    const isTransitioningRef = useRef(false);

    const toggleTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (isTransitioningRef.current) return;

        const doc = document as any;
        if (!doc.startViewTransition) {
            setIsDark(!isDark);
            return;
        }

        isTransitioningRef.current = true;

        document.documentElement.getAnimations().forEach(anim => {
            if ((anim as any).pseudoElement?.includes('view-transition')) {
                anim.cancel();
            }
        });

        document.documentElement.classList.add('theme-transitioning');

        const x = e.clientX || window.innerWidth / 2;
        const y = e.clientY || window.innerHeight / 2;
        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        );

        const transition = doc.startViewTransition(() => {
            flushSync(() => {
                setIsDark(prev => !prev);
            });
        });

        // 小屏幕跳过圆形扩散动画，使用默认交叉淡入淡出
        if (window.innerWidth < 768) {
            transition.finished.then(() => {
                document.documentElement.classList.remove('theme-transitioning');
                isTransitioningRef.current = false;
            }).catch(() => {
                document.documentElement.classList.remove('theme-transitioning');
                isTransitioningRef.current = false;
            });
            return;
        }

        transition.ready.then(() => {
            const anim = document.documentElement.animate(
                {
                    clipPath: [
                        `circle(0px at ${x}px ${y}px)`,
                        `circle(${endRadius}px at ${x}px ${y}px)`,
                    ],
                },
                {
                    duration: 400,
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    pseudoElement: '::view-transition-new(root)',
                }
            );

            anim.onfinish = () => {
                document.documentElement.classList.remove('theme-transitioning');
                isTransitioningRef.current = false;
            };
        });

        transition.finished.then(() => {
            document.documentElement.classList.remove('theme-transitioning');
            isTransitioningRef.current = false;
        }).catch(() => {
            document.documentElement.classList.remove('theme-transitioning');
            isTransitioningRef.current = false;
        });
    };

    useEffect(() => {
        const root = document.documentElement;
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        const favicon = document.getElementById('favicon') as HTMLLinkElement | null;
        if (isDark) {
            root.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            metaThemeColor?.setAttribute('content', '#0b0b0d');
            if (favicon) favicon.href = '/icon.svg';
        } else {
            root.classList.remove('dark');
            localStorage.setItem('theme', 'light');
            metaThemeColor?.setAttribute('content', '#fafafa');
            if (favicon) favicon.href = '/icon-light.svg';
        }
    }, [isDark]);

    return {
        isDark,
        toggleTheme,
    };
};