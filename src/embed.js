(() => {
    const API_URL = 'https://api.xiaofengqwq.com/api/v1/music/playlist?server=netease&id=';
    const DEFAULT_PLAYLIST_ID = '6634356386';
    const params = new URLSearchParams(window.location.search);
    const theme = params.get('theme') || 'auto';
    const htmlEl = document.documentElement;

    mdui.setColorScheme('#0061a4');
    htmlEl.classList.remove('mdui-theme-auto', 'mdui-theme-dark', 'mdui-theme-light');
    htmlEl.classList.add(['auto', 'dark', 'light'].includes(theme) ? `mdui-theme-${theme}` : 'mdui-theme-auto');

    const els = {
        cover: document.getElementById('cover'),
        songName: document.getElementById('song-name'),
        artistName: document.getElementById('artist-name'),
        lyricLine: document.getElementById('lyric-line'),
        btnPrev: document.getElementById('btn-prev'),
        btnPlay: document.getElementById('btn-play'),
        btnNext: document.getElementById('btn-next'),
        progress: document.getElementById('progress'),
        timeCurrent: document.getElementById('time-current'),
        timeTotal: document.getElementById('time-total'),
        status: document.getElementById('status'),
        bgA: document.getElementById('ambient-bg-a'),
        bgB: document.getElementById('ambient-bg-b')
    };

    const audio = new Audio();
    let playlist = [];
    let currentIndex = 0;
    let isDragging = false;
    let lyrics = [];
    let currentLyricIndex = -1;
    let activeBgIndex = 0;
    let currentCoverUrl = '';
    let backgroundSwitchToken = 0;

    function extractPlaylistId(input) {
        const trimmed = String(input || '').trim();
        if (/^\d+$/.test(trimmed)) return trimmed;
        let match = trimmed.match(/[?&]id=(\d+)/i);
        if (match && match[1]) return match[1];
        match = trimmed.match(/playlist\?id=(\d+)/i);
        return match && match[1] ? match[1] : null;
    }

    function formatTime(seconds) {
        if (!Number.isFinite(seconds)) return '00:00';
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function setStatus(message, visible = true) {
        els.status.textContent = message;
        els.status.classList.toggle('hidden', !visible);
    }

    function preloadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = reject;
            img.src = url;
        });
    }

    async function setAmbientBackground(url) {
        const coverUrl = url || 'https://via.placeholder.com/300';
        if (coverUrl === currentCoverUrl) return;

        const token = ++backgroundSwitchToken;
        const layers = [els.bgA, els.bgB];
        const nextIndex = activeBgIndex === 0 ? 1 : 0;
        const currentLayer = layers[activeBgIndex];
        const nextLayer = layers[nextIndex];

        try {
            await preloadImage(coverUrl);
        } catch (error) {
            console.warn('背景图片预加载失败', error);
        }

        if (token !== backgroundSwitchToken) return;

        nextLayer.style.backgroundImage = `url("${coverUrl}")`;
        nextLayer.classList.remove('is-active');

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                nextLayer.classList.add('is-active');
                currentLayer.classList.remove('is-active');
                activeBgIndex = nextIndex;
                currentCoverUrl = coverUrl;
            });
        });
    }

    function setCover(url) {
        const coverUrl = url || 'https://via.placeholder.com/300';
        els.cover.src = coverUrl;
        setAmbientBackground(coverUrl);
    }

    function setLyric(text) {
        const nextText = text || '暂无歌词';
        if (els.lyricLine.textContent === nextText) return;

        els.lyricLine.classList.add('is-changing');
        window.setTimeout(() => {
            els.lyricLine.textContent = nextText;
            els.lyricLine.classList.remove('is-changing');
        }, 120);
    }

    function parseLyrics(rawLrc) {
        const timeExp = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\]/;
        return rawLrc.split('\n').map(line => {
            const match = timeExp.exec(line);
            if (!match) return null;

            const min = parseInt(match[1], 10);
            const sec = parseFloat(match[2]);
            const text = line.replace(timeExp, '').trim();
            if (!text) return null;

            return { time: min * 60 + sec, text };
        }).filter(Boolean);
    }

    async function loadLyrics(lrcUrl) {
        lyrics = [];
        currentLyricIndex = -1;
        setLyric('歌词加载中...');

        if (!lrcUrl) {
            setLyric('纯音乐，请欣赏');
            return;
        }

        try {
            const res = await fetch(lrcUrl);
            const textResponse = await res.text();
            let rawLrc = textResponse;

            try {
                const json = JSON.parse(textResponse);
                if (json.lrc) rawLrc = json.lrc;
                else if (json.data && json.data.lrc) rawLrc = json.data.lrc;
                else if (json.data) rawLrc = json.data;
            } catch (error) { }

            lyrics = parseLyrics(rawLrc);
            if (lyrics.length) setLyric(lyrics[0].text);
            else setLyric('未匹配到时间轴歌词');
        } catch (error) {
            setLyric('歌词加载失败');
            console.error(error);
        }
    }

    function syncLyrics() {
        if (!lyrics.length) return;

        let activeIndex = lyrics.findIndex(line => line.time > audio.currentTime) - 1;
        if (activeIndex < 0) activeIndex = 0;
        if (activeIndex === -2) activeIndex = lyrics.length - 1;
        if (activeIndex === currentLyricIndex) return;

        currentLyricIndex = activeIndex;
        setLyric(lyrics[activeIndex].text);
    }

    function loadSong(index, autoPlay = false) {
        if (!playlist.length) return;
        currentIndex = (index + playlist.length) % playlist.length;
        const song = playlist[currentIndex];
        audio.src = song.url;
        els.songName.textContent = song.name || '未知歌曲';
        els.artistName.textContent = song.artist || '未知歌手';
        els.progress.value = 0;
        els.timeCurrent.textContent = '00:00';
        els.timeTotal.textContent = '00:00';
        setCover(song.pic);
        loadLyrics(song.lrc);
        setStatus('', false);

        if (autoPlay) {
            audio.play().catch(() => {
                setStatus('点击播放按钮开始播放');
                setTimeout(() => setStatus('', false), 1600);
            });
        }
    }

    async function loadPlaylist(id) {
        setStatus('正在拉取歌单数据...');
        try {
            const res = await fetch(`${API_URL}${id}`);
            const data = await res.json();
            if (data.code === 200 && Array.isArray(data.data) && data.data.length) {
                playlist = data.data.filter(song => song && song.url);
                if (!playlist.length) {
                    setStatus('歌单暂无可播放歌曲');
                    return;
                }
                loadSong(0, false);
            } else {
                setStatus('歌单为空或拉取失败');
            }
        } catch (error) {
            setStatus('网络错误，请稍后重试');
            console.error(error);
        }
    }

    els.btnPlay.addEventListener('click', () => {
        if (!audio.src) return;
        if (audio.paused) audio.play();
        else audio.pause();
    });

    els.btnPrev.addEventListener('click', () => loadSong(currentIndex - 1, true));
    els.btnNext.addEventListener('click', () => loadSong(currentIndex + 1, true));

    els.progress.addEventListener('input', (event) => {
        isDragging = true;
        if (audio.duration) {
            els.timeCurrent.textContent = formatTime((Number(event.target.value) / 100) * audio.duration);
        }
    });

    els.progress.addEventListener('change', (event) => {
        if (audio.duration) audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
        isDragging = false;
    });

    audio.addEventListener('play', () => {
        els.btnPlay.setAttribute('icon', 'pause');
        els.cover.classList.add('playing');
    });

    audio.addEventListener('pause', () => {
        els.btnPlay.setAttribute('icon', 'play_arrow');
        els.cover.classList.remove('playing');
    });

    audio.addEventListener('loadedmetadata', () => {
        els.timeTotal.textContent = formatTime(audio.duration);
    });

    audio.addEventListener('timeupdate', () => {
        if (!isDragging && audio.duration) {
            els.progress.value = (audio.currentTime / audio.duration) * 100;
            els.timeCurrent.textContent = formatTime(audio.currentTime);
        }
        syncLyrics();
    });

    audio.addEventListener('ended', () => loadSong(currentIndex + 1, true));
    audio.addEventListener('error', () => setTimeout(() => loadSong(currentIndex + 1, true), 1200));

    const playlistId = extractPlaylistId(params.get('id')) || DEFAULT_PLAYLIST_ID;
    loadPlaylist(playlistId);
})();
