/**
 * 防抖工具函数
 * 延迟执行函数，在连续调用时只执行最后一次
 */

export const debounce = <T extends (...args: any[]) => void>(
    fn: T,
    delay: number
): ((...args: Parameters<T>) => void) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            fn(...args);
            timer = null;
        }, delay);
    };
};