
function toggleSidebarPin(forceState) {
    const isPinned = typeof forceState === 'boolean' ? forceState : !UI.sidebar.classList.contains('pinned');
    const mainWrapper = document.querySelector('.main-content-wrapper');
    const resizeHelper = document.getElementById('resize-helper');

    if (isPinned) {
        UI.sidebar.classList.add('pinned');
        document.body.classList.add('sidebar-pinned');
        UI.pinBtn.querySelector('i').style.transform = 'rotate(45deg)';
        UI.pinBtn.style.color = '#3498db';
        const currentWidth = resizeHelper.offsetWidth || 280;
        mainWrapper.style.marginLeft = `${currentWidth}px`;
        mainWrapper.style.width = `calc(100% - ${currentWidth}px)`;
    } else {
        UI.sidebar.classList.remove('pinned');
        document.body.classList.remove('sidebar-pinned');
        UI.pinBtn.querySelector('i').style.transform = 'rotate(0deg)';
        UI.pinBtn.style.color = '';
        mainWrapper.style.marginLeft = '0px';
        mainWrapper.style.width = '100%';
    }
    localStorage.setItem('sidebarPinned', isPinned);
}

function setupCSSBasedResizer() {
    const resizeHelper = document.getElementById('resize-helper');
    if (!resizeHelper) return;

    const setWidth = (w) => {
        document.documentElement.style.setProperty('--sidebar-width', w + 'px');
        if (document.body.classList.contains('sidebar-pinned')) {
            document.querySelector('.main-content-wrapper').style.marginLeft = w + 'px';
        }
    };

    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const newWidth = entry.target.offsetWidth;
            if (newWidth > 0) {
                setWidth(newWidth);
                localStorage.setItem('sidebarWidth', newWidth);
            }
        }
    });

    resizeObserver.observe(resizeHelper);
    const savedWidth = localStorage.getItem('sidebarWidth') || 280;
    resizeHelper.style.width = savedWidth + 'px';
    setWidth(savedWidth);
}

function setupSidebarEvents() {

    // 统一的文件夹点击事件（包括虚拟文件夹和普通文件夹）
    const handleTreeClick = (e) => {
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        e.stopPropagation();

        // 关闭右键菜单
        contextMenuManager.hideAll();

        // 使用 WeakMap 获取 Folder 对象
        const folderData = domToFolderMap.get(li);
        if (!folderData) return;

        const isIconClick = e.target.classList.contains('fa-folder') ||
            e.target.classList.contains('fa-folder-open');

        handleFolderClick(li);

        // 虚拟文件夹没有展开/折叠功能
        if (isIconClick && folderData.treeList) {
            folderData.toggleExpanded();
        }
    };

    UI.virtualTreeRoot.addEventListener('click', handleTreeClick);
    UI.treeRoot.addEventListener('click', handleTreeClick);

    UI.treeRoot.addEventListener('dragover', (e) => {
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        e.preventDefault();
        domToFolderMap.get(li).treeNode.setDragOver();
    });

    UI.treeRoot.addEventListener('dragleave', (e) => {
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        domToFolderMap.get(li).treeNode.setDragLeave();
    });

    UI.treeRoot.addEventListener('drop', (e) => {
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        e.preventDefault();

        const folderData = domToFolderMap.get(li);
        folderData.treeNode.setDragLeave();
        handleDropOnFolder(e, folderData, li);
    });
}


// activeTreeNode 函数已移除，请直接调用 folderData.setActive()



async function syncTreeStructure(parentFolder) {
    if (!parentFolder || !parentFolder.treeNode) return;

    // 使用 TreeNode 的 syncChildren 方法来同步 DOM 结构
    await parentFolder.treeNode.syncChildren(parentFolder.subFolders);
}

