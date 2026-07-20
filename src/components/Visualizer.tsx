import { useEffect, useRef, useCallback } from 'react';
import type { VisualizerConfig, VisualizerColorTheme } from '../types';

interface VisualizerProps {
    isPlaying: boolean;
    config?: VisualizerConfig;
    /** useMusicPlayer 中已创建并连接好的 AnalyserNode */
    analyserNode?: AnalyserNode | null;
}

/** 颜色主题色板 */
const COLOR_PALETTES: Record<VisualizerColorTheme, string[]> = {
    neutral: ['160,160,170', '130,130,140', '100,100,110'],
    cyan: ['56,189,248', '14,165,233', '3,105,161'],
    green: ['74,222,128', '34,197,94', '21,128,61'],
    purple: ['168,85,247', '139,92,246', '107,33,168'],
    orange: ['251,146,60', '249,115,22', '194,65,12'],
    rainbow: ['239,68,68', '251,146,60', '250,204,21', '74,222,128', '56,189,248', '168,85,247'],
};

export default function Visualizer({ isPlaying, config, analyserNode }: VisualizerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animRef = useRef<number>(0);
    const phaseRef = useRef<number>(0);

    const cfg: VisualizerConfig = config || { style: 'bars', colorTheme: 'neutral', density: 1.0, thickness: 1.0 };
    const colors = COLOR_PALETTES[cfg.colorTheme] || COLOR_PALETTES.neutral;

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        ctx.clearRect(0, 0, w, h);

        const analyser = analyserNode || null;
        const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
        if (dataArray && analyser) analyser.getByteFrequencyData(dataArray);
        const useReal = dataArray ? dataArray.some(v => v > 0) : false;

        phaseRef.current += 0.06;

        const barCount = Math.round(64 * cfg.density);
        const thickness = cfg.thickness;
        const centerX = w / 2;
        const centerY = h / 2;
        const maxRadius = Math.min(w, h) * 0.30;

        for (let i = 0; i < barCount; i++) {
            let val: number;
            if (useReal && dataArray) {
                const lo = Math.floor((i / barCount) * dataArray.length * 0.4);
                const hi = Math.floor((i / barCount) * dataArray.length * 0.8) + 1;
                let sum = 0;
                for (let j = lo; j < Math.min(hi, dataArray.length); j++) sum += dataArray[j];
                val = sum / Math.max(1, hi - lo);
            } else {
                const s1 = Math.sin(phaseRef.current + i * 0.3) * 0.35;
                const s2 = Math.sin(phaseRef.current * 1.7 + i * 0.18) * 0.35;
                const s3 = Math.sin(phaseRef.current * 0.5 + i * 0.55) * 0.3;
                val = isPlaying ? ((s1 + s2 + s3 + 1) / 2) * 200 + 20 : 15;
            }

            const intensity = val / 255;
            const alpha = 0.04 + intensity * 0.14;

            switch (cfg.style) {
                case 'bars': {
                    const barW = (w / barCount) * thickness;
                    const barH = Math.max(4, intensity * h * 0.65);
                    const x = i * (w / barCount) + (w / barCount - barW) / 2;
                    const y = (h - barH) / 2;

                    const grad = ctx.createLinearGradient(x, y, x, y + barH);
                    grad.addColorStop(0, `rgba(${colors[0]},0)`);
                    grad.addColorStop(0.3, `rgba(${colors[1]},${alpha})`);
                    grad.addColorStop(0.5, `rgba(${colors[2]},${alpha * 1.3})`);
                    grad.addColorStop(0.7, `rgba(${colors[1]},${alpha})`);
                    grad.addColorStop(1, `rgba(${colors[0]},0)`);

                    ctx.fillStyle = grad;
                    ctx.fillRect(x, y, barW, barH);
                    break;
                }
                case 'wave': {
                    if (i === 0) {
                        ctx.beginPath();
                        ctx.moveTo(0, centerY);
                    }
                    const sx = (i / (barCount - 1)) * w;
                    const sy = centerY - (intensity - 0.5) * h * thickness * 1.0;
                    ctx.lineTo(sx, sy);
                    if (i === barCount - 1) {
                        ctx.lineTo(w, centerY);
                        ctx.strokeStyle = `rgba(${colors[2]},${alpha * 1.5})`;
                        ctx.lineWidth = Math.max(1, 2 * thickness);
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.stroke();
                    }
                    break;
                }
                case 'dots': {
                    const dotSpacing = w / barCount;
                    const dx = i * dotSpacing + dotSpacing / 2;
                    const dotR = Math.max(2, intensity * (h * 0.30 * thickness));
                    const dy = centerY - dotR * 0.5 * Math.sign(Math.sin(i * 1.2 + phaseRef.current)) * intensity;

                    ctx.fillStyle = `rgba(${colors[1]},${alpha * 1.2})`;
                    ctx.beginPath();
                    ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
                    ctx.fill();

                    if (intensity > 0.4) {
                        ctx.fillStyle = `rgba(${colors[0]},${alpha * 0.6})`;
                        ctx.beginPath();
                        ctx.arc(dx, dy, dotR * 1.4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;
                }
                case 'circle': {
                    const angle = (i / barCount) * Math.PI * 2;
                    const radius = maxRadius + intensity * maxRadius * 0.5 * thickness;
                    if (i === 0) {
                        ctx.beginPath();
                    }
                    const cx = centerX + Math.cos(angle) * radius;
                    const cy = centerY + Math.sin(angle) * radius;
                    if (i === 0) {
                        ctx.moveTo(cx, cy);
                    } else {
                        ctx.lineTo(cx, cy);
                    }
                    if (i === barCount - 1) {
                        ctx.closePath();
                        ctx.strokeStyle = `rgba(${colors[1]},${alpha * 1.2})`;
                        ctx.lineWidth = Math.max(1, 2 * thickness);
                        ctx.stroke();

                        ctx.fillStyle = `rgba(${colors[0]},${alpha * 0.3})`;
                        ctx.fill();
                    }
                    break;
                }
                case 'ring': {
                    const angle = (i / barCount) * Math.PI * 2;
                    const baseRadius = maxRadius * 0.5;
                    const armLength = intensity * maxRadius * 0.8 * thickness;

                    const x1 = centerX + Math.cos(angle) * baseRadius;
                    const y1 = centerY + Math.sin(angle) * baseRadius;
                    const x2 = centerX + Math.cos(angle) * (baseRadius + armLength);
                    const y2 = centerY + Math.sin(angle) * (baseRadius + armLength);

                    ctx.strokeStyle = `rgba(${colors[Math.floor((i / barCount) * (colors.length - 1))]},${alpha * 1.4})`;
                    ctx.lineWidth = Math.max(1, 3 * thickness);
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                    break;
                }
            }
        }

        animRef.current = requestAnimationFrame(draw);
    }, [isPlaying, cfg.style, cfg.colorTheme, cfg.density, cfg.thickness, analyserNode]);

    // Canvas 尺寸
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const update = () => {
            const rect = canvas.parentElement?.getBoundingClientRect();
            if (rect && rect.width > 0 && rect.height > 0) {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                canvas.style.width = `${rect.width}px`;
                canvas.style.height = `${rect.height}px`;
                canvas.getContext('2d')?.scale(dpr, dpr);
            }
        };
        const timeout = setTimeout(update, 50);
        window.addEventListener('resize', update);
        const ro = new ResizeObserver(update);
        if (canvas.parentElement) ro.observe(canvas.parentElement);
        return () => { clearTimeout(timeout); window.removeEventListener('resize', update); ro.disconnect(); };
    }, []);

    // 动画循环
    useEffect(() => {
        cancelAnimationFrame(animRef.current);
        if (isPlaying) {
            animRef.current = requestAnimationFrame(draw);
        }
        return () => cancelAnimationFrame(animRef.current);
    }, [isPlaying, draw]);

    return (
        <canvas
            ref={canvasRef}
            className="w-full h-full block"
            style={{ background: 'transparent' }}
        />
    );
}
