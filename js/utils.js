function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(ts) { return new Date(ts).toLocaleDateString(); }

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}


function windowsCompareStrings(a, b) {
    // 1. numeric: true  -> 开启数字感知排序（自然排序）。例如 'a10' 会排在 'a2' 后面。
    // 2. sensitivity: 'base' -> 忽略大小写、重音和符号差异（如 'a' 和 'A' 视为相等）。
    //    Windows 文件名通常是大小写不敏感的。
    return a.localeCompare(b, 'zh-CN', {
        numeric: true,
        sensitivity: 'base'
    });
}

function getMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp', 'svg': 'image/svg+xml'
    };
    return map[ext] || 'application/octet-stream';
}

function calculateMD5(file) {
    return new Promise((resolve, reject) => {
        const blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
        const chunkSize = 2097152; // 2MB
        const chunk = blobSlice.call(file, 0, chunkSize);

        const fileReader = new FileReader();

        fileReader.onload = function (e) {
            const hash = SparkMD5.ArrayBuffer.hash(e.target.result);
            resolve(hash);
        };

        fileReader.onerror = reject;
        fileReader.readAsArrayBuffer(chunk);
    });
}

async function getImageInfoFromHeader(file) {
    if (file.size < 30) return null;

    let view = new DataView(await file.slice(0, 30).arrayBuffer());
    let sign = view.getUint32(0);

    if (sign === 0x89504e47) return [view.getUint32(16), view.getUint32(20), 'png'];
    else if (sign === 0x47494638) return [view.getUint16(6, true), view.getUint16(8, true), 'gif'];
    else if ((sign >>> 16) === 0x424d) return [Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true)), 'bmp'];
    else if ((sign >>> 8) === 0xffd8ff) {
        const jpegData = await file.slice(0, 128 * 1024).arrayBuffer();
        view = new DataView(jpegData);
        let offset = 2;
        while (offset < view.byteLength) {
            const marker = view.getUint16(offset);
            offset += 2;
            if (marker === 0xffc0 || marker === 0xffc2) return [view.getUint16(offset + 3), view.getUint16(offset + 1), 'jpg'];
            offset += view.getUint16(offset);
        }
    } else if (sign === 0x52494646) {
        view = new DataView(await file.slice(0, 40).arrayBuffer());
        const vp8 = view.getUint32(12);
        if (vp8 === 0x56503820) return [view.getUint16(26, true), view.getUint16(28, true), 'webp'];
        else if (vp8 === 0x56503858) return [(view.getUint32(24, true) & 0x00FFFFFF) + 1, ((view.getUint32(27, true) >> 8) & 0x00FFFFFF) + 1, 'webp'];
        else if (vp8 === 0x5650384c) {
            const b1 = view.getUint16(21, true);
            const b2 = view.getUint16(22, true);
            return [(b1 & 0x3fff) + 1, ((b2 >> 6) & 0x3fff) + 1, 'webp'];
        }
    }
    return null;
}

async function verifyHandlePermission(handle) {
    if (await handle.queryPermission({ mode: 'read' }) === 'granted') return true;
    if (await handle.requestPermission({ mode: 'read' }) === 'granted') return true;
    throw new Error('权限被拒绝');
}

function convertToPngBlob(blobUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error("Canvas 导出失败"));
                }, 'image/png', 1.0);
            } catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error("图片加载失败，无法转码"));
        img.src = blobUrl;
    });
}

// Debug Helper
window.getPic = function (n) {
    if (typeof globals === 'undefined') return "Globals not found";

    if (n === undefined || n < 0 || n >= globals.currentDisplayList.length) {
        console.log(`Usage: getPic(index). Max index: ${globals.currentDisplayList.length - 1}`);
        return null;
    }
    const fd = globals.currentDisplayList[n];
    return fd.dom;
};

// Also expose extractExif helper
window.extractExif = async function (fileObj) {
    if (!fileObj || !window.EXIF) return null;
    return new Promise(resolve => {
        window.EXIF.getData(fileObj, function () {
            const allTags = window.EXIF.getAllTags(this);
            resolve(allTags);
        });
    });
};
