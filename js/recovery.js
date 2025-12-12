/**
 * 错误恢复处理模块
 * 处理文件/文件夹在硬盘上被修改/删除/移动后的恢复
 */

/**
 * 处理 treeNode 点击失效的情况
 * @param {Folder} folderData - 点击的文件夹对象
 * @returns {Promise<Folder|null>} 返回恢复后的可用祖先，或 null
 */
async function handleFolderNotFound(folderData) {
    try {
        showToast("检测到文件夹可能已被移动或删除，正在恢复...", "warning");

        // 1. 向上查找第一个可用的祖先
        const validAncestor = await folderData.findValidAncestor();

        if (!validAncestor) {
            showToast("无法恢复：根目录已失效，请重新打开文件夹", "error");
            return null;
        }

        // 2. 重新扫描祖先文件夹（会自动发现变化）
        await scanDirectory(validAncestor);

        // 3. 同步树结构（会自动处理差异）
        //    - 删除不存在的节点
        //    - 添加新的节点
        //    - 保留未变化的节点
        const ancestorPath = validAncestor.getPath();
        await syncTreeStructure(ancestorPath, validAncestor.subFolders);

        // 4. 更新 UI
        if (validAncestor.updateCount) {
            validAncestor.updateCount();
        }

        // 5. 启动后台递归扫描（建立完整的文件树）
        if (validAncestor.handle) {
            startBackgroundScan(validAncestor.handle, ancestorPath);
        }

        // 6. 加载恢复后的文件夹
        loadFolder(validAncestor);
        if (validAncestor.setActive) {
            validAncestor.setActive();
        }

        showToast(`已恢复到: ${validAncestor.name}`, "success");
        return validAncestor;

    } catch (err) {
        console.error("文件夹恢复失败:", err);
        showToast("恢复失败: " + err.message, "error");
        return null;
    }
}

/**
 * 处理图片卡片点击失效的情况
 * @param {SmartFile} fileData - 点击的文件对象
 * @returns {Promise<boolean>} 是否成功恢复
 */
async function handleFileNotFound(fileData) {
    try {
        if (!fileData.parent) {
            showToast("无法恢复：文件缺少父级引用", "error");
            return false;
        }

        showToast("检测到文件可能已被移动或删除，正在刷新...", "warning");

        // 1. 刷新父文件夹
        const parentPath = fileData.parent.getPath();
        await refreshFolder(fileData.parent, true);

        // 2. 检查文件是否还存在
        const stillExists = fileData.parent.findFile(fileData.name);

        if (stillExists) {
            showToast("文件已刷新", "success");
            return true;
        } else {
            showToast("文件已被删除或移动", "info");

            // 3. 重新渲染当前显示列表
            if (appState.currentPath === parentPath || appState.allPhotosMode) {
                renderGallery(globals.currentDisplayList);
            }

            return false;
        }

    } catch (err) {
        console.error("文件恢复失败:", err);
        showToast("刷新失败: " + err.message, "error");
        return false;
    }
}

/**
 * 安全地执行文件夹操作，失败时自动恢复
 * @param {Folder} folderData - 文件夹对象
 * @param {Function} operation - 要执行的操作
 * @returns {Promise<any>}
 */
async function safelyExecuteFolderOperation(folderData, operation) {
    try {
        return await operation();
    } catch (err) {
        // 检查是否是 NotFoundError 或 handle 失效
        if (err.name === 'NotFoundError' ||
            err.message?.includes('not found') ||
            err.message?.includes('not exist')) {

            // 尝试恢复
            const recovered = await handleFolderNotFound(folderData);
            if (recovered) {
                // 恢复成功，尝试重新执行操作
                try {
                    return await operation();
                } catch (retryErr) {
                    console.error("重试操作失败:", retryErr);
                    throw retryErr;
                }
            }
        }
        throw err;
    }
}

/**
 * 安全地执行文件操作，失败时自动恢复
 * @param {SmartFile} fileData - 文件对象
 * @param {Function} operation - 要执行的操作
 * @returns {Promise<any>}
 */
async function safelyExecuteFileOperation(fileData, operation) {
    try {
        return await operation();
    } catch (err) {
        // 检查是否是 NotFoundError 或 handle 失效
        if (err.name === 'NotFoundError' ||
            err.message?.includes('not found') ||
            err.message?.includes('not exist')) {

            // 尝试恢复
            await handleFileNotFound(fileData);
        }
        throw err;
    }
}
