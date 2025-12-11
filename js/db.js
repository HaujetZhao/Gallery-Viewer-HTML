// 移除 imports，改为依赖全局定义的 UI.showToast

const DB_NAME = 'PhotoViewerDB';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';
let db = null;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => { db = e.target.result; resolve(db); };
        request.onerror = reject;
    });
}

function getDB() { return db; }

function saveThumbnailToDB(data) {
    if (!db) return;
    try {
        db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).put(data);
    } catch (e) { console.error("DB Save Error", e); }
}

function getThumbnailFromDB(md5, width) {
    return new Promise(resolve => {
        if (!db) { resolve(null); return; }
        const req = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(`${md5}_${width}`);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = () => resolve(null);
    });
}

function clearAllCache() {
    if (!db) return;
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
        console.log("IndexedDB 全部清空");
        showToast("已清空所有缓存", "success");
        updateStorageUsage();
        redrawAllThumbnails(true);
    };
}

async function updateStorageUsage() {
    if (navigator.storage && navigator.storage.estimate) {
        try {
            const estimate = await navigator.storage.estimate();
            const usedMB = (estimate.usage / (1024 * 1024)).toFixed(2);
            const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(0);
            const percent = ((estimate.usage / estimate.quota) * 100).toFixed(1);
            const infoValue = document.getElementById('storageInfoValue');
            if (infoValue) infoValue.textContent = `${usedMB} MB / ${quotaMB} MB (${percent}%)`;
        } catch (e) {
            const infoValue = document.getElementById('storageInfoValue');
            if (infoValue) infoValue.textContent = "无法获取存储信息";
        }
    } else {
        const infoValue = document.getElementById('storageInfoValue');
        if (infoValue) infoValue.textContent = "浏览器不支持存储估算";
    }
}

function cleanOldCache() {
    if (!db) return;
    const DAYS_20 = 20 * 24 * 60 * 60 * 1000;
    const timeThreshold = Date.now() - DAYS_20;
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    let deletedCount = 0;

    request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            const record = cursor.value;
            const lastTime = record.lastAccessed || record.timestamp || Date.now();
            if (lastTime < timeThreshold) {
                cursor.delete();
                deletedCount++;
            }
            cursor.continue();
        }
    };

    transaction.oncomplete = () => {
        if (deletedCount > 0) {
            showToast(`已清理 ${deletedCount} 张旧缩略图`, "success");
            updateStorageUsage();
        } else {
            showToast("没有超过20天未访问的图片", "success");
        }
    };

    transaction.onerror = (e) => {
        console.error("清理旧图失败", e);
        showToast("清理失败", "error");
    };
}

function deleteThumbnail(id) {
    if (!db) return;
    db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).delete(id);
}
