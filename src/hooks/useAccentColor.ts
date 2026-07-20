import { useState, useEffect, useRef } from 'react';

function extractAccentColor(imageUrl: string): Promise<string | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const cleanup = () => {
            img.onload = null;
            img.onerror = null;
        };

        img.onload = () => {
            cleanup();
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 1;
                canvas.height = 1;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(null); return; }
                ctx.drawImage(img, 0, 0, 1, 1);
                const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

                // 暗像素不参与计算（避免黑色边框干扰）
                if (r < 15 && g < 15 && b < 15) { resolve(null); return; }

                const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
                resolve(hex);
            } catch {
                resolve(null);
            }
        };

        img.onerror = () => { cleanup(); resolve(null); };
        img.src = imageUrl;
    });
}

export function useAccentColor(imageUrl?: string): string | null {
    const [accentColor, setAccentColor] = useState<string | null>(null);
    const prevUrl = useRef<string>('');

    useEffect(() => {
        if (!imageUrl || imageUrl === prevUrl.current) return;
        prevUrl.current = imageUrl;

        extractAccentColor(imageUrl).then((color) => {
            setAccentColor(color);
        });
    }, [imageUrl]);

    return accentColor;
}
