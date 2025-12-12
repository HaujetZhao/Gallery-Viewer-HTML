
/**
 * Modal 图片查看器类
 * 负责图片的全屏查看、缩放、平移等交互功能
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

        // 初始化事件监听
        this.setupEvents();
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
     * 加载 SVG 文件
     */
    loadSVG(blobUrl) {
        this.modalImage.style.display = 'none';

        // 移除旧的 SVG 容器
        const oldSvgContainer = this.modal.querySelector('.svg-container');
        if (oldSvgContainer) oldSvgContainer.remove();

        // 创建新容器
        const svgContainer = document.createElement('div');
        svgContainer.className = 'svg-container';

        // 读取并插入 SVG
        fetch(blobUrl)
            .then(response => response.text())
            .then(svgText => {
                svgContainer.innerHTML = svgText;
                this.modalLoader.classList.add('hidden');
            })
            .catch(err => {
                console.error('加载 SVG 失败:', err);
                this.modalLoader.classList.add('hidden');
                showToast('加载 SVG 失败', 'error');
            });

        this.modalContent.appendChild(svgContainer);
    }

    /**
     * 加载普通图片
     */
    loadImage(blobUrl) {
        // 移除 SVG 容器
        const oldSvgContainer = this.modal.querySelector('.svg-container');
        if (oldSvgContainer) oldSvgContainer.remove();

        this.modalImage.style.display = 'block';
        this.modalImage.onload = () => {
            this.modalLoader.classList.add('hidden');
            this.modalImage.style.filter = 'brightness(1)';
        };
        this.modalImage.style.filter = 'brightness(0.7)';
        this.modalImage.src = blobUrl;
    }

    /**
     * 打开 Modal 显示图片
     */
    async open(fileData) {
        if (!fileData) return;

        // 设置当前文件数据
        this.fileData = fileData;

        try {
            // 1. 准备文件数据
            const ready = await this.prepareFileData();
            if (!ready) return;

            // 2. 显示 Modal
            this.show();

            // 3. 根据文件类型加载内容
            const isSVG = this.fileData.name.toLowerCase().endsWith('.svg');
            if (isSVG) {
                this.loadSVG(this.fileData.blobUrl);
            } else {
                this.loadImage(this.fileData.blobUrl);
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
        this.modalImage.src = '';

        // 清理 SVG 容器（如果存在）
        const svgContainer = this.modal.querySelector('.svg-container');
        if (svgContainer) svgContainer.remove();
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
