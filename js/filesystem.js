

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

// 深度复用：在现有容器上执行增删改查
async function scanDirectory(dirHandle, path) {
    // 1. 获取或初始化容器
    let folderData = getFolderData(dirHandle, path);

    const newFiles = [];
    const newSubFolders = [];

    // 建立旧文件索引 (用于复用)
    const oldFileMap = new Map(folderData.files.map(f => [f.name, f]));
    
    for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'file') continue;
        const ext = entry.name.split('.').pop().toLowerCase();
        if (!imageExtensions.includes(ext)) continue;
        try {
            const file = await entry.getFile();         // 对文件条目生成 File 对象
            let fileObj = oldFileMap.get(entry.name);   // 尝试得到旧的 File 对象

            if (fileObj) {
                // 检查是否发生变化
                if (fileObj.size === file.size && fileObj.lastModified === file.lastModified) {
                    // 完全没变：刷新 handle 即可
                    fileObj.handle = entry;
                } else {
                    // 变了：修改属性，释放旧资源
                    if (fileObj.blobUrl) URL.revokeObjectURL(fileObj.blobUrl);
                    fileObj.file = file;
                    fileObj.size = file.size;
                    fileObj.lastModified = file.lastModified;
                    fileObj.handle = entry;
                    fileObj.blobUrl = URL.createObjectURL(file);
                    fileObj.md5 = null;
                }
                // 从 oldMap 中移除，标记为已处理
                oldFileMap.delete(entry.name);
            } else {
                // 这是新文件，创建新对象
                fileObj = {
                    handle: entry,
                    file: file,
                    name: entry.name,
                    path: path + '/' + entry.name,
                    size: file.size,
                    lastModified: file.lastModified,
                    blobUrl: URL.createObjectURL(file), // 新生成
                    dom: null,
                    md5: null
                };
            }
            newFiles.push(fileObj);

        } catch (e) { console.warn("无法读取文件:", entry.name, e); }
    }

    for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'directory') continue;
        newSubFolders.push(entry);
    }

    // 处理被删除的文件（剩余在 oldFileMap 中的）
    for (const [name, deletedFile] of oldFileMap) {
        if (deletedFile.blobUrl) URL.revokeObjectURL(deletedFile.blobUrl);
    }

    // 排序
    newSubFolders.sort((a, b) => a.name.localeCompare(b.name));
    newFiles.sort((a, b) => a.name.localeCompare(b.name));

    // 原地更新容器
    folderData.files = newFiles;
    folderData.subFolders = newSubFolders;
    folderData.scanned = true;

    return folderData;
}

function getFolderData(dirHandle, path) {
    let folderData = appState.foldersData.get(path);
    if (folderData) {
        // 更新 handle (防止旧句柄失效)
        folderData.handle = dirHandle;
        appState.dirMap.set(path, dirHandle);
    } else {
        folderData = {
            handle: dirHandle, // 这一步可能更新 handle
            files: [],
            subFolders: [],
            doms: [],
            scanned: false
        };
        // 放入状态管理 (如果是新创建的)
        appState.foldersData.set(path, folderData);
        appState.dirMap.set(path, dirHandle);
    }
    return folderData;
}

async function startBackgroundScan(parentHandle, parentPath) {
    const currentData = appState.foldersData.get(parentPath);
    if (!currentData || !currentData.subFolders) return;

    for (const subHandle of currentData.subFolders) {
        const subPath = parentPath + '/' + subHandle.name;
        // scanDirectory 会自动处理状态更新和复用
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
    await refreshFolder(path, true);
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
        await refreshFolder(appState.currentPath);
    }
}

async function refreshFolder(folderPath, silent = false) {
    if (!appState.rootHandle) {
        if (!silent) showToast("无法刷新：未找到目录信息", "error");
        return;
    }

    // 只有在刷新当前目录时才提示
    const isCurrent = (folderPath === appState.currentPath);
    if (isCurrent && !silent) showToast("正在刷新...", "info");

    try {
        let folderData = appState.foldersData.get(folderPath); // 获取现有引用
        let handle = folderData ? folderData.handle : null;

        if (!handle) {
            // 尝试从 rootHandle 恢复（如果是根目录）
            if (folderPath === appState.rootHandle.name) handle = appState.rootHandle;
            else throw new Error("目录句柄丢失");
        }

        // 深度复用扫描：直接原地更新 folderData
        await scanDirectory(handle, folderPath);

        // 更新 UI
        updateFolderCount(folderPath);

        // 重新同步子树结构（如果子文件夹有变）
        // 注意：refreshFolder 里调用 scanDirectory 后，folderData.subFolders 已经是新的/更新过的列表
        syncTreeStructure(folderPath, appState.foldersData.get(folderPath).subFolders);

        if (isCurrent) {
            loadFolder(folderPath);
            if (!silent) showToast("目录已刷新");
        }
    } catch (e) {
        if (e.name === 'NotFoundError' || (e.message && e.message.includes('not found'))) {
            if (isCurrent) {
                showToast(`文件夹 "${folderPath}" 已被删除`, "error");
                UI.gallery.innerHTML = '<div class="empty-state">文件夹已失效</div>';
            }
            removeTreeNode(folderPath);
            appState.foldersData.delete(folderPath);
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

        // 刷新源目录 和 目标目录
        // 因为 refreshFolder 是 "smart" 的，会原地更新数据并复用，所以性能开销可控
        await refreshFolder(data.sourceDir, true);

        const folderData = appState.foldersData.get(targetPath);
        if (folderData && folderData.scanned) {
            await refreshFolder(targetPath, true);
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
