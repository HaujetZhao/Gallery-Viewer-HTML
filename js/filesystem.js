

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

        // 创建根 Folder 对象并扫描
        const rootData = getFolderData(handle, handle.name);
        await scanDirectory(rootData);

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
async function scanDirectory(folderData) {
    if (!folderData || !folderData.handle) {
        throw new Error('scanDirectory 需要有效的 Folder 对象');
    }

    const dirHandle = folderData.handle;
    const newFiles = [];
    const newSubFolders = [];

    // 建立旧文件索引 (用于复用)
    const oldFileMap = new Map(folderData.files.map(f => [f.name, f]));

    // 扫描文件
    for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'file') continue;
        const ext = entry.name.split('.').pop().toLowerCase();
        if (!imageExtensions.includes(ext)) continue;
        try {
            const file = await entry.getFile();
            let fileObj = oldFileMap.get(entry.name);

            if (fileObj) {
                // 检查是否发生变化
                if (fileObj.size === file.size && fileObj.lastModified === file.lastModified) {
                    // 完全没变：刷新 handle 即可
                    fileObj.handle = entry;
                } else {
                    // 变了：使用 refresh 方法更新
                    fileObj.handle = entry;
                    await fileObj.refresh();
                }
                // 从 oldMap 中移除，标记为已处理
                oldFileMap.delete(entry.name);
            } else {
                // 这是新文件，创建新的 SmartFile 实例
                fileObj = new SmartFile({
                    handle: entry,
                    file: file,
                    name: entry.name,
                    parent: folderData
                });

                // 保持兼容性：添加额外属性
                fileObj.path = folderData.getPath() + '/' + entry.name;
            }
            newFiles.push(fileObj);

        } catch (e) { console.warn("无法读取文件:", entry.name, e); }
    }

    // 扫描子文件夹
    for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'directory') continue;
        if (entry.name.startsWith('.')) continue;
        newSubFolders.push(entry);
    }

    // 处理被删除的文件（剩余在 oldFileMap 中的）
    for (const [name, deletedFile] of oldFileMap) {
        deletedFile.dispose();
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
        // 解析路径获取文件夹名称和父级
        const pathParts = path.split('/');
        const name = pathParts[pathParts.length - 1];

        // 获取父级 Folder 对象
        let parent = null;
        if (pathParts.length > 1) {
            const parentPath = pathParts.slice(0, -1).join('/');
            parent = appState.foldersData.get(parentPath) || null;
        }

        // 创建新的 Folder 实例
        folderData = new Folder({
            handle: dirHandle,
            name: name,
            parent: parent
        });

        // 保持兼容性：添加 doms 属性
        folderData.doms = [];

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

        // 获取或创建 Folder 对象再扫描
        const subFolderData = getFolderData(subHandle, subPath);
        await scanDirectory(subFolderData);

        updateTreeWithSubFolder(parentPath, subHandle.name, subPath);
        // Yield to UI
        await new Promise(r => setTimeout(r, 0));
        await startBackgroundScan(subHandle, subPath);
    }
}

async function handleFolderClick(path, li) {
    if (!path || !li) return;

    // 获取 Folder 对象
    const folderData = domToFolderMap.get(li) || appState.foldersData.get(path);
    if (!folderData) {
        showToast("无法找到文件夹数据", "error");
        return;
    }

    try {
        // 先验证文件夹是否可用
        const isValid = await folderData.validate();

        if (!isValid) {
            // 文件夹失效，执行恢复
            await handleFolderNotFound(folderData);
            return;
        }

        // 文件夹有效，正常加载
        loadFolder(path);
        await refreshFolder(path, true);

    } catch (err) {
        console.error("文件夹点击处理失败:", err);

        // 如果是 NotFoundError，尝试恢复
        if (err.name === 'NotFoundError' || err.message?.includes('not found')) {
            await handleFolderNotFound(folderData);
        } else {
            showToast("加载文件夹失败: " + err.message, "error");
        }
    }
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
        let folderData = appState.foldersData.get(folderPath);

        if (!folderData || !folderData.handle) {
            // 尝试从 rootHandle 恢复（如果是根目录）
            if (folderPath === appState.rootHandle.name) {
                folderData = getFolderData(appState.rootHandle, folderPath);
            } else {
                throw new Error("目录句柄丢失");
            }
        }

        // 深度复用扫描：直接原地更新 folderData
        await scanDirectory(folderData);

        // 更新 UI
        updateFolderCount(folderPath);

        // 重新同步子树结构（如果子文件夹有变）
        await syncTreeStructure(folderPath, folderData.subFolders);

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

        // 创建根 Folder 对象并扫描
        const rootData = getFolderData(handle, handle.name);
        await scanDirectory(rootData);

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

        // 获取目标文件夹对象
        const targetFolder = appState.foldersData.get(targetPath);
        if (!targetFolder) throw new Error("目标文件夹未找到");

        // 使用 SmartFile 的 move 方法
        await sourceFile.move(targetFolder);

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

async function moveFileToTrash(fileData) {
    // 使用 getPath() 方法获取文件的完整路径
    const fullPath = fileData.getPath();
    const pathParts = fullPath.split('/');
    const rootName = appState.rootHandle.name;

    // 移除根目录名称，得到相对路径
    if (pathParts[0] === rootName) {
        pathParts.shift();
    }

    const fileName = pathParts.pop(); // 文件名
    const relativeDirPath = pathParts.join('/'); // 相对目录路径

    // 使用 parent 属性获取父文件夹
    if (!fileData.parent || !fileData.parent.handle) {
        throw new Error("无法定位父文件夹句柄");
    }
    const parentCache = fileData.parent;

    // 1. 在根目录创建 .trash 文件夹
    const rootTrashHandle = await appState.rootHandle.getDirectoryHandle('.trash', { create: true });

    // 2. 在 .trash 中递归创建相同的目录结构
    let currentDirHandle = rootTrashHandle;
    if (relativeDirPath) {
        const dirs = relativeDirPath.split('/');
        for (const dir of dirs) {
            currentDirHandle = await currentDirHandle.getDirectoryHandle(dir, { create: true });
        }
    }

    // 3. 计算目标文件名（防重名）
    const dotIdx = fileName.lastIndexOf('.');
    const baseName = dotIdx !== -1 ? fileName.substring(0, dotIdx) : fileName;
    const ext = dotIdx !== -1 ? fileName.substring(dotIdx) : '';

    let targetName = fileName;
    let counter = 1;
    while (true) {
        try {
            await currentDirHandle.getFileHandle(targetName);
            targetName = `${baseName}_${counter}${ext}`;
            counter++;
        } catch (e) {
            if (e.name === 'NotFoundError') break;
            throw e;
        }
    }

    // 4. 移动文件到 .trash 中的对应目录
    await fileData.handle.move(currentDirHandle, targetName);

    // 5. 更新内存数据 - 使用 Folder 的 removeFile 方法
    parentCache.removeFile(fileData);

    const listIdx = globals.currentDisplayList.indexOf(fileData);
    if (listIdx > -1) globals.currentDisplayList.splice(listIdx, 1);

    // 6. 返回删除信息用于撤销
    return {
        parentPath: parentCache.getPath(),
        originalName: fileName,
        trashName: targetName,
        trashDirHandle: currentDirHandle,
        parentHandle: parentCache.handle,
        relativeDirPath // 保存相对路径用于恢复
    };
}

async function restoreFromTrash(deleteInfo) {
    const { parentPath, originalName, trashName, trashDirHandle, parentHandle } = deleteInfo;

    // 1. 获取回收站中的文件句柄
    const fileHandle = await trashDirHandle.getFileHandle(trashName);

    // 2. 移动回原位置
    await fileHandle.move(parentHandle, originalName);

    // 3. 刷新父文件夹以更新数据
    await refreshFolder(parentPath, true);

    return originalName;
}
