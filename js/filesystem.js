// 移除 imports

const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];

async function openFolderPicker() {
    try {
        const handle = await showDirectoryPicker({
            mode: 'readwrite',
            id: 'photo-viewer-start',
            startIn: 'pictures'
        });

        UI.hint.style.display = 'none';
        appState.rootHandle = handle;
        appState.foldersData.clear();
        appState.dirMap.clear();
        UI.treeRoot.innerHTML = '';

        const rootData = await scanDirectory(handle, handle.name);
        createRootNode(rootData);
        loadFolder(handle.name);
        startBackgroundScan(handle, handle.name);

    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error(err);
            alert('打开文件夹失败: ' + err.message);
        }
    }
}

async function scanDirectory(dirHandle, path) {
    const filesData = [];
    const subFolderHandles = [];

    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            const ext = entry.name.split('.').pop().toLowerCase();
            if (imageExtensions.includes(ext)) {
                try {
                    const file = await entry.getFile();
                    filesData.push({
                        handle: entry,
                        file: file,
                        name: entry.name,
                        path: path + '/' + entry.name,
                        size: file.size,
                        lastModified: file.lastModified,
                        blobUrl: URL.createObjectURL(file),
                        dom: null,
                        md5: null
                    });
                } catch (e) { console.warn("无法读取文件:", entry.name, e); }
            }
        } else if (entry.kind === 'directory') {
            subFolderHandles.push(entry);
        }
    }

    subFolderHandles.sort((a, b) => a.name.localeCompare(b.name));
    filesData.sort((a, b) => a.name.localeCompare(b.name));

    const data = {
        handle: dirHandle,
        files: filesData,
        subFolders: subFolderHandles,
        doms: [],
        scanned: true
    };

    appState.foldersData.set(path, data);
    appState.dirMap.set(path, dirHandle);

    return data;
}

async function startBackgroundScan(parentHandle, parentPath) {
    const currentData = appState.foldersData.get(parentPath);
    if (!currentData || !currentData.subFolders) return;

    for (const subHandle of currentData.subFolders) {
        const subPath = parentPath + '/' + subHandle.name;
        await scanDirectory(subHandle, subPath);
        updateTreeWithSubFolder(parentPath, subHandle.name, subPath);
        // Yield to UI
        await new Promise(r => setTimeout(r, 0));
        await startBackgroundScan(subHandle, subPath);
    }
}

async function handleFolderClick(path, li) { // Removed ul param
    if (!path || !li) return;
    loadFolder(path);
    // toggleFolderState(li, ul); // Moved to sidebar delegation logic
    await refreshCurrentFolder(true);
}

function loadFolder(path) {
    appState.allPhotosMode = false;
    UI.refreshBtn.textContent = "刷新目录";
    UI.refreshBtn.title = "仅重新扫描当前文件夹的文件变动";

    appState.currentPath = path;
    updateActiveTreeNode(path);
    UI.pathDisplay.textContent = path;

    const data = appState.foldersData.get(path);
    if (!data) {
        UI.gallery.innerHTML = '<div class="empty-state">目录数据未就绪</div>';
        return;
    }

    globals.currentDisplayList = data.files;
    renderGallery(globals.currentDisplayList);
}

async function switchToAllPhotos() {
    appState.allPhotosMode = true;
    appState.currentPath = "ALL_PHOTOS";
    UI.refreshBtn.textContent = "重载项目";
    UI.refreshBtn.title = "重新扫描整个项目文件树";
    UI.pathDisplay.textContent = "所有图片";
    updateActiveTreeNode("ALL_PHOTOS");

    UI.gallery.innerHTML = '<div class="loader">正在聚合文件...</div>';

    await new Promise(r => setTimeout(r, 10));

    let allFiles = [];
    for (const [path, data] of appState.foldersData.entries()) {
        if (data && data.files && data.files.length > 0) {
            allFiles = allFiles.concat(data.files);
        }
    }
    globals.currentDisplayList = allFiles;
    UI.pathDisplay.textContent = `所有图片 (共 ${globals.currentDisplayList.length} 张)`;

    if (allFiles.length === 0) {
        UI.gallery.innerHTML = '<div class="empty-state">暂无图片 (后台扫描可能仍在进行，请稍候刷新)</div>';
        showToast("暂未发现图片，可能会在后台扫描完成后自动出现", "info");
    } else {
        renderGallery(allFiles);
    }
}

async function handleRefreshAction() {
    if (appState.allPhotosMode) {
        if (confirm("在【所有图片】模式下，刷新将重载整个项目并重新扫描所有文件。是否继续？")) {
            reloadProject();
        }
    } else {
        await refreshCurrentFolder();
    }
}

async function refreshCurrentFolder(silent = false) {
    const currentPath = appState.currentPath;
    let oldData = appState.foldersData.get(currentPath); // 保存旧数据引用

    if (!appState.rootHandle) {
        if (!silent) showToast("无法刷新：未找到目录信息", "error");
        return;
    }
    if (!silent) showToast("正在刷新...", "info");

    try {
        const handle = oldData ? oldData.handle : null;
        if (!handle) throw new Error("目录句柄丢失");

        // scanDirectory 会更新 appState 中的数据为 newData
        const newData = await scanDirectory(handle, currentPath);

        let hasChanges = false;

        if (!oldData) {
            hasChanges = true;
        } else {
            // 1. 检查子文件夹变化
            if (oldData.subFolders.length !== newData.subFolders.length) hasChanges = true;
            else {
                for (let i = 0; i < newData.subFolders.length; i++) {
                    if (newData.subFolders[i].name !== oldData.subFolders[i].name) {
                        hasChanges = true; break;
                    }
                }
            }

            // 2. 检查文件变化 & 尝试复用
            if (newData.files.length !== oldData.files.length) hasChanges = true;

            // 建立旧文件索引
            const oldFileMap = new Map(oldData.files.map(f => [f.name, f]));

            for (const newFile of newData.files) {
                const oldFile = oldFileMap.get(newFile.name);

                // 判断是否为同一文件且未修改 (大小和修改时间一致)
                if (oldFile && oldFile.size === newFile.size && oldFile.lastModified === newFile.lastModified) {
                    // !!! 关键复用逻辑 !!!
                    // 释放新生成的 blobUrl (因为它和旧的是一样的)
                    if (newFile.blobUrl) URL.revokeObjectURL(newFile.blobUrl);

                    // 复用旧对象的资源
                    newFile.blobUrl = oldFile.blobUrl;
                    newFile.dom = oldFile.dom; // 复用 DOM，避免闪烁
                    newFile.md5 = oldFile.md5;
                    // 如果 DOM 存在，需要更新其绑定的 fileData 引用，否则 DOM 上的 fileData 还是指向 oldFile 的
                    if (newFile.dom) {
                        newFile.dom.fileData = newFile;
                        // 更新缩略图元素的 fileData 引用
                        const media = newFile.dom.querySelector('.thumbnail-img, .thumbnail-canvas');
                        if (media) media.fileData = newFile;
                    }

                } else {
                    // 只要有一个文件不匹配（新增、修改、改名），就视为有变化
                    hasChanges = true;
                }
            }
        }

        if (hasChanges) {
            loadFolder(currentPath);
        } else {
            // 如果完全没变化，为了保持排序状态和 DOM 稳定性
            // 我们其实可以把 appState 还原回 oldData (如果排序没变的话)
            // 但 scanDirectory 返回的是按名称排序的，如果用户当前是按名称排序，那无所谓。
            // 如果用户当前是按大小排序，newData 是乱的。
            // 简单策略：如果没变化，不调用 loadFolder，保留 appState 指向 newData (拥有复用的资源)。
            // 但必须更新 globals.currentDisplayList 吗？
            // 不，如果不 loadFolder，UI 还是旧的。
            // 最好的体验是：如果没内容变化，连 appState 都回滚回 oldData，这样排序状态也都不变。
            if (oldData) {
                appState.foldersData.set(currentPath, oldData);
                // 此时 newData 里的 newFile 对象虽然复用了 blobUrl，但会被 GC。
                // 我们已经在上面 revoke 了 newFile.blobUrl (其实是放弃了新生成的，保留了旧的)
                // 因为旧的 oldData.files[i].blobUrl 还在用，所以没问题。
            }
            if (!silent) console.log("目录扫描完成：无变化，跳过刷新");
        }

        syncTreeStructure(currentPath, newData.subFolders);
        if (!silent) showToast("目录已刷新");
    } catch (e) {
        if (e.name === 'NotFoundError' || (e.message && e.message.includes('not found'))) {
            showToast(`文件夹 "${currentPath}" 已被删除`, "error");
            removeTreeNode(currentPath);
            UI.gallery.innerHTML = '<div class="empty-state">文件夹已失效</div>';
        } else {
            console.error("刷新失败", e);
            if (!silent) showToast("刷新失败: " + e.message, "error");
        }
    }
}

async function reloadProject() {
    if (!appState.rootHandle) {
        showToast("未打开任何文件夹", "error");
        return;
    }
    try {
        const handle = appState.rootHandle;
        showToast("正在重新扫描...", "warning");
        UI.treeRoot.innerHTML = '';
        UI.gallery.innerHTML = '<div class="loader">正在重新扫描...</div>';
        appState.foldersData.clear();
        appState.dirMap.clear();

        const rootData = await scanDirectory(handle, handle.name);
        createRootNode(rootData);
        loadFolder(handle.name);
        startBackgroundScan(handle, handle.name);
        showToast("项目已重新加载");
    } catch (err) {
        console.error(err);
        showToast("重载失败: " + err.message, "error");
    }
}

async function handleDropOnFolder(e, targetDirHandle, targetPath, liElement) {
    e.preventDefault();
    liElement.classList.remove('drag-over');

    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    if (!data || !data.sourceDir) return;
    if (data.sourceDir === targetPath) return;

    try {
        const sourceCache = appState.foldersData.get(data.sourceDir);
        const sourceFile = sourceCache.files.find(f => f.name === data.name);
        if (!sourceFile) throw new Error("源文件丢失");

        const newFileHandle = await targetDirHandle.getFileHandle(data.name, { create: true });
        const srcFile = await sourceFile.handle.getFile();
        const writable = await newFileHandle.createWritable();
        await writable.write(srcFile);
        await writable.close();

        await sourceCache.handle.removeEntry(data.name);

        showToast(`已移动: ${data.name}`, "success");

        const idx = sourceCache.files.indexOf(sourceFile);
        if (idx > -1) {
            sourceCache.files.splice(idx, 1);
        }

        const targetCache = appState.foldersData.get(targetPath);
        if (targetCache) {
            if (appState.currentPath === targetPath) {
                await refreshCurrentFolder(true);
            }
        }

        if (appState.currentPath === data.sourceDir) {
            renderGallery(globals.currentDisplayList);
        }

    } catch (err) {
        console.error(err);
        showToast(`移动失败: ${err.message}`, "error");
    }
}

async function forceRegenerateCurrentThumbnails() {
    if (globals.currentDisplayList.length === 0) {
        showToast("当前没有图片");
        return;
    }

    const targetSize = parseInt(document.getElementById('thumbSizeSlider')?.value) || 400;

    let deleteCount = 0;
    for (const fileData of globals.currentDisplayList) {
        if (fileData.md5) {
            const id = `${fileData.md5}_${targetSize}`;
            deleteThumbnail(id); // 使用全局
            deleteCount++;
        }
    }

    console.log(`已清除当前视图的 ${deleteCount} 个缩略图缓存`);
    showToast("缓存已清除，正在重新生成...", "success");
    redrawAllThumbnails(true); // 使用全局
}
