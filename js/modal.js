// 移除 imports

const modalState = {
    isOpen: false,
    currentIndex: -1,
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0,
    mouseDownTime: 0,
    mouseDownX: 0,
    mouseDownY: 0
};

function setupModalEvents() {
    UI.modal.addEventListener('wheel', (e) => {
        if (!modalState.isOpen) return;
        e.preventDefault();

        const zoomIntensity = 0.15;
        const delta = e.deltaY > 0 ? -1 : 1;
        const ratio = 1 + delta * zoomIntensity;
        const newScale = modalState.scale * ratio;

        if (newScale < 0.1 || newScale > 10) return;

        const imgRect = UI.modalImage.getBoundingClientRect();
        const imgWidth = imgRect.width / modalState.scale;
        const imgHeight = imgRect.height / modalState.scale;

        const modalRect = UI.modal.getBoundingClientRect();
        const modalCenterX = modalRect.left + modalRect.width / 2;
        const modalCenterY = modalRect.top + modalRect.height / 2;

        const originX = (ratio - 1) * imgWidth * 0.5;
        const originY = (ratio - 1) * imgHeight * 0.5;

        modalState.pointX = modalState.pointX - (ratio - 1) * (e.clientX - modalCenterX - modalState.pointX) - originX;
        modalState.pointY = modalState.pointY - (ratio - 1) * (e.clientY - modalCenterY - modalState.pointY) - originY;

        modalState.scale = newScale;
        applyTransform();
    }, { passive: false });

    UI.modal.addEventListener('mousedown', (e) => {
        if (!modalState.isOpen || e.button !== 0) return;
        e.preventDefault();
        modalState.panning = true;
        modalState.startX = e.clientX - modalState.pointX;
        modalState.startY = e.clientY - modalState.pointY;
        modalState.mouseDownTime = Date.now();
        modalState.mouseDownX = e.clientX;
        modalState.mouseDownY = e.clientY;
        UI.modal.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!modalState.panning || !modalState.isOpen) return;
        e.preventDefault();
        const moveX = e.clientX - modalState.mouseDownX;
        const moveY = e.clientY - modalState.mouseDownY;
        const distance = Math.sqrt(moveX * moveX + moveY * moveY);
        if (distance > 5) {
            modalState.pointX = e.clientX - modalState.startX;
            modalState.pointY = e.clientY - modalState.startY;
            applyTransform();
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (!modalState.panning) return;
        const clickDuration = Date.now() - modalState.mouseDownTime;
        const moveX = e.clientX - modalState.mouseDownX;
        const moveY = e.clientY - modalState.mouseDownY;
        const distance = Math.sqrt(moveX * moveX + moveY * moveY);
        const isClick = distance < 5 && clickDuration < 300;

        if (isClick && e.target !== UI.modalImage) {
            closeModal();
        }
        if (isClick) closeModal();

        modalState.panning = false;
        UI.modal.style.cursor = '';
    });

    let initialDistance = 0;
    let initialScale = 1;
    UI.modal.addEventListener('touchstart', (e) => {
        if (!modalState.isOpen) return;
        if (e.touches.length === 1) {
            e.preventDefault();
            modalState.panning = true;
            const touch = e.touches[0];
            modalState.startX = touch.clientX - modalState.pointX;
            modalState.startY = touch.clientY - modalState.pointY;
            modalState.mouseDownTime = Date.now();
            modalState.mouseDownX = touch.clientX;
            modalState.mouseDownY = touch.clientY;
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            initialDistance = Math.sqrt(dx * dx + dy * dy);
            initialScale = modalState.scale;
        }
    });

    UI.modal.addEventListener('touchmove', (e) => {
        if (!modalState.isOpen) return;
        if (modalState.panning && e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const moveX = touch.clientX - modalState.mouseDownX;
            const moveY = touch.clientY - modalState.mouseDownY;
            const distance = Math.sqrt(moveX * moveX + moveY * moveY);
            if (distance > 5) {
                modalState.pointX = touch.clientX - modalState.startX;
                modalState.pointY = touch.clientY - modalState.startY;
                applyTransform();
            }
        }
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            const scaleChange = currentDistance / initialDistance;
            const newScale = initialScale * scaleChange;
            if (newScale < 0.1 || newScale > 10) return;
            modalState.scale = newScale;
            applyTransform();
        }
    });

    UI.modal.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            const touchDuration = Date.now() - modalState.mouseDownTime;
            const touch = e.changedTouches[0];
            if (touch) {
                const moveX = touch.clientX - modalState.mouseDownX;
                const moveY = touch.clientY - modalState.mouseDownY;
                const distance = Math.sqrt(moveX * moveX + moveY * moveY);
                const isTap = distance < 10 && touchDuration < 300;
                if (isTap) closeModal();
            }
            initialDistance = 0;
            modalState.panning = false;
        }
    });
}

function resetImageTransform() {
    modalState.scale = 1;
    modalState.pointX = 0;
    modalState.pointY = 0;
    applyTransform();
}

function applyTransform() {
    UI.modalImage.style.transform = `translate(${modalState.pointX}px, ${modalState.pointY}px) scale(${modalState.scale})`;
}

function openModal(fileData) {
    if (!fileData || !fileData.blobUrl) {
        if (fileData && !fileData.blobUrl) {
            fileData.handle.getFile().then(f => {
                fileData.blobUrl = URL.createObjectURL(f);
                openModal(fileData);
            });
            return;
        }
        return;
    }

    modalState.isOpen = true;
    modalState.currentIndex = globals.currentDisplayList.indexOf(fileData);
    globals.currentImageIndex = modalState.currentIndex;

    UI.modal.classList.remove('hidden');
    UI.modalLoader.classList.remove('hidden');

    resetImageTransform();

    UI.modalImage.onload = () => {
        UI.modalLoader.classList.add('hidden');
        UI.modalImage.style.filter = 'brightness(1)';
    };
    UI.modalImage.style.filter = 'brightness(0.7)';
    UI.modalImage.src = fileData.blobUrl;
}

function openModalByIndex(index) {
    if (index >= 0 && index < globals.currentDisplayList.length) {
        openModal(globals.currentDisplayList[index]);
    }
}

function closeModal() {
    if (!modalState.isOpen) return;
    modalState.isOpen = false;
    modalState.panning = false;
    modalState.currentIndex = -1;
    globals.currentImageIndex = -1;
    UI.modal.classList.add('hidden');
    UI.modalImage.src = '';
}

function getModalState() { return modalState; }

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

async function copyCurrentImageToClipboard() {
    if (!UI.modal.classList.contains('hidden') && globals.currentImageIndex >= 0) {
        const file = globals.currentDisplayList[globals.currentImageIndex];
        if (file) await copyImage(file);
    }
}
