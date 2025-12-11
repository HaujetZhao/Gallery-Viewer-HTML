// 移除 imports

const thumbQueue = {
    waiting: [],
    activeCount: 0,
    MAX_CONCURRENT: 4
};
let observer = null;

function setupIntersectionObserver() {
    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const el = entry.target;
            if (el.dataset.loaded === 'true') {
                observer.unobserve(el);
                return;
            }

            if (entry.isIntersecting) {
                const loaderIcon = el.parentElement.querySelector('.loading-indicator i');
                if (loaderIcon) loaderIcon.classList.add('fa-spin');

                if (el.dataset.loading !== 'true') {
                    el.dataset.loading = 'true';
                    const fileData = el.fileData;
                    const targetSize = parseInt(document.getElementById('thumbSizeSlider')?.value) || 400;
                    thumbQueue.waiting.push({ el, fileData, targetSize });
                    processThumbnailQueue();
                }
            } else {
                if (el.dataset.loading === 'true') {
                    el.dataset.loading = 'false';
                    const loaderIcon = el.parentElement.querySelector('.loading-indicator i');
                    if (loaderIcon) loaderIcon.classList.remove('fa-spin');
                }
            }
        });
    }, { rootMargin: '100px', threshold: 0 });
}

function getObserver() {
    return observer;
}

function unobserveAll() {
    if (observer) observer.disconnect();
    while (thumbQueue.waiting.length > 0) {
        const task = thumbQueue.waiting.pop();
        if (task && task.el) {
            task.el.dataset.loading = 'false';
            const loaderIcon = task.el.parentElement.querySelector('.loading-indicator i');
            if (loaderIcon) loaderIcon.classList.remove('fa-spin');
        }
    }
}

function redrawAllThumbnails(force) {
    unobserveAll();
    setupIntersectionObserver(); // Re-init observer if disconnected
    document.querySelectorAll('.thumbnail-canvas, .thumbnail-img').forEach(el => {
        el.dataset.loaded = 'false';
        el.dataset.loading = 'false';
        if (el.tagName === 'CANVAS') {
            const ctx = el.getContext('2d');
            ctx.clearRect(0, 0, el.width, el.height);
        }
        observer.observe(el);
    });
}

async function processThumbnailQueue() {
    if (thumbQueue.activeCount >= thumbQueue.MAX_CONCURRENT) return;
    if (thumbQueue.waiting.length === 0) return;

    let task = null;
    while (thumbQueue.waiting.length > 0) {
        const candidate = thumbQueue.waiting.shift();
        if (candidate.el.dataset.loading === 'true') {
            task = candidate;
            break;
        }
    }

    if (!task) return;

    thumbQueue.activeCount++;
    try {
        await generateAndShowThumbnail(task);
    } catch (e) {
        console.error("生成缩略图失败", task.fileData.name, e);
        showErrorOnCanvas(task.el, "Error");
        task.el.dataset.loading = 'false';
    } finally {
        thumbQueue.activeCount--;
        processThumbnailQueue();
    }
    processThumbnailQueue();
}

async function generateAndShowThumbnail({ el, fileData, targetSize }) {
    let md5 = fileData.md5;
    if (!md5) {
        try {
            const file = await fileData.handle.getFile();
            md5 = await calculateMD5(file); // 使用全局 calculateMD5
            fileData.md5 = md5;
        } catch (e) {
            el.dataset.loading = 'false';
            showErrorOnCanvas(el, "Missing");
            return;
        }
    }

    const cached = await getThumbnailFromDB(md5, targetSize); // 使用全局 getThumbnailFromDB
    let blob = cached ? cached.blob : null;

    if (!blob) {
        const img = new Image();
        img.src = fileData.blobUrl;
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        if (el.tagName === 'CANVAS') {
            blob = await drawToCanvasAndBlob(el, img, targetSize);
            saveThumbnailToDB({ // 使用全局 saveThumbnailToDB
                id: `${md5}_${targetSize}`,
                md5, size: fileData.size, width: targetSize,
                timestamp: Date.now(), blob
            });
        } else {
            el.src = img.src;
        }
    } else if (el.tagName === 'CANVAS') {
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        await new Promise(r => img.onload = r);
        const ctx = el.getContext('2d');
        el.width = img.width; el.height = img.height;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(img.src);
    }

    el.dataset.loaded = 'true';
    el.dataset.loading = 'false';

    const loader = el.parentElement.querySelector('.loading-indicator');
    if (loader) loader.remove();

    if (observer) observer.unobserve(el);
}

function drawToCanvasAndBlob(canvas, img, size) {
    return new Promise(resolve => {
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const ratio = Math.max(size / img.width, size / img.height);
        const centerShift_x = (size - img.width * ratio) / 2;
        const centerShift_y = (size - img.height * ratio) / 2;

        ctx.drawImage(img, 0, 0, img.width, img.height,
            centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);

        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
    });
}

function showErrorOnCanvas(canvas, txt) {
    if (canvas.tagName !== 'CANVAS') return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#999'; ctx.textAlign = 'center'; ctx.fillText(txt, canvas.width / 2, canvas.height / 2);
}
