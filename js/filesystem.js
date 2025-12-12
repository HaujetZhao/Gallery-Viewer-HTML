

// 支持的媒体文件扩展名 - 使用统一配置
const imageExtensions = FileTypes.allMedia;


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
        loadFolder(rootData);
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
        folderData = new SmartFolder({
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
        loadFolder(folderData);
        await refreshFolder(folderData, true);

    } catch (err) {
        console.error("文件夹点击处理失败:", err);

        // 如果是 NotFoundError，尝试恢复
        if (err.name === 'NotFoundError' || err.message?.includes('not found')) {
            await handleFolderNotFound(folderData);
        } else {
            showToast("加载失败: " + err.message, "error");
        }
    }
}


/**
 * 加载并显示指定文件夹的内容
 * 
 * 此函数负责:
 * 1. 切换到单文件夹模式(退出全部照片模式)
 * 2. 更新当前路径状态
 * 3. 更新 UI 显示(路径、树节点高亮)
 * 4. 渲染画廊显示文件
 * 
 * @param {SmartFolder} folderData - 文件夹对象
 */
function loadFolder(folderData) {
    appState.allPhotosMode = false;
    UI.refreshBtn.textContent = "刷新目录";
    UI.refreshBtn.title = "仅重新扫描当前文件夹的文件变动";

    const path = folderData.getPath();
    appState.currentPath = path;
    updateActiveTreeNode(path);
    UI.pathDisplay.textContent = path;

    globals.currentDisplayList = folderData.files;
    renderGallery(globals.currentDisplayList);
}

async function switchToAllPhotos() {
    appState.allPhotosMode = true;
    appState.currentPath = "ALL_MEDIA";
    UI.refreshBtn.textContent = "重载项目";
    UI.refreshBtn.title = "重新扫描整个项目文件树";
    UI.pathDisplay.textContent = "所有媒体";
    updateActiveTreeNode("ALL_MEDIA");

    UI.gallery.innerHTML = '<div class="loader">正在聚合文件...</div>';

    await new Promise(r => setTimeout(r, 10));

    // 收集所有文件
    let allFiles = [];
    for (const [path, data] of appState.foldersData.entries()) {
        if (path !== 'ALL_MEDIA' && data && data.files && data.files.length > 0) {
            allFiles = allFiles.concat(data.files);
        }
    }

    // 将文件添加到 ALL_MEDIA_FOLDER
    ALL_MEDIA_FOLDER.files = allFiles;

    // 将 ALL_MEDIA_FOLDER 添加到 foldersData
    appState.foldersData.set('ALL_MEDIA', ALL_MEDIA_FOLDER);

    globals.currentDisplayList = allFiles;
    UI.pathDisplay.textContent = `所有媒体 (共 ${globals.currentDisplayList.length} 个)`;

    if (allFiles.length === 0) {
        UI.gallery.innerHTML = '<div class="empty-state">暂无媒体文件 (后台扫描可能仍在进行，请稍候刷新)</div>';
        showToast("暂未发现媒体文件，可能会在后台扫描完成后自动出现", "info");
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
        const currentFolder = appState.foldersData.get(appState.currentPath);
        if (currentFolder) {
            await refreshFolder(currentFolder);
        } else if (appState.currentPath === 'ALL_MEDIA') {
            await refreshFolder(ALL_MEDIA_FOLDER);
        }
    }
}

/**
 * 刷新文件夹数据
 * 
 * 只负责重新扫描文件夹并更新数据,不更新 UI
 * 调用者需要手动调用 loadFolder() 或 renderGallery() 来更新 UI
 * 
 * @param {SmartFolder} folderData - 文件夹对象
 * @param {boolean} silent - 是否静默(不显示 Toast)
 * @returns {Promise<SmartFolder>} 返回刷新后的文件夹对象
 */
async function refreshFolder(folderData, silent = false) {
    if (!appState.rootHandle) {
        if (!silent) showToast("无法刷新：未找到目录信息", "error");
        return null;
    }

    // 特殊处理: ALL_MEDIA 模式
    if (folderData === ALL_MEDIA_FOLDER) {
        if (!silent) showToast("正在刷新所有媒体...", "info");
        await switchToAllPhotos();
        return ALL_MEDIA_FOLDER;
    }

    if (!folderData || typeof folderData !== 'object') {
        console.error("refreshFolder 需要有效的 SmartFolder 对象", folderData);
        return null;
    }

    const folderPath = folderData.getPath ? folderData.getPath() : folderData.path;

    try {
        if (!folderData.handle) {
            // 尝试从 rootHandle 恢复（如果是根目录）
            if (folderPath === appState.rootHandle.name) {
                // 原地恢复 handle
                folderData.handle = appState.rootHandle;
                appState.dirMap.set(folderPath, appState.rootHandle);
            } else {
                throw new Error("目录句柄丢失");
            }
        }

        // 深度复用扫描：直接原地更新 folderData
        await scanDirectory(folderData);

        // 更新侧边栏 UI
        if (typeof updateFolderCount === 'function') {
            updateFolderCount(folderPath); // 暂时保持使用 path
        }

        // 重新同步子树结构（如果子文件夹有变）
        await syncTreeStructure(folderPath, folderData.subFolders);

        if (!silent) showToast("目录已刷新");

        return folderData;
    } catch (e) {
        if (e.name === 'NotFoundError' || (e.message && e.message.includes('not found'))) {
            const isCurrent = (folderPath === appState.currentPath);
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
        return null;
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
        const reloadedRoot = appState.foldersData.get(handle.name);
        if (reloadedRoot) loadFolder(reloadedRoot);
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

        // 使用操作历史系统执行移动
        await moveFileWithHistory(sourceFile, targetFolder);

        showToast(`已移动: ${data.name} (Ctrl+Z 撤销)`, "success");

        // 刷新目标目录 (如果已扫描)
        const targetFolderData = appState.foldersData.get(targetPath);
        if (targetFolderData && targetFolderData.scanned) {
            await refreshFolder(targetFolderData, true);
        }

        // 刷新源目录和 UI
        if (appState.currentPath === 'ALL_MEDIA') {
            // ALL_MEDIA 模式: 文件还在列表中,不需要刷新
        } else if (appState.currentPath === data.sourceDir) {
            // 当前在源目录: 刷新数据并更新 UI
            const sourceFolder = appState.foldersData.get(data.sourceDir);
            if (sourceFolder) {
                const sourceFolderData = await refreshFolder(sourceFolder, true);
                if (sourceFolderData) {
                    loadFolder(sourceFolderData);
                }
            }
        } else {
            // 不在源目录: 只刷新数据
            const sourceFolder = appState.foldersData.get(data.sourceDir);
            if (sourceFolder) {
                await refreshFolder(sourceFolder, true);
            }
        }

    } catch (err) {
        console.error(err);
        showToast(`移动失败: ${err.message}`, "error");
    }
}

async function forceRegenerateCurrentThumbnails() {
    if (globals.currentDisplayList.length === 0) {
        showToast("当前没有文件");
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
    const parentFolder = appState.foldersData.get(parentPath);
    if (parentFolder) {
        await refreshFolder(parentFolder, true);
    }

    return originalName;
}
