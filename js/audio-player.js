/**
 * 自定义音频播放器组件
 * 提供丰富的音频播放界面,包括封面、歌曲信息、进度控制等
 */

class AudioPlayer {
    constructor() {
        this.container = null;
        this.audio = null;
        this.visualizerInterval = null;
    }

    /**
     * 创建播放器 DOM 结构
     * @returns {HTMLElement} 播放器容器元素
     */
    createDOM() {
        const container = document.createElement('div');
        container.className = 'modal-media modal-audio-player';

        container.innerHTML = `
            <div class="audio-player-wrapper">
                <div class="audio-cover-container">
                    <div class="audio-cover">
                        <img class="cover-image" src="" alt="封面">
                        <div class="cover-placeholder">
                            <i class="fas fa-music"></i>
                        </div>
                    </div>
                    <div class="audio-visualizer">
                        <div class="visualizer-bar"></div>
                        <div class="visualizer-bar"></div>
                        <div class="visualizer-bar"></div>
                        <div class="visualizer-bar"></div>
                        <div class="visualizer-bar"></div>
                    </div>
                </div>
                
                <div class="audio-info">
                    <h2 class="audio-title">加载中...</h2>
                    <p class="audio-artist">未知艺术家</p>
                    <p class="audio-album">未知专辑</p>
                </div>
                
                <div class="audio-controls">
                    <div class="progress-container">
                        <div class="progress-bar">
                            <div class="progress-fill"></div>
                            <div class="progress-handle"></div>
                        </div>
                        <div class="time-display">
                            <span class="current-time">0:00</span>
                            <span class="total-time">0:00</span>
                        </div>
                    </div>
                    
                    <div class="control-buttons">
                        <button class="control-btn prev-btn" title="上一首">
                            <i class="fas fa-step-backward"></i>
                        </button>
                        <button class="control-btn play-btn" title="播放">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="control-btn next-btn" title="下一首">
                            <i class="fas fa-step-forward"></i>
                        </button>
                        <div class="volume-control">
                            <button class="control-btn volume-btn" title="音量">
                                <i class="fas fa-volume-up"></i>
                            </button>
                            <input type="range" class="volume-slider" min="0" max="100" value="100">
                        </div>
                    </div>
                </div>
                
                <audio class="audio-element"></audio>
            </div>
        `;

        this.container = container;
        return container;
    }

    /**
     * 加载音频文件并初始化播放器
     * @param {HTMLElement} dom - 播放器容器
     * @param {string} blobUrl - 音频文件 URL
     * @param {SmartFile} fileData - 文件数据对象
     */
    async load(dom, blobUrl, fileData) {
        this.container = dom;

        // 获取 DOM 元素引用
        this.audio = dom.querySelector('.audio-element');
        const coverImage = dom.querySelector('.cover-image');
        const coverPlaceholder = dom.querySelector('.cover-placeholder');
        const titleEl = dom.querySelector('.audio-title');
        const artistEl = dom.querySelector('.audio-artist');
        const albumEl = dom.querySelector('.audio-album');
        const playBtn = dom.querySelector('.play-btn');
        const prevBtn = dom.querySelector('.prev-btn');
        const nextBtn = dom.querySelector('.next-btn');
        const progressFill = dom.querySelector('.progress-fill');
        const progressHandle = dom.querySelector('.progress-handle');
        const progressBar = dom.querySelector('.progress-bar');
        const currentTimeEl = dom.querySelector('.current-time');
        const totalTimeEl = dom.querySelector('.total-time');
        const volumeSlider = dom.querySelector('.volume-slider');
        const volumeBtn = dom.querySelector('.volume-btn');
        const visualizerBars = dom.querySelectorAll('.visualizer-bar');

        // 设置音频源
        this.audio.src = blobUrl;

        // 加载歌曲信息
        await this.loadSongInfo(fileData, titleEl, artistEl, albumEl, coverImage, coverPlaceholder);

        // 绑定播放控制
        this.bindPlayControls(playBtn, visualizerBars);

        // 绑定导航控制
        this.bindNavigationControls(prevBtn, nextBtn);

        // 绑定进度控制
        this.bindProgressControls(progressBar, progressFill, progressHandle, currentTimeEl, totalTimeEl);

        // 绑定音量控制
        this.bindVolumeControls(volumeSlider, volumeBtn);

        // 阻止点击事件冒泡,防止关闭 modal
        dom.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    /**
     * 加载歌曲信息 (标题、艺术家、专辑、封面)
     */
    async loadSongInfo(fileData, titleEl, artistEl, albumEl, coverImage, coverPlaceholder) {
        // 获取文件名作为默认标题
        const fileName = fileData?.name || '未知歌曲';
        titleEl.textContent = fileName.replace(/\.[^/.]+$/, ''); // 移除扩展名

        // 尝试提取 ID3 标签
        if (fileData && fileData.type === 'mp3') {
            try {
                const id3Tags = await extractID3Tags(fileData);
                if (id3Tags) {
                    if (id3Tags.title) titleEl.textContent = id3Tags.title;
                    if (id3Tags.artist) artistEl.textContent = id3Tags.artist;
                    if (id3Tags.album) albumEl.textContent = id3Tags.album;
                }
            } catch (err) {
                console.error('提取 ID3 失败:', err);
            }

            // 尝试提取封面
            try {
                const coverBlob = await extractAudioCover(fileData);
                if (coverBlob) {
                    const coverUrl = URL.createObjectURL(coverBlob);
                    coverImage.src = coverUrl;
                    coverImage.style.display = 'block';
                    coverPlaceholder.style.display = 'none';
                }
            } catch (err) {
                console.error('提取封面失败:', err);
            }
        }
    }

    /**
     * 绑定播放/暂停控制
     */
    bindPlayControls(playBtn, visualizerBars) {
        playBtn.addEventListener('click', () => {
            if (this.audio.paused) {
                this.audio.play();
                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                this.startVisualizer(visualizerBars);
            } else {
                this.audio.pause();
                playBtn.innerHTML = '<i class="fas fa-play"></i>';
                this.stopVisualizer(visualizerBars);
            }
        });
    }

    /**
     * 绑定上一首/下一首控制
     */
    bindNavigationControls(prevBtn, nextBtn) {
        prevBtn.addEventListener('click', () => {
            if (window.imageModal) {
                const currentIndex = window.imageModal.currentIndex;
                if (currentIndex > 0) {
                    window.imageModal.openByIndex(currentIndex - 1);
                }
            }
        });

        nextBtn.addEventListener('click', () => {
            if (window.imageModal) {
                const currentIndex = window.imageModal.currentIndex;
                const totalFiles = globals.visibleFileList?.length || 0;
                if (currentIndex < totalFiles - 1) {
                    window.imageModal.openByIndex(currentIndex + 1);
                }
            }
        });
    }

    /**
     * 绑定进度条控制
     */
    bindProgressControls(progressBar, progressFill, progressHandle, currentTimeEl, totalTimeEl) {
        // 更新进度
        this.audio.addEventListener('timeupdate', () => {
            const progress = (this.audio.currentTime / this.audio.duration) * 100;
            progressFill.style.width = progress + '%';
            progressHandle.style.left = progress + '%';
            currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
        });

        // 加载元数据
        this.audio.addEventListener('loadedmetadata', () => {
            totalTimeEl.textContent = this.formatTime(this.audio.duration);
        });

        // 点击进度条跳转
        progressBar.addEventListener('click', (e) => {
            const rect = progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            this.audio.currentTime = percent * this.audio.duration;
        });

        // 拖动进度条
        let isDragging = false;

        progressHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const rect = progressBar.getBoundingClientRect();
                let percent = (e.clientX - rect.left) / rect.width;
                percent = Math.max(0, Math.min(1, percent));
                this.audio.currentTime = percent * this.audio.duration;
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    /**
     * 绑定音量控制
     */
    bindVolumeControls(volumeSlider, volumeBtn) {
        volumeSlider.addEventListener('input', (e) => {
            this.audio.volume = e.target.value / 100;
            this.updateVolumeIcon(volumeBtn, e.target.value);
        });

        volumeBtn.addEventListener('click', () => {
            if (this.audio.volume > 0) {
                this.audio.dataset.prevVolume = this.audio.volume;
                this.audio.volume = 0;
                volumeSlider.value = 0;
                this.updateVolumeIcon(volumeBtn, 0);
            } else {
                const prevVolume = this.audio.dataset.prevVolume || 1;
                this.audio.volume = prevVolume;
                volumeSlider.value = prevVolume * 100;
                this.updateVolumeIcon(volumeBtn, prevVolume * 100);
            }
        });
    }

    /**
     * 更新音量图标
     */
    updateVolumeIcon(volumeBtn, volume) {
        const icon = volumeBtn.querySelector('i');
        if (volume == 0) {
            icon.className = 'fas fa-volume-mute';
        } else if (volume < 50) {
            icon.className = 'fas fa-volume-down';
        } else {
            icon.className = 'fas fa-volume-up';
        }
    }

    /**
     * 启动可视化效果
     */
    startVisualizer(visualizerBars) {
        this.visualizerInterval = setInterval(() => {
            visualizerBars.forEach(bar => {
                const height = Math.random() * 100;
                bar.style.height = height + '%';
            });
        }, 100);
    }

    /**
     * 停止可视化效果
     */
    stopVisualizer(visualizerBars) {
        clearInterval(this.visualizerInterval);
        visualizerBars.forEach(bar => {
            bar.style.height = '20%';
        });
    }

    /**
     * 格式化时间 (秒 -> MM:SS)
     */
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * 清理资源
     */
    cleanup() {
        this.stopVisualizer([]);
        if (this.audio) {
            this.audio.pause();
            this.audio.src = '';
        }
    }
}

// 导出单例实例
const audioPlayerInstance = new AudioPlayer();
