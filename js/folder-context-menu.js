/**
 * 文件夹右键菜单功能
 * 提供新建文件夹、重命名、删除等操作
 */

// 创建右键菜单 DOM
function createFolderContextMenu() {
    const menu = document.createElement('div');
    menu.id = 'folder-context-menu';
    menu.className = 'context-menu hidden';
    menu.innerHTML = `
        <div class="context-menu-item" data-action="new-folder">
            <i class="fas fa-folder-plus"></i>
            <span>新建文件夹</span>
        </div>
        <div class="context-menu-item" data-action="rename">
            <i class="fas fa-edit"></i>
            <span>重命名</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" data-action="delete">
            <i class="fas fa-trash-alt"></i>
            <span>删除文件夹</span>
        </div>
    `;
    document.body.appendChild(menu);
    return menu;
}

// 全局变量
let folderContextMenu = null;
let currentContextFolder = null;

/**
 * 初始化文件夹右键菜单
 */
function initFolderContextMenu() {
    // 创建菜单
    folderContextMenu = createFolderContextMenu();

    // 绑定菜单项点击事件
    folderContextMenu.addEventListener('click', async (e) => {
        const item = e.target.closest('.context-menu-item');
        if (!item || !currentContextFolder) return;

        const action = item.dataset.action;
        hideFolderContextMenu();

        switch (action) {
            case 'new-folder':
                await handleNewFolder(currentContextFolder);
                break;
            case 'rename':
                await handleRenameFolder(currentContextFolder);
                break;
            case 'delete':
                await handleDeleteFolder(currentContextFolder);
                break;
        }

        currentContextFolder = null;
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
        if (!folderContextMenu.contains(e.target)) {
            hideFolderContextMenu();
        }
    });

    // 绑定树节点右键事件
    if (!UI.treeRoot) {
        console.error('[FolderContextMenu] UI.treeRoot 未找到!');
        return;
    }

    console.log('[FolderContextMenu] 绑定右键事件到:', UI.treeRoot);

    UI.treeRoot.addEventListener('contextmenu', (e) => {
        console.log('[FolderContextMenu] 右键事件触发', e.target);

        const li = e.target.closest('li.tree-node');
        console.log('[FolderContextMenu] 找到的 li:', li);

        if (!li) return;

        e.preventDefault();
        e.stopPropagation();

        const folderData = domToFolderMap.get(li);
        console.log('[FolderContextMenu] folderData:', folderData);

        if (!folderData) {
            console.warn('[FolderContextMenu] 未找到 folderData');
            return;
        }

        currentContextFolder = folderData;
        showFolderContextMenu(e.clientX, e.clientY, folderData);
    });
}

/**
 * 显示右键菜单
 */
function showFolderContextMenu(x, y, folderData) {
    console.log('[FolderContextMenu] showFolderContextMenu 被调用', { x, y, folderData, menu: folderContextMenu });

    if (!folderContextMenu) {
        console.error('[FolderContextMenu] folderContextMenu 未初始化!');
        return;
    }

    // 根据是否是根节点调整菜单项
    const isRoot = folderData.parent === null;
    const renameItem = folderContextMenu.querySelector('[data-action="rename"]');
    const deleteItem = folderContextMenu.querySelector('[data-action="delete"]');

    console.log('[FolderContextMenu] isRoot:', isRoot, 'renameItem:', renameItem, 'deleteItem:', deleteItem);

    if (isRoot) {
        renameItem.style.display = 'none';
        deleteItem.style.display = 'none';
    } else {
        renameItem.style.display = '';
        deleteItem.style.display = '';
    }

    // 显示菜单
    folderContextMenu.classList.remove('hidden');
    console.log('[FolderContextMenu] 移除 hidden 类后:', folderContextMenu.className);

    // 调整位置,防止超出屏幕
    const menuRect = folderContextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x;
    let top = y;

    if (x + menuRect.width > viewportWidth) {
        left = viewportWidth - menuRect.width - 10;
    }

    if (y + menuRect.height > viewportHeight) {
        top = viewportHeight - menuRect.height - 10;
    }

    folderContextMenu.style.left = left + 'px';
    folderContextMenu.style.top = top + 'px';

    console.log('[FolderContextMenu] 菜单位置:', { left, top, menuRect });
    console.log('[FolderContextMenu] 菜单样式:', {
        display: window.getComputedStyle(folderContextMenu).display,
        visibility: window.getComputedStyle(folderContextMenu).visibility,
        opacity: window.getComputedStyle(folderContextMenu).opacity
    });
}

/**
 * 隐藏右键菜单
 */
function hideFolderContextMenu() {
    if (folderContextMenu) {
        folderContextMenu.classList.add('hidden');
    }
}

/**
 * 处理新建文件夹
 */
async function handleNewFolder(parentFolder) {
    const folderName = prompt('请输入文件夹名称:');
    if (!folderName || !folderName.trim()) return;

    const trimmedName = folderName.trim();

    // 验证文件夹名称
    if (/[<>:"/\\|?*]/.test(trimmedName)) {
        showToast('文件夹名称包含非法字符', 'error');
        return;
    }

    try {
        // 使用 File System Access API 创建文件夹
        const newFolderHandle = await parentFolder.handle.getDirectoryHandle(trimmedName, { create: true });

        // 刷新父文件夹
        await refreshFolder(parentFolder);

        showToast(`文件夹 "${trimmedName}" 创建成功`, 'success');
    } catch (err) {
        console.error('创建文件夹失败:', err);
        if (err.name === 'NotAllowedError') {
            showToast('没有权限创建文件夹', 'error');
        } else if (err.message?.includes('already exists')) {
            showToast('文件夹已存在', 'error');
        } else {
            showToast('创建文件夹失败: ' + err.message, 'error');
        }
    }
}

/**
 * 处理重命名文件夹
 */
async function handleRenameFolder(folderData) {
    const oldName = folderData.name;
    const newName = prompt('请输入新的文件夹名称:', oldName);

    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    const trimmedName = newName.trim();

    // 验证文件夹名称
    if (/[<>:"/\\|?*]/.test(trimmedName)) {
        showToast('文件夹名称包含非法字符', 'error');
        return;
    }

    try {
        const parentFolder = folderData.parent;
        if (!parentFolder) {
            showToast('无法重命名根文件夹', 'error');
            return;
        }

        // 使用 move API 重命名
        await folderData.handle.move(parentFolder.handle, trimmedName);

        // 更新文件夹数据
        const oldPath = folderData.getPath();
        const newPath = parentFolder.getPath() + '/' + trimmedName;

        // 从 Map 中移除旧路径
        appState.foldersData.delete(oldPath);

        // 更新文件夹对象
        folderData.name = trimmedName;

        // 添加新路径到 Map
        appState.foldersData.set(newPath, folderData);

        // 更新 DOM
        if (folderData.treeNode) {
            const nameSpan = folderData.treeNode.querySelector('i').nextSibling;
            if (nameSpan) {
                nameSpan.textContent = ' ' + trimmedName + ' ';
            }
            folderData.treeNode.dataset.path = newPath;
        }

        if (folderData.treeList) {
            folderData.treeList.dataset.parentPath = newPath;
        }

        // 刷新父文件夹
        await refreshFolder(parentFolder);

        showToast(`文件夹已重命名为 "${trimmedName}"`, 'success');
    } catch (err) {
        console.error('重命名文件夹失败:', err);
        if (err.name === 'NotAllowedError') {
            showToast('没有权限重命名文件夹', 'error');
        } else {
            showToast('重命名失败: ' + err.message, 'error');
        }
    }
}

/**
 * 处理删除文件夹
 */
async function handleDeleteFolder(folderData) {
    const folderName = folderData.name;
    const hasContent = folderData.files.length > 0 || folderData.subFolders.length > 0;

    let confirmMessage = `确定要删除文件夹 "${folderName}" 吗?`;
    if (hasContent) {
        confirmMessage += '\n\n⚠️ 此文件夹不为空,删除后无法恢复!';
    }

    if (!confirm(confirmMessage)) return;

    try {
        const parentFolder = folderData.parent;
        if (!parentFolder) {
            showToast('无法删除根文件夹', 'error');
            return;
        }

        // 删除文件夹
        await parentFolder.handle.removeEntry(folderName, { recursive: true });

        // 从 Map 中移除
        const path = folderData.getPath();
        appState.foldersData.delete(path);

        // 移除 DOM 节点
        if (typeof folderData.removeDOMNodes === 'function') {
            folderData.removeDOMNodes();
        }

        // 刷新父文件夹
        await refreshFolder(parentFolder);

        // 如果当前显示的是被删除的文件夹,切换到父文件夹
        if (appState.currentFolderPath === path) {
            handleFolderClick(parentFolder.getPath());
        }

        showToast(`文件夹 "${folderName}" 已删除`, 'success');
    } catch (err) {
        console.error('删除文件夹失败:', err);
        if (err.name === 'NotAllowedError') {
            showToast('没有权限删除文件夹', 'error');
        } else if (err.name === 'InvalidModificationError') {
            showToast('文件夹不为空或正在使用中', 'error');
        } else {
            showToast('删除失败: ' + err.message, 'error');
        }
    }
}
