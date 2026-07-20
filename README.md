# XQF Music Player

基于 React + TypeScript 的个人在线音乐播放器，支持网易云歌单和本地音乐。

## 功能

- 播放网易云歌单（通过 API 中转）
- 本地文件夹音乐播放（File System Access API）
- LRC 歌词同步显示
- 多风格音频频谱可视化
- 收藏列表 + 播放历史
- 深色 / 浅色模式（View Transitions API 平滑切换）
- 全局快捷键 + 移动端手势
- PWA 支持（可安装为桌面应用）
- 封面主色调提取 + 环境光晕

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 |
| 语言 | TypeScript |
| 构建 | Vite 8 |
| CSS | Tailwind CSS 4 |
| 音频 | Web Audio API |
| 本地文件 | File System Access API + music-metadata |
| PWA | Service Worker + Web Manifest |
| 持久化 | IndexedDB |

## 快速开始

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run preview
```

## 歌单 API

播放网易云歌单需要一个后端 API 服务。默认使用 `https://api.xiaofengqwq.com`，你可以通过环境变量配置自己的 API：

```bash
# .env
VITE_API_BASE=https://your-api-server.com
```

API 需提供以下端点：

- `GET /api/v1/music/playlist?server=netease&id={playlistId}`
- `GET /api/v1/music/url?server=netease&id={songId}`
- `GET /api/v1/music/pic?server=netease&id={picId}`

## 本地音乐

点击底部 Dock 的"我的列表"，选择本地 MP3 文件夹即可播放。支持读取 ID3 标签和同名 `.lrc` 歌词文件。

## 快捷键

| 键 | 功能 |
|----|------|
| Space | 播放 / 暂停 |
| ← → | 上一首 / 下一首 |
| ↑ ↓ | 音量增减 |
| M | 静音 |
| Ctrl+F | 搜索 |

## 许可

MIT License
