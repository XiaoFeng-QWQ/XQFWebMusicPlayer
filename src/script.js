const iconGear = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>`;
const iconBack = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`;
const iconPlay = `<svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const iconPause = `<svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

const DB_NAME = 'FluxAudioDB';
const STORE_NAME = 'state';

function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject('DB Error');
    });
}
async function dbSet(key, value) { try { const db = await initDB(); db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key); } catch (e) { } }
async function dbGet(key) { try { const db = await initDB(); return new Promise(res => { const req = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key); req.onsuccess = () => res(req.result); req.onerror = () => res(null); }); } catch (e) { return null; } }
async function dbClear() { try { const db = await initDB(); db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear(); } catch (e) { } }

const API_BASE = 'https://api.xiaofengqwq.com/api/v1/music/playlist?id=';

// 初始化 Audio 并设置跨域属性
const audio = new Audio();
audio.crossOrigin = "anonymous";

let playlist = [];
let currentIdx = -1;
let lrcData = [];
let isEmbedMode = false;

// Web Audio 节点全局变量 (5段 EQ, 声相与分析仪)
let audioCtx = null;
let sourceNode = null;
let filters = []; // 存放 5 个滤波器节点
let pannerNode = null; // 声相平衡节点
let analyserNode = null; // 频谱分析仪节点
let isAudioCtxInitialized = false;

// 频谱渲染所需变量
let canvas = null;
let ctx = null;

// 律动动画帧 ID
let animId = null;

// 缓动动画目标及当前状态变量
let currentScale = 1.05;
let currentBrightness = 0.4;
let currentBlur = 70;

// 5段频点、类型
const filterFreqs = [60, 250, 1000, 4000, 16000];
const filterTypes = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

// 调音预设映射数据
const presets = {
    flat: [0, 0, 0, 0, 0],
    bass: [9, 5, -2, 0, 0],
    vocal: [-2, 0, 6, 4, 2],
    electro: [6, 2, -1, 4, 6],
    pop: [3, 1, 2, 1, 3]
};

window.addEventListener('DOMContentLoaded', async () => {
    initCanvas();

    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') === '1') {
        isEmbedMode = true;
        document.body.classList.add('is-embed');
        document.body.className += ' tab-player';
        const embedId = params.get('id') || '3778678';
        document.getElementById('api-id').value = embedId;
        await fetchPlaylist(true);
        return;
    }

    // 载入音量设定
    const savedVolume = await dbGet('volume');
    const parsedVolume = parseFloat(savedVolume);
    if (savedVolume !== null && !isNaN(parsedVolume) && isFinite(parsedVolume)) {
        const finalVolume = Math.max(0, Math.min(1, parsedVolume));
        audio.volume = finalVolume;
        document.getElementById('volume-slider').value = finalVolume;
        document.getElementById('volume-val').innerText = Math.round(finalVolume * 100);
    } else {
        audio.volume = 1;
        document.getElementById('volume-slider').value = 1;
        document.getElementById('volume-val').innerText = 100;
    }

    // 载入均衡器 5 段存储值
    for (let i = 0; i < filterFreqs.length; i++) {
        const freq = filterFreqs[i];
        const val = await dbGet(`eq-${freq}`) ?? 0;
        document.getElementById(`eq-${freq}`).value = val;
        document.getElementById(`eq-${freq}-val`).innerText = (val > 0 ? '+' : '') + val + ' dB';
    }

    // 恢复激活的预设状态高亮
    const savedPreset = await dbGet('active-preset') || 'flat';
    document.querySelectorAll('.btn-preset').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById(`btn-preset-${savedPreset}`);
    if (targetBtn) targetBtn.classList.add('active');

    // 载入并恢复声道平衡
    const savedPanner = await dbGet('panner-val') ?? 0;
    document.getElementById('panner-slider').value = savedPanner;
    let panTxt = "居中";
    if (savedPanner < 0) {
        panTxt = `左 ${Math.round(Math.abs(savedPanner) * 100)}%`;
    } else if (savedPanner > 0) {
        panTxt = `右 ${Math.round(savedPanner * 100)}%`;
    }
    document.getElementById('panner-val').innerText = panTxt;

    const savedId = await dbGet('apiId');
    if (savedId) {
        document.getElementById('api-id').value = savedId;
        document.getElementById('embed-target-id').value = savedId;
    }

    const savedPlaylist = await dbGet('playlist');
    const savedIdx = await dbGet('currentIdx');

    if (savedPlaylist && savedPlaylist.length > 0) {
        playlist = savedPlaylist;
        renderList();
        if (savedIdx !== null && savedIdx >= 0 && savedIdx < playlist.length) {
            playTrack(savedIdx, false);
            document.getElementById('locate-btn').style.display = 'flex';
        }
    }

    setupMediaSessionHandlers();
});

// 初始化频谱 Canvas 尺寸及高清晰度防糊
function initCanvas() {
    canvas = document.getElementById('spectrum-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // 使用 ResizeObserver 监听，完美解决布局改变、渲染延迟或侧边栏挤压导致的画布尺寸失真
    if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => {
            resizeCanvas();
        });
        resizeObserver.observe(canvas);
    } else {
        // 降级备用方案
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }
}

function resizeCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // 重置大小后绘制一次静态空白线，避免闪烁
    drawEmptySpectrum();
}

// 延迟且安全地初始化 Web Audio 节点通道
function initAudioPipeline() {
    if (isAudioCtxInitialized) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        sourceNode = audioCtx.createMediaElementSource(audio);

        let lastNode = sourceNode;
        filters = [];

        // 建立 5 段 EQ 串联链路
        for (let i = 0; i < filterFreqs.length; i++) {
            const filter = audioCtx.createBiquadFilter();
            filter.type = filterTypes[i];
            filter.frequency.value = filterFreqs[i];
            if (filter.type === 'peaking') {
                filter.Q.value = 1.0;
            }
            const savedGain = parseFloat(document.getElementById(`eq-${filterFreqs[i]}`).value) || 0;
            filter.gain.value = savedGain;

            lastNode.connect(filter);
            filters.push(filter);
            lastNode = filter;
        }

        // 建立声道声相调节节点
        pannerNode = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;

        // 建立频谱分析仪节点 (低 FFT 大小以保证性能)
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 64;

        if (pannerNode) {
            pannerNode.pan.value = parseFloat(document.getElementById('panner-slider').value) || 0;
            lastNode.connect(pannerNode);
            pannerNode.connect(analyserNode);
        } else {
            lastNode.connect(analyserNode);
        }

        analyserNode.connect(audioCtx.destination);

        isAudioCtxInitialized = true;
    } catch (e) {
        console.warn("Web Audio API was blocked or failed to initialize", e);
    }
}

// 绘制静态/初始化的频谱底线
function drawEmptySpectrum() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    const activeBins = 24; // 选取 24 个主力频段
    const barGap = 4;
    const totalGapsWidth = barGap * (activeBins - 1);
    const barWidth = (width - totalGapsWidth) / activeBins;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    for (let i = 0; i < activeBins; i++) {
        const x = i * (barWidth + barGap);
        const y = height - 2;
        drawRoundedRect(ctx, x, y, barWidth, 2, 1);
    }
}

// 绘制实时音频数据动态频谱
function drawSpectrum(dataArray, bufferLength) {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const activeBins = 24;
    const barGap = 4;
    const totalGapsWidth = barGap * (activeBins - 1);
    const barWidth = (width - totalGapsWidth) / activeBins;

    // 建立带有柔和高亮和透明度渐变的效果
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.75)');

    ctx.fillStyle = gradient;

    for (let i = 0; i < activeBins; i++) {
        // 音频数据缓动转换
        const rawValue = dataArray[i];
        const percent = rawValue / 255;
        const minHeight = 2; // 无音频信号时的默认小指示高度
        const barHeight = percent * (height - 6) + minHeight;

        const x = i * (barWidth + barGap);
        const y = height - barHeight;

        // 圆角矩形渲染
        drawRoundedRect(ctx, x, y, barWidth, barHeight, 2);
    }
}

// 绘制圆角矩形辅助函数
function drawRoundedRect(ctx, x, y, width, height, radius) {
    if (width <= 0 || height <= 0) return;
    const r = Math.min(radius, width / 2); // 避免柱体过窄导致圆角溢出
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
}

// 环境光音频律动及频谱渲染核心循环 (缓动物理插值)
function updateAmbientBeat() {
    // 如果处于暂停或未初始化状态，使背景平滑缓动恢复默认状态，绘制静止状态底线，并在到位后停止循环
    if (!isAudioCtxInitialized || !analyserNode || audio.paused) {
        currentScale += (1.05 - currentScale) * 0.1;
        currentBrightness += (0.4 - currentBrightness) * 0.1;
        currentBlur += (70 - currentBlur) * 0.1;

        const bg = document.getElementById('ambient-bg');
        if (bg) {
            bg.style.transform = `scale(${currentScale})`;
            bg.style.filter = `blur(${currentBlur}px) saturate(200%) brightness(${currentBrightness})`;
        }

        drawEmptySpectrum();

        // 接近默认值时完全停止，节省算力
        if (Math.abs(currentScale - 1.05) < 0.001) {
            return;
        }
        animId = requestAnimationFrame(updateAmbientBeat);
        return;
    }

    animId = requestAnimationFrame(updateAmbientBeat);

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteFrequencyData(dataArray);

    // 提取重低音（前 4 个低频频段，60Hz - 150Hz）
    let bassSum = 0;
    const bassBins = 4;
    for (let i = 0; i < bassBins; i++) {
        bassSum += dataArray[i];
    }
    const bassAverage = bassSum / bassBins; // 范围 0 到 255

    // 计算目标属性
    const targetScale = 1.05 + (bassAverage / 255) * 0.12;       // 1.05 到 1.17 缩放
    const targetBrightness = 0.4 + (bassAverage / 255) * 0.25;  // 0.4 到 0.65 亮度
    const targetBlur = 70 - (bassAverage / 255) * 15;           // 70px 到 55px 模糊

    // 弹性插值 (Lerp)，营造丝滑自然的物理弹性律动
    currentScale += (targetScale - currentScale) * 0.15;
    currentBrightness += (targetBrightness - currentBrightness) * 0.15;
    currentBlur += (targetBlur - currentBlur) * 0.15;

    const bg = document.getElementById('ambient-bg');
    if (bg) {
        bg.style.transform = `scale(${currentScale})`;
        bg.style.filter = `blur(${currentBlur}px) saturate(200%) brightness(${currentBrightness})`;
    }

    // 绘制动态频谱
    drawSpectrum(dataArray, bufferLength);
}

// 单项手动调整 5 段均衡器滑块
function setEQ(idx, val) {
    initAudioPipeline();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const value = parseFloat(val);
    const freq = filterFreqs[idx];
    const prefix = value > 0 ? '+' : '';

    if (filters[idx]) {
        filters[idx].gain.value = value;
    }
    document.getElementById(`eq-${freq}-val`).innerText = `${prefix}${value} dB`;
    if (!isEmbedMode) {
        dbSet(`eq-${freq}`, value);
    }

    // 手动调整滑块时，移除上方快捷预设的高亮状态
    document.querySelectorAll('.btn-preset').forEach(btn => btn.classList.remove('active'));
}

// 一键套用 EQ 预设方案
function applyPreset(name) {
    const vals = presets[name];
    if (!vals) return;

    for (let i = 0; i < filterFreqs.length; i++) {
        const freq = filterFreqs[i];
        const value = vals[i];
        const prefix = value > 0 ? '+' : '';

        // 更新 UI 状态
        const slider = document.getElementById(`eq-${freq}`);
        if (slider) slider.value = value;

        const txt = document.getElementById(`eq-${freq}-val`);
        if (txt) txt.innerText = `${prefix}${value} dB`;

        // 更新实时音频增益
        initAudioPipeline();
        if (filters[i]) {
            filters[i].gain.value = value;
        }
        if (!isEmbedMode) dbSet(`eq-${freq}`, value);
    }

    // 切换预设按钮高亮
    document.querySelectorAll('.btn-preset').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById(`btn-preset-${name}`);
    if (targetBtn) targetBtn.classList.add('active');

    if (!isEmbedMode) dbSet('active-preset', name);
}

// 左右声道平衡调节
function setPanning(val) {
    initAudioPipeline();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const value = parseFloat(val);
    let txt = "居中";
    if (value < 0) {
        txt = `左 ${Math.round(Math.abs(value) * 100)}%`;
    } else if (value > 0) {
        txt = `右 ${Math.round(value * 100)}%`;
    }
    document.getElementById('panner-val').innerText = txt;

    if (pannerNode) {
        pannerNode.pan.value = value;
    }
    if (!isEmbedMode) dbSet('panner-val', value);
}

// 调整主音量方法
function setVolume(val) {
    audio.volume = val;
    document.getElementById('volume-val').innerText = Math.round(val * 100);
    if (!isEmbedMode) {
        dbSet('volume', parseFloat(val));
    }
}

// 平滑滚动至当前正在播放的歌曲
function scrollToCurrentTrack() {
    const activeItem = document.querySelector('.track-item.active');
    if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function toggleMobileLyrics() {
    if (window.innerWidth > 950) return;
    const player = document.getElementById('view-player');
    player.classList.toggle('show-lyrics');

    if (player.classList.contains('show-lyrics')) {
        setTimeout(() => {
            const activeLrc = document.querySelector('.lrc-line.active');
            if (activeLrc) activeLrc.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
    }
}

function toggleDesktopSettings() {
    if (window.innerWidth <= 950) { switchTab('settings'); return; }
    const btn = document.getElementById('desk-setting-btn');
    if (btn.dataset.state === 'gear') {
        document.getElementById('view-player').style.display = 'none';
        document.getElementById('view-settings').style.display = 'block';
        btn.innerHTML = iconBack; btn.dataset.state = 'back';
    } else {
        document.getElementById('view-player').style.display = 'flex';
        document.getElementById('view-settings').style.display = 'none';
        btn.innerHTML = iconGear; btn.dataset.state = 'gear';
    }
}

function switchTab(tab) {
    if (isEmbedMode) return;
    document.body.className = `tab-${tab}`;
    document.querySelectorAll('.mobile-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(`nav-${tab}`).classList.add('active');

    // 移动端：切换回队列页面时自动滚动到当前播放歌曲
    if (tab === 'list') {
        setTimeout(scrollToCurrentTrack, 150);
    }

    const btn = document.getElementById('desk-setting-btn');
    if (tab === 'settings') { btn.innerHTML = iconBack; btn.dataset.state = 'back'; }
    else {
        btn.innerHTML = iconGear; btn.dataset.state = 'gear';
        document.getElementById('view-player').style.display = 'flex';
        document.getElementById('view-settings').style.display = 'none';
    }
}

function generateEmbed() {
    const id = document.getElementById('embed-target-id').value.trim();
    const currentUrl = window.location.origin + window.location.pathname;
    const iframeUrl = `${currentUrl}?embed=1&id=${id}`;
    const iframeCode = `<iframe src="${iframeUrl}" width="100%" height="520" frameborder="0" style="border-radius:12px; overflow:hidden; background:#000;"></iframe>`;

    const codeBox = document.getElementById('embed-code');
    codeBox.value = iframeCode; codeBox.select(); document.execCommand('copy');
    const originText = codeBox.value; codeBox.value = "✓ 已复制到剪贴板";
    setTimeout(() => codeBox.value = originText, 1500);
}

async function clearCache() {
    if (confirm('系统重置：确定要恢复出厂设置吗？这将清除所有本地缓存和调音偏好。')) {
        await dbClear(); localStorage.clear(); location.reload();
    }
}

async function fetchPlaylist(autoPlayFirst = false) {
    const input = document.getElementById('api-id').value.trim();
    if (!input) return;

    currentIdx = -1;
    document.getElementById('locate-btn').style.display = 'none';
    if (!isEmbedMode) {
        dbSet('currentIdx', -1);
    }

    document.getElementById('list-container').innerHTML = '<div style="padding: 20px; font-size: 12px; color: var(--text-dim); text-transform: uppercase;">正在同步数据...</div>';

    try {
        let id = '';
        let isSongUrl = false;

        // 判断是否为网易云链接或包含 ID
        if (input.includes('http://') || input.includes('https://')) {
            try {
                const urlObj = new URL(input);
                id = urlObj.searchParams.get('id');
            } catch (e) {
                const match = input.match(/[?&]id=(\d+)/);
                if (match) id = match[1];
            }
            if (input.includes('/song')) {
                isSongUrl = true;
            }
        } else if (/^\d+$/.test(input)) {
            id = input;
        }

        // 如果提取到了 ID
        if (id) {
            if (isSongUrl) {
                await loadSingleSong(id, autoPlayFirst, input);
            } else {
                // 优先作为歌单加载，失败则尝试作为单曲加载
                try {
                    const res = await fetch(API_BASE + id);
                    const json = await res.json();
                    if (json.code === 200 && json.data && json.data.length > 0) {
                        playlist = json.data;
                        renderList();
                        if (!isEmbedMode) {
                            dbSet('apiId', input);
                            dbSet('playlist', playlist);
                            document.getElementById('embed-target-id').value = id;
                        }
                        if (autoPlayFirst && playlist.length > 0) await playTrack(0, true);
                    } else {
                        await loadSingleSong(id, autoPlayFirst, input);
                    }
                } catch (playlistError) {
                    try {
                        await loadSingleSong(id, autoPlayFirst, input);
                    } catch (songError) {
                        throw new Error('无法加载内容');
                    }
                }
            }
        } else {
            // 文本搜索
            const searchRes = await fetch(`https://api-cloudmusic.allons-y.uk/search?keywords=${encodeURIComponent(input)}&type=1`);
            const searchJson = await searchRes.json();

            if (searchJson.code === 200 && searchJson.result && searchJson.result.songs) {
                const songs = searchJson.result.songs;
                if (songs.length === 0) {
                    document.getElementById('list-container').innerHTML = '<div style="padding: 20px; color: var(--text-dim);">未找到相关歌曲</div>';
                    return;
                }

                playlist = songs.map(song => {
                    const artistVal = (song.alia && song.alia[0]) || (song.alias && song.alias[0]) || (song.artists && song.artists.map(a => a.name).join('/')) || '未知歌手';
                    const picVal = (song.artists && song.artists[0] && song.artists[0].img1v1Url) || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

                    return {
                        id: song.id,
                        name: song.name,
                        artist: artistVal,
                        pic: picVal,
                        isPlaceholder: true
                    };
                });

                renderList();
                if (!isEmbedMode) {
                    dbSet('apiId', input);
                    dbSet('playlist', playlist);
                }
                if (autoPlayFirst && playlist.length > 0) {
                    await playTrack(0, true);
                }
            } else {
                document.getElementById('list-container').innerHTML = '<div style="padding: 20px; color: var(--text-dim);">未搜索到匹配结果</div>';
            }
        }
    } catch (e) {
        console.error(e);
        document.getElementById('list-container').innerHTML = `<div style="padding: 20px; color: #ff4a4a;">数据加载出错</div>`;
    }
}

// 辅助函数：加载单首歌曲
async function loadSingleSong(id, autoPlayFirst, input) {
    const res = await fetch(`https://api.xiaofengqwq.com/api/v1/music/song?id=${id}`);
    const json = await res.json();
    if (json.code === 200 && json.data) {
        playlist = [json.data];
        renderList();
        if (!isEmbedMode) {
            dbSet('apiId', input);
            dbSet('playlist', playlist);
        }
        if (autoPlayFirst && playlist.length > 0) await playTrack(0, true);
    } else {
        throw new Error('无效的单曲 ID');
    }
}

function renderList() {
    document.getElementById('list-container').innerHTML = playlist.map((song, i) => `
            <li class="track-item ${currentIdx === i ? 'active' : ''}" onclick="playTrack(${i})">
                <img src="${song.pic}" alt="pic">
                <div class="track-info">
                    <span class="track-name">${song.name}</span>
                    <span class="track-artist">${song.artist}</span>
                </div>
            </li>
        `).join('');
}

async function playTrack(idx, autoPlay = true) {
    if (idx < 0 || idx >= playlist.length) return;
    currentIdx = idx;
    let song = playlist[idx];

    // 如果是未拉取真实数据的占位歌曲，在点击播放时加载
    if (song.isPlaceholder) {
        document.getElementById('track-name-large').innerText = "加载中...";
        document.getElementById('track-artist-large').innerText = "正在同步音频流信号...";
        document.getElementById('cover').src = song.pic; // 使用预览图占位

        try {
            const res = await fetch(`https://api.xiaofengqwq.com/api/v1/music/song?id=${song.id}`);
            const json = await res.json();
            if (json.code === 200 && json.data) {
                playlist[idx] = {
                    ...json.data,
                    id: song.id
                };
                song = playlist[idx];
            } else {
                alert("无法解析该歌曲的播放源");
                return;
            }
        } catch (e) {
            console.error(e);
            alert("加载音频详情时发生网络错误");
            return;
        }
    }

    document.getElementById('cover').src = song.pic;
    document.getElementById('ambient-bg').src = song.pic;
    document.getElementById('track-name-large').innerText = song.name;
    document.getElementById('track-artist-large').innerText = song.artist;

    document.getElementById('view-player').classList.remove('show-lyrics');
    renderList();

    // 显示定位按钮并自动滚动
    document.getElementById('locate-btn').style.display = 'flex';
    setTimeout(scrollToCurrentTrack, 100);

    if (!isEmbedMode) dbSet('currentIdx', idx);
    if (window.innerWidth <= 950 && autoPlay && !isEmbedMode) switchTab('player');

    audio.src = song.url;
    if (autoPlay) {
        initAudioPipeline();
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        audio.play().catch(err => console.log("播放被浏览器拦截:", err));
    }

    fetchLRC(song.lrc);
    updateMediaSession(song);
}

function updateMediaSession(song) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: song.name, artist: song.artist, album: 'Flux Audio', artwork: [{ src: song.pic, sizes: '512x512', type: 'image/jpeg' }] });
}

function setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', togglePlay); navigator.mediaSession.setActionHandler('pause', togglePlay);
    navigator.mediaSession.setActionHandler('previoustrack', prev); navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('seekto', (d) => { if (d.fastSeek && ('fastSeek' in audio)) audio.fastSeek(d.seekTime); else audio.currentTime = d.seekTime; });
}

async function fetchLRC(url) {
    const box = document.getElementById('lrc-box');
    box.innerHTML = '<div class="lrc-line" style="opacity: 0.5;">正在解码音频信号...</div>'; lrcData = [];
    try {
        const res = await fetch(url); const text = await res.text();
        const regex = /\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;
        text.split('\n').forEach(line => {
            const match = line.match(regex);
            if (match && match[4].trim()) lrcData.push({ time: parseInt(match[1]) * 60 + parseInt(match[2]) + (match[3] ? parseFloat('0.' + match[3]) : 0), text: match[4].trim() });
        });
        box.innerHTML = lrcData.length > 0 ? lrcData.map((l, i) => `<div class="lrc-line" id="lrc-${i}">${l.text}</div>`).join('') : '<div class="lrc-line">纯音乐，无歌词。</div>';
    } catch (e) { }
}

audio.addEventListener('timeupdate', () => {
    const cur = audio.currentTime; const dur = audio.duration || 0;
    document.getElementById('progress-bar').style.width = ((cur / dur) * 100 || 0) + '%';
    document.getElementById('time-cur').innerText = formatTime(cur); document.getElementById('time-dur').innerText = formatTime(dur);

    if ('mediaSession' in navigator && !isNaN(dur) && dur > 0) navigator.mediaSession.setPositionState({ duration: dur, playbackRate: audio.playbackRate, position: cur });

    if (lrcData.length > 0) {
        let activeIdx = -1;
        for (let i = 0; i < lrcData.length; i++) { if (cur >= lrcData[i].time) activeIdx = i; else break; }
        if (activeIdx !== -1) {
            const el = document.getElementById(`lrc-${activeIdx}`);
            if (el && !el.classList.contains('active')) {
                document.querySelectorAll('.lrc-line.active').forEach(e => e.classList.remove('active'));
                el.classList.add('active'); el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
});

const formatTime = (s) => isNaN(s) ? '00:00' : `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
function seek(e) { if (audio.duration) audio.currentTime = ((e.clientX - document.getElementById('progress-wrap').getBoundingClientRect().left) / document.getElementById('progress-wrap').getBoundingClientRect().width) * audio.duration; }

function togglePlay() {
    if (audio.src) {
        initAudioPipeline();
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        audio.paused ? audio.play() : audio.pause();
    }
}

function next() { playTrack((currentIdx + 1) % playlist.length); }
function prev() { playTrack((currentIdx - 1 + playlist.length) % playlist.length); }

audio.onplay = () => {
    document.getElementById('btn-play').innerHTML = iconPause;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

    // 激活并启动环境光音频律动渲染循环
    if (animId) cancelAnimationFrame(animId);
    updateAmbientBeat();
};

audio.onpause = () => {
    document.getElementById('btn-play').innerHTML = iconPlay;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
};

audio.onended = () => next();