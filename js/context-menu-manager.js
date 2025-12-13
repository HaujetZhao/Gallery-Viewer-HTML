/**
 * 统一的右键菜单管理器
 * 管理所有类型的右键菜单(文件、文件夹等)
 */

class ContextMenuManager {
    constructor() {
        this.menus = new Map(); // 存储所有菜单
        this.currentMenu = null;
        this.currentTarget = null;

        // 绑定全局点击事件,关闭所有菜单
        document.addEventListener('click', () => this.hideAll());
    }

    /**
     * 注册一个菜单
     * @param {string} menuId - 菜单ID
     * @param {HTMLElement|Function} menuElement - 菜单元素或创建函数
     */
    register(menuId, menuElement) {
        if (typeof menuElement === 'function') {
            // 如果是函数,调用它创建菜单
            menuElement = menuElement();
        }
        this.menus.set(menuId, menuElement);
    }

    /**
     * 显示指定菜单
     * @param {string} menuId - 菜单ID
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {Object} target - 目标对象(fileData, folderData等)
     * @param {Object} options - 额外选项
     */
    show(menuId, x, y, target, options = {}) {
        // 隐藏其他菜单
        this.hideAll();

        const menu = this.menus.get(menuId);
        if (!menu) {
            console.error(`[ContextMenuManager] 菜单未找到: ${menuId}`);
            return;
        }

        // 保存当前状态
        this.currentMenu = menu;
        this.currentTarget = target;

        // 为目标添加激活样式类
        if (menuId === 'file' && target.dom) {
            target.dom.classList.add('context-menu-active');
        } else if (menuId === 'folder' && target.treeNode) {
            target.treeNode.setContextActive();
        }

        // 根据选项调整菜单项
        if (options.adjustItems) {
            options.adjustItems(menu, target);
        }

        // 显示菜单
        menu.classList.remove('hidden');
        menu.classList.add('show');

        // 调整位置
        this.positionMenu(menu, x, y);
    }

    /**
     * 隐藏所有菜单
     */
    hideAll() {
        // 移除目标的激活样式类
        if (this.currentTarget) {
            if (this.currentTarget.dom) {
                this.currentTarget.dom.classList.remove('context-menu-active');
            }
            if (this.currentTarget.treeNode) {
                this.currentTarget.treeNode.setContextInactive();
            }
        }

        this.menus.forEach(menu => {
            menu.classList.remove('show');
            menu.classList.add('hidden');
        });
        this.currentMenu = null;
        this.currentTarget = null;
    }

    /**
     * 隐藏指定菜单
     */
    hide(menuId) {
        const menu = this.menus.get(menuId);
        if (menu) {
            menu.classList.remove('show');
            menu.classList.add('hidden');
        }
    }

    /**
     * 调整菜单位置,防止超出屏幕
     */
    positionMenu(menu, x, y) {
        const menuRect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = x;
        let top = y;

        // 防止超出右边
        if (x + menuRect.width > viewportWidth) {
            left = viewportWidth - menuRect.width - 10;
        }

        // 防止超出底部
        if (y + menuRect.height > viewportHeight) {
            top = viewportHeight - menuRect.height - 10;
        }

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }

    /**
     * 获取当前目标
     */
    getCurrentTarget() {
        return this.currentTarget;
    }
}

// 创建全局实例
const contextMenuManager = new ContextMenuManager();

/**
 * 初始化所有右键菜单
 */
function initContextMenus() {
    // 1. 创建并注册文件右键菜单
    const fileMenu = createFileMenu();
    contextMenuManager.register('file', fileMenu);

    // 2. 创建并注册文件夹右键菜单
    const folderMenu = createFolderMenu();
    contextMenuManager.register('folder', folderMenu);

    // 3. 绑定文件树右键事件
    bindFolderContextMenu();
}

/**
 * 创建文件右键菜单
 */
function createFileMenu() {
    const menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.className = 'context-menu hidden';
    menu.innerHTML = `
        <div class="context-menu-item" id="ctxProperties">
            <i class="fas fa-info-circle"></i>
            <span>属性</span>
        </div>
        <div class="context-menu-item" id="ctxRename">
            <i class="fas fa-edit"></i>
            <span>重命名</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" id="ctxDelete">
            <i class="fas fa-trash-alt"></i>
            <span>删除</span>
        </div>
    `;

    // 绑定菜单项点击事件
    const propertiesBtn = menu.querySelector('#ctxProperties');
    const renameBtn = menu.querySelector('#ctxRename');
    const deleteBtn = menu.querySelector('#ctxDelete');

    propertiesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        contextMenuManager.hideAll();
        showImageProperties();
    });

    renameBtn.addEventListener('click', () => {
        const fileData = contextMenuManager.getCurrentTarget();
        if (fileData && fileData.dom) {
            contextMenuManager.hideAll();
            enableInlineRename(fileData.dom, fileData);
        }
    });

    deleteBtn.addEventListener('click', async () => {
        const fileData = contextMenuManager.getCurrentTarget();
        if (fileData) {
            contextMenuManager.hideAll();
            await handleFileDelete(fileData);
        }
    });

    document.body.appendChild(menu);

    // 保存到 UI 对象以兼容旧代码
    UI.contextMenu = menu;

    return menu;
}

// 文件删除处理函数
async function handleFileDelete(fileData) {
    try {
        // 使用操作历史系统执行删除
        await deleteFileWithHistory(fileData);

        // 移除 DOM
        if (fileData.dom) {
            fileData.dom.remove();
        }

        if (appState.currentFolder) {
            await refreshFolder(appState.currentFolder, true);

            // 重新渲染 gallery 以确保 DOM 正确排序
            renderGallery(globals.currentDisplayList);
        }

        showToast("已移动到 .trash 回收站（Ctrl+Z 撤销）");
    } catch (e) {
        console.error(e);
        showToast("操作失败: " + e.message, "error");
    }
}

/**
 * 创建文件夹右键菜单
 */
function createFolderMenu() {
    const menu = document.createElement('div');
    menu.id = 'folder-context-menu';
    menu.className = 'context-menu hidden';
    menu.innerHTML = `
        <div class="context-menu-item danger" data-action="delete">
            <i class="fas fa-trash-alt"></i>
            <span>删除文件夹</span>
        </div>
    `;

    // 绑定菜单项点击事件
    menu.addEventListener('click', async (e) => {
        const item = e.target.closest('.context-menu-item');
        if (!item) return;

        const action = item.dataset.action;
        const folderData = contextMenuManager.getCurrentTarget();

        if (!folderData) return;

        contextMenuManager.hideAll();

        if (action === 'delete') {
            await handleDeleteFolder(folderData);
        }
    });

    document.body.appendChild(menu);
    return menu;
}

/**
 * 绑定文件树右键事件
 */
function bindFolderContextMenu() {
    if (!UI.treeRoot) {
        console.error('[ContextMenuManager] UI.treeRoot 未找到!');
        return;
    }

    UI.treeRoot.addEventListener('contextmenu', (e) => {
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        e.preventDefault();
        e.stopPropagation();

        const folderData = domToFolderMap.get(li);
        if (!folderData) return;

        // 根节点不显示菜单
        if (folderData.parent === null) return;

        // 使用管理器显示菜单
        contextMenuManager.show('folder', e.clientX, e.clientY, folderData);
    });
}

// 文件夹删除函数
async function handleDeleteFolder(folderData) {
    const folderName = folderData.name;
    const hasContent = folderData.files.length > 0 || folderData.subFolders.length > 0;

    // 使用自定义确认对话框
    const confirmed = await confirmDialog.show(folderName, hasContent);

    if (!confirmed) return;

    try {
        if (!folderData.parent) {
            showToast('无法删除根文件夹', 'error');
            return;
        }

        const path = folderData.path;
        const parentPath = folderData.parent.path;

        // 直接删除,不加入撤销队列
        await folderData.delete();

        // 从 Map 中移除
        appState.foldersData.delete(path);

        // 移除 DOM 节点
        if (folderData.treeNode) {
            folderData.treeNode.remove();
        }
        if (folderData.treeList) {
            folderData.treeList.remove();
        }

        // 刷新父文件夹
        // 刷新父文件夹
        if (folderData.parent) {
            await refreshFolder(folderData.parent);
        }

        // 如果当前显示的是被删除的文件夹,切换到父文件夹
        if (appState.currentFolder === folderData) {
            await loadFolder(folderData.parent);
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
