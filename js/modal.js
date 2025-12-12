
/**
 * 媒体类型策略 - 定义不同媒体类型的处理方式
 */
const MediaStrategies = {
    // 图片策略
    image: {
        types: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
        createDOM: () => {
            const img = document.createElement('img');
            img.className = 'modal-media modal-image';
            img.draggable = false;
            img.alt = 'Full view';
            return img;
        },
        load: async (dom, blobUrl) => {
            return new Promise((resolve, reject) => {
                dom.onload = () => {
                    dom.style.filter = 'brightness(1)';
                    resolve();
                };
                dom.onerror = () => reject(new Error('图片加载失败'));
                dom.style.filter = 'brightness(0.7)';
                dom.src = blobUrl;
            });
        }
    },

    // SVG 策略
    svg: {
        types: ['svg'],
        createDOM: () => {
            const container = document.createElement('div');
            container.className = 'modal-media svg-container';
            return container;
        },
        load: async (dom, blobUrl) => {
            const response = await fetch(blobUrl);
            const svgText = await response.text();
            dom.innerHTML = svgText;
        }
    },

    // 视频策略
    video: {
        types: ['mp4', 'webm', 'ogg', 'mov'],
        createDOM: () => {
            const video = document.createElement('video');
            video.className = 'modal-media modal-video';
            video.controls = true;
            video.autoplay = true;
            video.loop = false;
            return video;
        },
        load: async (dom, blobUrl) => {
            return new Promise((resolve, reject) => {
                dom.onloadeddata = () => resolve();
                dom.onerror = () => reject(new Error('视频加载失败'));
                dom.src = blobUrl;
            });
        }
    },

    // 音频策略
    audio: {
        types: ['mp3', 'wav', 'ogg', 'flac', 'm4a'],
        createDOM: () => {
            const audio = document.createElement('audio');
            audio.className = 'modal-media modal-audio';
            audio.controls = true;
            audio.autoplay = true;
            return audio;
        },
        load: async (dom, blobUrl) => {
            return new Promise((resolve, reject) => {
                dom.onloadeddata = () => resolve();
                dom.onerror = () => reject(new Error('音频加载失败'));
                dom.src = blobUrl;
            });
        }
    }
};

/**
 * 根据文件类型获取对应的媒体策略
 * @param {string} fileType - 文件类型(扩展名)
 * @returns {Object} 媒体策略对象
 */
function getMediaStrategy(fileType) {
    for (const [strategyName, strategy] of Object.entries(MediaStrategies)) {
        if (strategy.types.includes(fileType)) {
            return { name: strategyName, ...strategy };
        }
    }
    // 默认使用图片策略
    return { name: 'image', ...MediaStrategies.image };
}

/**
 * Modal 媒体查看器类
 * 支持图片、SVG、视频、音频等多种媒体类型
 */
class ImageModal {
    constructor() {
        // 当前文件数据
        this.fileData = null;

        // 状态管理
        this.isOpen = false;
        this.currentIndex = -1;
        this.scale = 1;
        this.panning = false;
        this.pointX = 0;
        this.pointY = 0;
        this.startX = 0;
        this.startY = 0;
        this.mouseDownTime = 0;
        this.mouseDownX = 0;
        this.mouseDownY = 0;

        // 触摸缩放相关
        this.initialDistance = 0;
        this.initialScale = 1;

        // DOM 元素引用
        this.modal = UI.modal;
        this.modalImage = UI.modalImage;
        this.modalLoader = UI.modalLoader;
        this.modalContent = this.modal.querySelector('.modal-content');

        // 历史缓存配置
        this.maxCacheSize = 10; // 最多缓存 10 个媒体的 DOM

        // LRU 缓存: Map 保持插入顺序,key 为 blobUrl,value 为缓存对象
        this.cache = new Map();

        // 初始化事件监听
        this.setupEvents();
    }

    /**
     * 获取或创建缓存项
     * @param {SmartFile} fileData - 文件数据
     * @returns {Object} 缓存对象 { dom, strategy, loaded }
     */
    getOrCreateCache(fileData) {
        const key = fileData.blobUrl;

        // 如果缓存中存在,移到最前面(最近使用)
        if (this.cache.has(key)) {
            const cached = this.cache.get(key);
            console.log(`[Modal Cache] 🎯 命中缓存:`, {
                file: fileData.name,
                type: cached.strategy.name,
                loaded: cached.loaded,
                cacheSize: this.cache.size
            });
            this.cache.delete(key);
            this.cache.set(key, cached);
            return cached;
        }

        // 获取媒体策略
        const strategy = getMediaStrategy(fileData.type);

        console.log(`[Modal Cache] ✨ 创建新缓存:`, {
            file: fileData.name,
            type: strategy.name,
            cacheSize: this.cache.size
        });

        // 创建 DOM
        const dom = strategy.createDOM();

        const cached = {
            dom: dom,
            strategy: strategy,
            loaded: false
        };

        // 添加到缓存
        this.cache.set(key, cached);

        // 如果超过最大缓存数,删除最久未使用的
        if (this.cache.size > this.maxCacheSize) {
            const oldestKey = this.cache.keys().next().value;
            const oldest = this.cache.get(oldestKey);

            console.log(`[Modal Cache] 🗑️ 清理最久未使用:`, {
                type: oldest.strategy.name,
                newCacheSize: this.cache.size - 1
            });

            // 清理 DOM
            if (oldest.dom && oldest.dom.parentNode) {
                oldest.dom.remove();
            }

            this.cache.delete(oldestKey);
        }

        return cached;
    }

    /**
     * 清空所有缓存
     */
    clearCache() {
        for (const [key, cached] of this.cache) {
            if (cached.dom && cached.dom.parentNode) {
                cached.dom.remove();
            }
        }
        this.cache.clear();
    }

    /**
     * 设置所有事件监听器
     */
    setupEvents() {
        // 鼠标滚轮缩放
        this.modal.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

        // 鼠标拖拽
        this.modal.addEventListener('mousedown', this.handleMouseDown.bind(this));
        window.addEventListener('mousemove', this.handleMouseMove.bind(this));
        window.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // 触摸事件
        this.modal.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.modal.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.modal.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }

    /**
     * 鼠标滚轮缩放处理
     */
    handleWheel(e) {
        if (!this.isOpen) return;
        e.preventDefault();

        const zoomIntensity = 0.15;
        const delta = e.deltaY > 0 ? -1 : 1;
        const ratio = 1 + delta * zoomIntensity;
        const newScale = this.scale * ratio;

        if (newScale < 0.1 || newScale > 10) return;

        // 以鼠标位置为中心缩放
        const rect = this.modalContent.getBoundingClientRect();
        const offsetX = e.clientX - rect.left - rect.width / 2;
        const offsetY = e.clientY - rect.top - rect.height / 2;

        this.pointX = this.pointX - offsetX * (ratio - 1);
        this.pointY = this.pointY - offsetY * (ratio - 1);
        this.scale = newScale;
        this.applyTransform();
    }

    /**
     * 鼠标按下处理
     */
    handleMouseDown(e) {
        if (!this.isOpen || e.button !== 0) return;
        e.preventDefault();
        this.panning = true;
        this.startX = e.clientX - this.pointX;
        this.startY = e.clientY - this.pointY;
        this.mouseDownTime = Date.now();
        this.mouseDownX = e.clientX;
        this.mouseDownY = e.clientY;
        this.modal.style.cursor = 'grabbing';
    }

    /**
     * 鼠标移动处理
     */
    handleMouseMove(e) {
        if (!this.panning || !this.isOpen) return;
        e.preventDefault();
        const moveX = e.clientX - this.mouseDownX;
        const moveY = e.clientY - this.mouseDownY;
        const distance = Math.sqrt(moveX * moveX + moveY * moveY);
        if (distance > 5) {
            this.pointX = e.clientX - this.startX;
            this.pointY = e.clientY - this.startY;
            this.applyTransform();
        }
    }

    /**
     * 鼠标释放处理
     */
    handleMouseUp(e) {
        if (!this.panning) return;
        const clickDuration = Date.now() - this.mouseDownTime;
        const moveX = e.clientX - this.mouseDownX;
        const moveY = e.clientY - this.mouseDownY;
        const distance = Math.sqrt(moveX * moveX + moveY * moveY);
        const isClick = distance < 5 && clickDuration < 300;

        if (isClick) {
            this.close();
        }

        this.panning = false;
        this.modal.style.cursor = '';
    }

    /**
     * 触摸开始处理
     */
    handleTouchStart(e) {
        if (!this.isOpen) return;
        if (e.touches.length === 1) {
            e.preventDefault();
            this.panning = true;
            const touch = e.touches[0];
            this.startX = touch.clientX - this.pointX;
            this.startY = touch.clientY - this.pointY;
            this.mouseDownTime = Date.now();
            this.mouseDownX = touch.clientX;
            this.mouseDownY = touch.clientY;
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            this.initialDistance = Math.sqrt(dx * dx + dy * dy);
            this.initialScale = this.scale;
        }
    }

    /**
     * 触摸移动处理
     */
    handleTouchMove(e) {
        if (!this.isOpen) return;
        if (this.panning && e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const moveX = touch.clientX - this.mouseDownX;
            const moveY = touch.clientY - this.mouseDownY;
            const distance = Math.sqrt(moveX * moveX + moveY * moveY);
            if (distance > 5) {
                this.pointX = touch.clientX - this.startX;
                this.pointY = touch.clientY - this.startY;
                this.applyTransform();
            }
        }
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            const scaleChange = currentDistance / this.initialDistance;
            const newScale = this.initialScale * scaleChange;
            if (newScale < 0.1 || newScale > 10) return;
            this.scale = newScale;
            this.applyTransform();
        }
    }

    /**
     * 触摸结束处理
     */
    handleTouchEnd(e) {
        if (e.touches.length === 0) {
            const touchDuration = Date.now() - this.mouseDownTime;
            const touch = e.changedTouches[0];
            if (touch) {
                const moveX = touch.clientX - this.mouseDownX;
                const moveY = touch.clientY - this.mouseDownY;
                const distance = Math.sqrt(moveX * moveX + moveY * moveY);
                const isTap = distance < 10 && touchDuration < 300;
                if (isTap) this.close();
            }
            this.initialDistance = 0;
            this.panning = false;
        }
    }

    /**
     * 重置图片变换
     */
    resetTransform() {
        this.scale = 1;
        this.pointX = 0;
        this.pointY = 0;
        this.applyTransform();
    }

    /**
     * 应用变换到容器
     */
    applyTransform() {
        const transform = `translate(${this.pointX}px, ${this.pointY}px) scale(${this.scale})`;
        this.modalContent.style.transform = transform;
    }

    /**
     * 准备文件数据（验证文件）
     */
    async prepareFileData() {
        const isValid = await this.fileData.validate();
        if (!isValid) {
            const recovered = await handleFileNotFound(this.fileData);
            if (!recovered) {
                showToast("无法打开图片:文件已被删除或移动", "error");
            }
            return false;
        }

        // blobUrl 已在 SmartFile 构造函数中创建,无需重复创建
        return true;
    }

    /**
     * 显示 Modal 并设置状态
     */
    show() {
        if (!this.fileData) return;

        this.isOpen = true;
        this.currentIndex = globals.visibleFileList.indexOf(this.fileData);
        globals.currentImageIndex = this.currentIndex;

        this.modal.classList.remove('hidden');
        this.modalLoader.classList.remove('hidden');
        this.resetTransform();
    }


    /**
     * 打开 Modal 显示图片
     */
    async open(fileData) {
        if (!fileData) return;


        try {
            // 1. 设置新的文件数据
            this.fileData = fileData;

            // 2. 准备文件数据
            const ready = await this.prepareFileData();
            if (!ready) return;

            // 3. 获取或创建缓存
            const cached = this.getOrCreateCache(fileData);

            // 4. 显示 Modal
            this.show();

            // 5. 清空当前显示的内容
            this.clearCurrentDisplay();

            // 6. 加载内容
            if (cached.loaded) {
                // 从缓存恢复 DOM
                this.modalContent.appendChild(cached.dom);
                this.modalLoader.classList.add('hidden');
            } else {
                // 首次加载 - 使用策略加载
                try {
                    await cached.strategy.load(cached.dom, fileData.blobUrl);
                    cached.loaded = true;
                    this.modalContent.appendChild(cached.dom);
                    this.modalLoader.classList.add('hidden');
                } catch (err) {
                    console.error('加载媒体失败:', err);
                    this.modalLoader.classList.add('hidden');
                    showToast(`加载失败: ${err.message}`, 'error');
                    throw err;
                }
            }

        } catch (err) {
            console.error("打开图片失败:", err);

            if (err.name === 'NotFoundError' || err.message?.includes('not found')) {
                await handleFileNotFound(this.fileData);
            } else {
                showToast("打开图片失败: " + err.message, "error");
            }
        }
    }

    /**
     * 清空当前显示的内容
     */
    clearCurrentDisplay() {
        // 移除所有子元素
        while (this.modalContent.firstChild) {
            this.modalContent.removeChild(this.modalContent.firstChild);
        }
    }


    /**
     * 通过索引打开图片
     */
    openByIndex(index) {
        if (globals.visibleFileList && index >= 0 && index < globals.visibleFileList.length) {
            this.open(globals.visibleFileList[index]);
        }
    }

    /**
     * 关闭 Modal
     */
    close() {
        if (!this.isOpen) return;

        this.isOpen = false;
        this.panning = false;
        this.currentIndex = -1;
        this.fileData = null;
        globals.currentImageIndex = -1;
        this.modal.classList.add('hidden');

        // 清空显示内容(但不删除缓存的 DOM)
        this.clearCurrentDisplay();
    }

    /**
     * 获取当前状态
     */
    getState() {
        return {
            isOpen: this.isOpen,
            currentIndex: this.currentIndex,
            scale: this.scale,
            pointX: this.pointX,
            pointY: this.pointY
        };
    }

    /**
     * 复制当前图片到剪贴板
     */
    async copyCurrentImage() {
        if (!this.isOpen || !this.fileData) return;
        await copyImage(this.fileData);
    }
}


// 创建全局单例
const imageModal = new ImageModal();

// 兼容旧的函数调用方式
function setupModalEvents() {
    // 已在 ImageModal 构造函数中初始化,此函数保留用于兼容性
}

function openModal(fileData) {
    return imageModal.open(fileData);
}

function openModalByIndex(index) {
    return imageModal.openByIndex(index);
}

function closeModal() {
    imageModal.close();
}

function getModalState() {
    return imageModal.getState();
}

async function copyCurrentImageToClipboard() {
    await imageModal.copyCurrentImage();
}

// 辅助函数:复制图片
async function copyImage(fileData) {
    if (!fileData) return;
    if (typeof fileData === 'string') return;

    const imageName = fileData.name || 'Image';
    try {
        let targetBlob = null;
        const file = await fileData.handle.getFile();
        if (file.type === 'image/png') {
            targetBlob = file;
        } else {
            targetBlob = await convertToPngBlob(fileData.blobUrl);
        }
        if (!targetBlob) throw new Error("无法生成图片数据");

        const textContent = fileData.blobUrl;
        const htmlContent = `<img src="${fileData.blobUrl}" alt="${imageName}" />`;
        const clipboardData = {
            'image/png': targetBlob,
            'text/plain': new Blob([textContent], { type: 'text/plain' }),
            'text/html': new Blob([htmlContent], { type: 'text/html' })
        };
        const clipboardItem = new ClipboardItem(clipboardData);
        await navigator.clipboard.write([clipboardItem]);
        showToast(`已复制: ${imageName}`, 'success');
    } catch (error) {
        console.error("复制失败:", error);
        showToast(`复制失败: ${error.message}`, 'error');
    }
}
