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

        // 删除文件夹（会自动从父文件夹的 subFolders 数组中移除）
        await folderData.delete();

        // 从 Map 中移除
        const path = folderData.path;
        appState.foldersData.delete(path);

        // 移除 DOM 节点
        if (typeof folderData.removeDOMNodes === 'function') {
            folderData.removeDOMNodes();
        }

        // 更新父文件夹的计数和图标状态
        parentFolder.updateCount();
        parentFolder.updateIconState();

        // 如果当前显示的是被删除的文件夹,切换到父文件夹
        if (appState.currentFolderPath === path) {
            handleFolderClick(parentFolder.treeNodeElement);
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
