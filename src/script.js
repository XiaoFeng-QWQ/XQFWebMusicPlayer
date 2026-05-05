class HashRouter {
    constructor(routes, defaultRoute, app) {
        this.routes = routes;
        this.currentRoute = null;
        this.defaultRoute = defaultRoute;
        this.isAnimating = false;
        this.pipWindow = null;
        this.pipLyrics = null;
        this.app = app;
        this.init();
    }
    init() {
        window.addEventListener('hashchange', () => this.handleRouteChange());
        if (!window.location.hash) window.location.hash = `#${this.defaultRoute}`;
        else this.handleRouteChange();
    }
    handleRouteChange() {
        let hash = window.location.hash.replace('#', '');
        if (!this.routes.includes(hash)) { hash = this.defaultRoute; window.location.hash = `#${hash}`; return; }
        if (hash === this.currentRoute) return;

        this.transitionPage(this.currentRoute, hash);
        this.updateDockState(hash);
        this.currentRoute = hash;
        this.updateBackgroundOnRouteChange(hash);
    }

    updateBackgroundOnRouteChange(route) {
        if (this.app && this.app.player && this.app.player.els) {
            const isPlayerPage = route === 'player';
            const coverUrl = this.app.player.playlist[this.app.player.currentIndex]?.pic;

            if (isPlayerPage) {
                this.app.player.setAmbientBackground(coverUrl);
            } else {
                this.app.player.clearAmbientBackground();
            }
        }
    }

    transitionPage(oldRoute, newRoute) {
        const newPage = document.getElementById(newRoute);
        const oldPage = oldRoute ? document.getElementById(oldRoute) : null;
        this.isAnimating = true;

        if (oldPage) {
            if (this.app.animationsEnabled) {
                gsap.to(oldPage.querySelectorAll('.animate-pop'), {
                    scale: 0.9, opacity: 0, duration: 0.25, stagger: 0.05, ease: "power2.in",
                    onComplete: () => { oldPage.style.display = 'none'; this.enterPage(newPage); }
                });
            } else {
                oldPage.style.display = 'none';
                this.enterPage(newPage);
            }
        } else {
            this.enterPage(newPage);
        }
    }

    enterPage(pageElement) {
        pageElement.style.display = 'grid';

        if (this.app.animationsEnabled) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            window.scrollTo(0, 0);
        }

        if (this.app.animationsEnabled) {
            gsap.fromTo(pageElement.querySelectorAll('.animate-pop'),
                { scale: 0.8, opacity: 0, y: 20 },
                { scale: 1, opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: "elastic.out(1, 0.8)", onComplete: () => { this.isAnimating = false; } }
            );
        } else {
            pageElement.querySelectorAll('.animate-pop').forEach(el => {
                el.style.opacity = '1';
                el.style.scale = '1';
                el.style.transform = 'none';
            });
            this.isAnimating = false;
        }
    }

    updateDockState(activeRoute) {
        const dockButtons = document.querySelectorAll('#dock mdui-button-icon');
        dockButtons.forEach(btn => {
            if (btn.getAttribute('data-route') === activeRoute) btn.setAttribute('variant', 'filled');
            else btn.setAttribute('variant', 'text');
        });
    }
}

class MusicPlayer {
    constructor(app) {
        this.apiUrl = 'https://api.xiaofengqwq.com/api/v1/music/playlist?server=netease&id=';
        this.audio = new Audio();

        this.playlistId = '6634356386';
        this.playlist = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.playModes = ['repeat', 'repeat_one', 'shuffle'];
        this.currentModeIndex = 0;

        this.lyrics = [];
        this.currentLyricIndex = -1;

        this.pipWindow = null;
        this.pipLyrics = null;
        this.pipLines = [];
        this.isDraggingProgress = false;
        this.activeBgIndex = 0;
        this.currentCoverUrl = '';
        this.backgroundSwitchToken = 0;

        this.app = app;

        this.els = {
            coverImg: document.getElementById('cover-img'),
            songName: document.getElementById('song-name'),
            artistName: document.getElementById('artist-name'),
            timeCurrent: document.getElementById('time-current'),
            timeTotal: document.getElementById('time-total'),
            progressBar: document.getElementById('progress-bar'),
            btnPrev: document.getElementById('btn-prev'),
            btnPlay: document.getElementById('btn-play'),
            btnNext: document.getElementById('btn-next'),
            btnMode: document.getElementById('btn-mode'),
            playlistContainer: document.getElementById('playlist-container'),
            inputId: document.getElementById('playlist-id-input'),
            btnLoad: document.getElementById('btn-load'),
            volumeSlider: document.getElementById('volume-slider'),
            btnClearData: document.getElementById('btn-clear-data'),
            lyricsContainer: document.getElementById('lyrics-container'),
            lyricsList: document.getElementById('lyrics-list'),
            volumeSection: document.getElementById('volume-section'),
            bgLayer1: document.getElementById('bg-layer-1'),
            bgLayer2: document.getElementById('bg-layer-2'),
            embedPlaylistInput: document.getElementById('embed-playlist-input'),
            embedThemeSelect: document.getElementById('embed-theme-select'),
            btnGenerateEmbed: document.getElementById('btn-generate-embed'),
            btnCopyEmbed: document.getElementById('btn-copy-embed'),
            embedPreview: document.getElementById('embed-preview'),
            embedCodeOutput: document.getElementById('embed-code-output')
        };

        this.init();
    }

    init() {
        this.bindEvents();

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS && this.els.volumeSection) {
            this.els.volumeSection.style.display = 'none';
        }

        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => this.audio.play());
            navigator.mediaSession.setActionHandler('pause', () => this.audio.pause());
            navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrev());
            navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
            navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                const skip = details.seekOffset || 10;
                this.audio.currentTime = Math.max(this.audio.currentTime - skip, 0);
                this.updateMediaSessionPosition();
            });
            navigator.mediaSession.setActionHandler('seekforward', (details) => {
                const skip = details.seekOffset || 10;
                this.audio.currentTime = Math.min(this.audio.currentTime + skip, this.audio.duration);
                this.updateMediaSessionPosition();
            });
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.fastSeek && 'fastSeek' in this.audio) {
                    this.audio.fastSeek(details.seekTime);
                } else {
                    this.audio.currentTime = details.seekTime;
                }
                this.updateMediaSessionPosition();
            });
        }

        const hasSavedState = this.loadState();

        if (hasSavedState && this.playlist.length > 0) {
            this.renderPlaylist();
            this.els.inputId.value = this.playlistId;
            this.els.volumeSlider.value = this.audio.volume * 100;
            this.els.btnMode.setAttribute('icon', this.playModes[this.currentModeIndex]);
            this.loadSong(this.currentIndex, false);
        } else {
            this.loadPlaylist(this.playlistId);
        }
    }

    async openLyricsPip() {
        if (!("documentPictureInPicture" in window)) {
            mdui.snackbar({ message: "浏览器不支持画中画歌词" });
            return;
        }

        this.pipWindow = await documentPictureInPicture.requestWindow({
            width: 560,
            height: 180,
            disallowReturnToOpener: true,
        });

        const doc = this.pipWindow.document;

        doc.body.innerHTML = `
<style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    user-select: none;
  }

  body {
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(40px) saturate(200%);
    font-family: 'Inter', 'SF Pro Text', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    overflow: hidden;
    height: 100vh;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  .lyrics {
    width: 100%;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
  }

.line {
    filter: blur(1.5px);
    transform: scale(0.9);
    transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
    margin: 4px 0;
    line-height: 1.4;
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: rgba(255, 255, 255, 0.9);
}

  .line.active {
    opacity: 1;
    filter: none;
    transform: scale(1);
    font-weight: 700;
    color: #ffffff;
    white-space: normal;
    word-break: break-word;
  }

  .line.near {
    opacity: 0.7;
    filter: blur(1.5px);
    transform: scale(0.95);
    color: rgba(255, 255, 255, 0.95);
  }

</style>

<div class="lyrics">
  <div class="line" id="l1"></div>
  <div class="line active" id="l2"></div>
  <div class="line" id="l3"></div>
</div>
`;

        this.pipLines = [
            doc.getElementById("l1"),
            doc.getElementById("l2"),
            doc.getElementById("l3")
        ];
    }

    updateMediaSessionPosition() {
        if ('mediaSession' in navigator && this.audio.duration && !isNaN(this.audio.duration)) {
            try {
                navigator.mediaSession.setPositionState({
                    duration: this.audio.duration,
                    playbackRate: this.audio.playbackRate,
                    position: this.audio.currentTime
                });
            } catch (e) {
                console.warn('MediaSession 更新进度失败', e);
            }
        }
    }

    saveState() {
        const state = {
            playlistId: this.playlistId, playlist: this.playlist, currentIndex: this.currentIndex,
            playModeIndex: this.currentModeIndex, volume: this.audio.volume
        };
        localStorage.setItem('qwq_music_state', JSON.stringify(state));
    }

    loadState() {
        const saved = localStorage.getItem('qwq_music_state');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.playlistId = state.playlistId || '3778678';
                this.playlist = state.playlist || [];
                this.currentIndex = state.currentIndex || 0;
                this.currentModeIndex = state.playModeIndex || 0;
                if (state.volume !== undefined) this.audio.volume = state.volume;
                return true;
            } catch (e) { console.error("加载状态失败", e); }
        }
        return false;
    }

    clearData() {
        localStorage.removeItem('qwq_music_state');
        mdui.snackbar({ message: "播放数据已清除，重新加载页面生效" });
    }

    extractPlaylistId(input) {
        const trimmed = input.trim();
        if (!trimmed) return null;
        if (/^\d+$/.test(trimmed)) return trimmed;
        let match = trimmed.match(/[?&]id=(\d+)/i);
        if (match && match[1]) return match[1];
        match = trimmed.match(/playlist\?id=(\d+)/i);
        if (match && match[1]) return match[1];
        return null;
    }

    bindEvents() {
        this.els.btnPlay.addEventListener('click', () => this.togglePlay());
        this.els.btnPrev.addEventListener('click', () => this.playPrev());
        this.els.btnNext.addEventListener('click', () => this.playNext());
        this.els.btnMode.addEventListener('click', () => this.toggleMode());
        document.getElementById("btn-pip-lyrics").addEventListener("click", () => this.openLyricsPip());

        this.els.btnLoad.addEventListener('click', () => {
            const rawInput = this.els.inputId.value;
            const playlistId = this.extractPlaylistId(rawInput);
            if (!playlistId) {
                mdui.snackbar({ message: "无法识别歌单ID，请输入正确的网易云歌单ID或分享链接" });
                return;
            }
            this.els.inputId.value = playlistId;
            this.loadPlaylist(playlistId);
        });

        this.els.inputId.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.els.btnLoad.click();
            }
        });

        this.els.btnClearData.addEventListener('click', () => this.clearData());

        this.els.lyricsList.addEventListener('click', (e) => {
            const li = e.target.closest('.lyric-line');
            if (li && li.dataset.index) {
                const idx = parseInt(li.dataset.index, 10);
                if (this.lyrics[idx]) {
                    this.audio.currentTime = this.lyrics[idx].time;
                    this.updateMediaSessionPosition();
                    this.audio.play();
                }
            }
        });

        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('loadedmetadata', () => {
            this.els.timeTotal.textContent = this.formatTime(this.audio.duration);
            this.updateMediaSessionPosition();
        });
        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            this.els.btnPlay.setAttribute('icon', 'pause');
            this.els.coverImg.classList.remove('paused');
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        });
        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this.els.btnPlay.setAttribute('icon', 'play_arrow');
            this.els.coverImg.classList.add('paused');
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        });
        this.audio.addEventListener('ended', () => this.handleSongEnd());
        this.audio.addEventListener('error', () => {
            console.warn('音频加载失败，跳过');
            setTimeout(() => this.playNext(), 1500);
        });

        this.els.progressBar.addEventListener('input', (e) => {
            this.isDraggingProgress = true;
            if (this.audio.duration) {
                const previewTime = (e.target.value / 100) * this.audio.duration;
                this.els.timeCurrent.textContent = this.formatTime(previewTime);
            }
        });

        this.els.progressBar.addEventListener('change', (e) => {
            if (this.audio.duration) {
                this.audio.currentTime = (e.target.value / 100) * this.audio.duration;
                this.updateMediaSessionPosition();
            }
            this.isDraggingProgress = false;
        });

        this.els.volumeSlider.addEventListener('input', (e) => {
            this.audio.volume = e.target.value / 100;
            this.saveState();
        });

        this.els.btnGenerateEmbed.addEventListener('click', () => this.generateEmbedCode());
        this.els.embedPlaylistInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.generateEmbedCode();
            }
        });
        this.els.embedThemeSelect.addEventListener('change', () => this.generateEmbedCode(false));
        this.els.btnCopyEmbed.addEventListener('click', () => this.copyEmbedCode());

        this.generateEmbedCode(false);
    }

    getEmbedUrl(playlistId, theme) {
        const url = new URL('embed.html', window.location.href);
        url.searchParams.set('id', playlistId);
        url.searchParams.set('theme', theme || 'auto');
        return url.toString();
    }

    generateEmbedCode(showMessage = true) {
        const playlistId = this.extractPlaylistId(this.els.embedPlaylistInput.value);
        if (!playlistId) {
            mdui.snackbar({ message: "无法识别歌单ID，请输入正确的网易云歌单ID或分享链接" });
            return;
        }

        this.els.embedPlaylistInput.value = playlistId;
        const theme = this.els.embedThemeSelect.value || 'auto';
        const embedUrl = this.getEmbedUrl(playlistId, theme);
        const code = `<iframe src="${embedUrl}" width="100%" height="180" style="border:0" loading="lazy" allow="autoplay"></iframe>`;

        this.els.embedPreview.src = embedUrl;
        this.els.embedCodeOutput.value = code;

        if (showMessage) mdui.snackbar({ message: "iframe 播放器代码已生成" });
    }

    async copyEmbedCode() {
        const code = this.els.embedCodeOutput.value;
        if (!code) return;

        try {
            await navigator.clipboard.writeText(code);
        } catch (error) {
            this.els.embedCodeOutput.focus();
            this.els.embedCodeOutput.select();
            document.execCommand('copy');
        }

        mdui.snackbar({ message: "iframe 代码已复制" });
    }

    async loadPlaylist(id) {
        this.els.playlistContainer.innerHTML = `<mdui-list-item><div class="text-center w-100 opacity-70" style="margin-top: 40px;"><mdui-circular-progress></mdui-circular-progress><p>正在拉取歌单数据...</p></div></mdui-list-item>`;
        try {
            const res = await fetch(`${this.apiUrl}${id}`);
            const data = await res.json();
            if (data.code === 200 && data.data && data.data.length > 0) {
                this.playlistId = id;
                this.playlist = data.data;
                this.renderPlaylist();
                this.loadSong(0, false);
                this.saveState();
                mdui.snackbar({ message: "歌单加载成功" });
            } else {
                this.els.playlistContainer.innerHTML = `<mdui-list-item><div class="text-center w-100 text-error">歌单为空或拉取失败</div></mdui-list-item>`;
            }
        } catch (error) { this.els.playlistContainer.innerHTML = `<mdui-list-item><div class="text-center w-100 text-error">网络错误，请稍后重试</div></mdui-list-item>`; }
    }

    renderPlaylist() {
        this.els.playlistContainer.innerHTML = '';
        this.playlist.forEach((song, index) => {
            const item = document.createElement('mdui-list-item');
            item.setAttribute('headline', song.name);
            item.setAttribute('description', song.artist);
            item.style.cursor = 'pointer';
            item.innerHTML = `<mdui-avatar slot="icon" src="${song.pic}"></mdui-avatar>`;
            item.addEventListener('click', () => {
                this.loadSong(index, true);
                window.location.hash = '#player';
            });
            this.els.playlistContainer.appendChild(item);
        });
    }

    preloadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = reject;
            img.src = url;
        });
    }

    async setAmbientBackground(url) {
        const coverUrl = url || 'https://via.placeholder.com/300';
        if (coverUrl === this.currentCoverUrl) return;

        const bgLayer1 = this.els.bgLayer1;
        const bgLayer2 = this.els.bgLayer2;
        if (!bgLayer1 || !bgLayer2) return;

        const token = ++this.backgroundSwitchToken;
        const layers = [bgLayer1, bgLayer2];
        const nextIndex = this.activeBgIndex === 0 ? 1 : 0;
        const currentLayer = layers[this.activeBgIndex];
        const nextLayer = layers[nextIndex];

        try {
            await this.preloadImage(coverUrl);
        } catch (error) {
            console.warn('背景图片预加载失败', error);
        }

        if (token !== this.backgroundSwitchToken) return;

        nextLayer.style.backgroundImage = `url("${coverUrl}")`;
        nextLayer.classList.remove('is-active');

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                nextLayer.classList.add('is-active');
                currentLayer.classList.remove('is-active');
                this.activeBgIndex = nextIndex;
                this.currentCoverUrl = coverUrl;
            });
        });
    }

    clearAmbientBackground() {
        this.backgroundSwitchToken++;
        this.currentCoverUrl = '';
        this.els.bgLayer1?.classList.remove('is-active');
        this.els.bgLayer2?.classList.remove('is-active');
    }

    updateBackgroundCover(coverUrl) {
        const isPlayerPage = window.location.hash === '#player';

        if (isPlayerPage) {
            this.setAmbientBackground(coverUrl);
        } else {
            this.clearAmbientBackground();
        }
    }

    loadSong(index, autoPlay = true) {
        if (index < 0 || index >= this.playlist.length) return;
        this.currentIndex = index;
        const song = this.playlist[index];

        this.audio.src = song.url;
        this.els.coverImg.src = song.pic || 'https://via.placeholder.com/300';
        this.els.songName.textContent = song.name;
        this.els.artistName.textContent = song.artist;
        this.els.progressBar.value = 0;
        this.els.timeCurrent.textContent = '00:00';
        this.els.timeTotal.textContent = '00:00';
        const coverUrl = song.pic || 'https://via.placeholder.com/300';
        this.els.coverImg.src = coverUrl;

        this.updateBackgroundCover(coverUrl);

        const items = this.els.playlistContainer.querySelectorAll('mdui-list-item');
        items.forEach((item, i) => {
            if (i === index) item.setAttribute('active', '');
            else item.removeAttribute('active');
        });

        this.saveState();
        this.fetchAndParseLyrics(song.lrc);

        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.name,
                artist: song.artist,
                album: 'XQFMusicPlayer',
                artwork: [{ src: song.pic || 'https://via.placeholder.com/300', sizes: '512x512', type: 'image/jpeg' }]
            });
            navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
        }

        if (autoPlay) this.audio.play().catch(e => console.warn('自动播放被阻拦', e));
    }

    async fetchAndParseLyrics(lrcUrl) {
        this.lyrics = [];
        this.currentLyricIndex = -1;
        this.els.lyricsList.innerHTML = '<li class="lyric-line">正在加载歌词...</li>';

        if (!lrcUrl) {
            this.els.lyricsList.innerHTML = '<li class="lyric-line">纯音乐，请欣赏</li>';
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
            } catch (e) { }

            const lines = rawLrc.split('\n');
            const timeExp = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\]/;

            lines.forEach(line => {
                const match = timeExp.exec(line);
                if (match) {
                    const min = parseInt(match[1], 10);
                    const sec = parseFloat(match[2]);
                    const time = min * 60 + sec;
                    const txt = line.replace(timeExp, '').trim();
                    if (txt) this.lyrics.push({ time, text: txt });
                }
            });

            if (this.lyrics.length === 0) {
                this.els.lyricsList.innerHTML = '<li class="lyric-line">未匹配到时间轴歌词</li>';
            } else {
                this.renderLyricsDOM();
            }
        } catch (error) {
            this.els.lyricsList.innerHTML = '<li class="lyric-line">歌词加载失败</li>';
            console.error(error)
        }
    }

    renderLyricsDOM() {
        this.els.lyricsList.innerHTML = '';
        this.lyrics.forEach((line, index) => {
            const li = document.createElement('li');
            li.className = 'lyric-line';
            li.textContent = line.text;
            li.dataset.index = index;
            this.els.lyricsList.appendChild(li);
        });

        this.syncLyrics();

        if (this.app.animationsEnabled) {
            gsap.from(this.els.lyricsList.querySelectorAll('.lyric-line'), {
                opacity: 0,
                y: 30,
                filter: 'blur(10px)',
                duration: 0.8,
                stagger: 0.03,
                ease: "power3.out",
                clearProps: "all"
            });
        }
    }

    syncLyrics() {
        if (!this.lyrics || this.lyrics.length === 0) return;
        const currentTime = this.audio.currentTime;

        let activeIndex = this.lyrics.findIndex(l => l.time > currentTime) - 1;
        if (activeIndex < 0) activeIndex = 0;
        if (activeIndex === -2) activeIndex = this.lyrics.length - 1;

        if (this.currentLyricIndex !== activeIndex) {
            this.currentLyricIndex = activeIndex;
            const lines = this.els.lyricsList.querySelectorAll('.lyric-line');

            lines.forEach((li, idx) => {
                li.className = 'lyric-line';
                const distance = Math.abs(idx - activeIndex);

                if (distance === 0) {
                    li.classList.add('active');
                } else if (distance === 1) {
                    li.classList.add('near');
                } else if (distance === 2) {
                    li.classList.add('far');
                }
            });

            const activeLine = lines[activeIndex];
            if (activeLine) {
                const container = this.els.lyricsContainer;
                const offset = activeLine.offsetTop - container.clientHeight / 2 + activeLine.clientHeight / 2;

                if (this.app.animationsEnabled) {
                    container.scrollTo({
                        top: offset,
                        behavior: 'smooth'
                    });
                } else {
                    container.scrollTop = offset;
                }
            }
        }

        if (this.pipLines.length) {
            const prev = this.lyrics[activeIndex - 1]?.text || "";
            const cur = this.lyrics[activeIndex]?.text || "";
            const next = this.lyrics[activeIndex + 1]?.text || "";
            this.pipLines[0].textContent = prev;
            this.pipLines[1].textContent = cur;
            this.pipLines[2].textContent = next;
        }

        if (this.pipLyrics && this.lyrics[activeIndex]) {
            this.pipLyrics.innerHTML = `
                <div class="line">${this.lyrics[activeIndex - 1]?.text || ""}</div>
                <div class="line active">${this.lyrics[activeIndex].text}</div>
                <div class="line">${this.lyrics[activeIndex + 1]?.text || ""}</div>`;
        }
    }

    togglePlay() { if (!this.audio.src) return; this.isPlaying ? this.audio.pause() : this.audio.play(); }
    playPrev() {
        if (this.playlist.length === 0) return;
        let prevIndex = this.currentIndex - 1;
        if (prevIndex < 0) prevIndex = this.playlist.length - 1;
        this.loadSong(prevIndex, true);
    }
    playNext() {
        if (this.playlist.length === 0) return;
        let nextIndex = this.currentIndex + 1;
        if (nextIndex >= this.playlist.length) nextIndex = 0;
        this.loadSong(nextIndex, true);
    }

    toggleMode() {
        this.currentModeIndex = (this.currentModeIndex + 1) % this.playModes.length;
        this.els.btnMode.setAttribute('icon', this.playModes[this.currentModeIndex]);
        this.saveState();
        const modeNames = ['列表循环', '单曲循环', '随机播放'];
        mdui.snackbar({ message: `已切换至：${modeNames[this.currentModeIndex]}` });
    }

    handleSongEnd() {
        const mode = this.playModes[this.currentModeIndex];
        if (mode === 'repeat_one') { this.audio.currentTime = 0; this.audio.play(); }
        else if (mode === 'shuffle') {
            const randomIndex = Math.floor(Math.random() * this.playlist.length);
            this.loadSong(randomIndex, true);
        }
        else { this.playNext(); }
    }

    updateProgress() {
        if (!this.audio.duration) return;

        if (!this.isDraggingProgress) {
            const percent = (this.audio.currentTime / this.audio.duration) * 100;
            this.els.progressBar.value = percent;
            this.els.timeCurrent.textContent = this.formatTime(this.audio.currentTime);
        }

        this.syncLyrics();
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }
}

class ThemeManager {
    constructor() {
        this.htmlEl = document.documentElement;
        this.themeSwitch = document.getElementById('theme-switch');
        this.storageKey = 'bento-theme-preference';
        this.init();
    }
    init() {
        const savedTheme = localStorage.getItem(this.storageKey);
        if (savedTheme) this.applyTheme(savedTheme === 'dark');
        else this.applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches, true);
        if (this.themeSwitch) {
            this.themeSwitch.addEventListener('change', (e) => {
                const isDark = e.target.checked;
                this.applyTheme(isDark);
                localStorage.setItem(this.storageKey, isDark ? 'dark' : 'light');
            });
        }
    }
    applyTheme(isDark, isAuto = false) {
        if (this.themeSwitch) this.themeSwitch.checked = isDark;
        this.htmlEl.classList.remove('mdui-theme-auto', 'mdui-theme-dark', 'mdui-theme-light');
        if (isAuto) this.htmlEl.classList.add('mdui-theme-auto');
        else this.htmlEl.classList.add(isDark ? 'mdui-theme-dark' : 'mdui-theme-light');
    }
}

class BentoApp {
    constructor() {
        mdui.setColorScheme('#0061a4');

        this.animationsEnabled = localStorage.getItem('bento-animation-enabled') !== 'false';
        this.initAnimationSwitch();

        this.themeManager = new ThemeManager();
        this.player = new MusicPlayer(this);
        this.router = new HashRouter(['home', 'player', 'settings'], 'home', this);
    }

    initAnimationSwitch() {
        const animationSwitch = document.getElementById('animation-switch');
        if (animationSwitch) {
            animationSwitch.checked = this.animationsEnabled;
            animationSwitch.addEventListener('change', (e) => {
                this.animationsEnabled = e.target.checked;
                localStorage.setItem('bento-animation-enabled', this.animationsEnabled);
                document.body.classList.toggle('no-animations', !this.animationsEnabled);
            });
        }
        document.body.classList.toggle('no-animations', !this.animationsEnabled);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new BentoApp();
});
