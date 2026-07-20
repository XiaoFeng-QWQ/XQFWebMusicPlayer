/**
 * 解析标准 LRC 歌词格式
 * @param lrcText LRC 格式歌词文本
 * @returns 解析后的歌词行数组
 */
export const parseLRC = (lrcText: string): { time: number; text: string }[] => {
    const lines = lrcText.split('\n');
    const parsed: { time: number; text: string }[] = [];
    const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    lines.forEach(line => {
        const match = timeReg.exec(line);
        if (match) {
            const min = parseInt(match[1], 10);
            const sec = parseInt(match[2], 10);
            const msStr = match[3];
            const ms = parseInt(msStr, 10) / (msStr.length === 3 ? 1000 : 100);
            const time = min * 60 + sec + ms;
            const text = line.replace(timeReg, '').trim();
            parsed.push({ time, text });
        }
    });
    return parsed.sort((a, b) => a.time - b.time);
};