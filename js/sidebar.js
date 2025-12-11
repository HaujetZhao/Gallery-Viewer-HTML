
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
    UI.treeRoot.addEventListener('click', (e) => {
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        e.stopPropagation();

        // 使用 WeakMap 获取 Folder 对象
        const folderData = domToFolderMap.get(li);
        if (!folderData) return;

        const isIconClick = e.target.classList.contains('fa-folder') ||
            e.target.classList.contains('fa-folder-open');

        const path = folderData.getPath();
        handleFolderClick(path, li);

        if (isIconClick && folderData.treeList) {
            toggleFolderState(li, folderData.treeList);
        }
    });

    UI.treeRoot.addEventListener('dragover', (e) => {
        const li = e.target.closest('li.tree-node');
        if (li) {
            e.preventDefault();
            li.classList.add('drag-over');
        }
    });

    UI.treeRoot.addEventListener('dragleave', (e) => {
        const li = e.target.closest('li.tree-node');
        if (li) li.classList.remove('drag-over');
    });

    UI.treeRoot.addEventListener('drop', (e) => {
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        e.preventDefault();
        li.classList.remove('drag-over');

        // 使用 WeakMap 获取 Folder 对象
        const folderData = domToFolderMap.get(li);
        if (folderData) {
            const path = folderData.getPath();
            handleDropOnFolder(e, folderData.handle, path, li);
        }
    });
}


function createRootNode(rootData) {
    const li = document.createElement('li');
    li.className = 'tree-node root-node active';
    li.dataset.path = rootData.handle.name;
    li.id = 'tree-root-node';
    const count = rootData.files ? rootData.files.length : 0;
    li.innerHTML = `<i class="fas fa-folder-open"></i> ${rootData.handle.name} <span class="tree-node-count">(${count})</span>`;

    const ul = document.createElement('ul');
    ul.className = 'tree-sub-list expanded';
    ul.dataset.parentPath = rootData.handle.name;

    // 建立双向绑定（使用 WeakMap）
    rootData.treeNode = li;
    rootData.treeList = ul;
    domToFolderMap.set(li, rootData);
    domToFolderMap.set(ul, rootData);

    UI.treeRoot.appendChild(li);
    UI.treeRoot.appendChild(ul);
}

function updateTreeWithSubFolder(parentPath, folderName, fullPath) {
    const parentFolder = appState.foldersData.get(parentPath);
    if (!parentFolder || !parentFolder.treeList) return;

    const parentUl = parentFolder.treeList;

    // 检查是否已存在
    if (parentUl.querySelector(`li[data-path="${CSS.escape(fullPath)}"]`)) return;

    const folderData = appState.foldersData.get(fullPath);
    if (!folderData) return;

    const isEmpty = folderData.files.length === 0 && folderData.subFolders.length === 0;

    const li = document.createElement('li');
    li.className = `tree-node ${isEmpty ? 'empty-folder' : ''}`;
    li.dataset.path = fullPath;

    const count = folderData.files.length;
    li.innerHTML = `<i class="fas fa-folder-open"></i> ${folderName} <span class="tree-node-count">(${count})</span>`;

    const ul = document.createElement('ul');
    ul.className = 'tree-sub-list expanded';
    ul.dataset.parentPath = fullPath;

    // 建立双向绑定（使用 WeakMap）
    folderData.treeNode = li;
    folderData.treeList = ul;
    domToFolderMap.set(li, folderData);
    domToFolderMap.set(ul, folderData);

    // 按名称排序插入节点
    const existingNodes = Array.from(parentUl.querySelectorAll(':scope > li.tree-node'));
    let insertBeforeNode = null;

    for (const node of existingNodes) {
        const nodeData = domToFolderMap.get(node);
        const nodeName = nodeData ? nodeData.name : node.textContent.trim();

        if (folderName.localeCompare(nodeName) < 0) {
            insertBeforeNode = node;
            break;
        }
    }

    if (insertBeforeNode) {
        parentUl.insertBefore(li, insertBeforeNode);
        parentUl.insertBefore(ul, insertBeforeNode);
    } else {
        parentUl.appendChild(li);
        parentUl.appendChild(ul);
    }
}

function updateFolderCount(path) {
    const folderData = appState.foldersData.get(path);
    if (folderData && typeof folderData.updateCount === 'function') {
        folderData.updateCount();
    }
}

function updateActiveTreeNode(path) {
    // 先移除所有激活状态
    document.querySelectorAll('.tree-node').forEach(node => {
        node.classList.remove('active');
    });

    // 处理特殊的 "所有图片" 节点
    if (path === 'ALL_PHOTOS') {
        const allPhotosNode = document.getElementById('allPhotosNode');
        if (allPhotosNode) allPhotosNode.classList.add('active');
        return;
    }

    // 使用 Folder 对象激活
    const folderData = appState.foldersData.get(path);
    if (folderData && typeof folderData.setActive === 'function') {
        folderData.setActive();
    }
}

function toggleFolderState(li, ul) {
    // 使用 WeakMap 获取 Folder 对象
    const folderData = domToFolderMap.get(li);
    if (folderData) {
        folderData.toggleExpanded();
    } else {
        // 降级方案：直接操作 DOM
        ul.classList.toggle('expanded');
        const isExpanded = ul.classList.contains('expanded');
        const icon = li.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-folder', 'fa-folder-open');
            icon.classList.add(isExpanded ? 'fa-folder-open' : 'fa-folder');
        }
    }
}

async function syncTreeStructure(parentPath, newSubHandles) {
    const parentFolder = appState.foldersData.get(parentPath);
    if (!parentFolder || !parentFolder.treeList) return;

    const parentUl = parentFolder.treeList;

    const existingLis = Array.from(parentUl.querySelectorAll(':scope > li.tree-node'));
    const existingNames = new Set(existingLis.map(li => {
        // 使用 WeakMap 获取 Folder 对象
        const folderData = domToFolderMap.get(li);
        if (folderData) {
            return folderData.name;
        }
        // 降级方案
        const path = li.dataset.path;
        return path.substring(path.lastIndexOf('/') + 1);
    }));

    const newNames = new Set(newSubHandles.map(h => h.name));

    // 移除不存在的节点
    existingLis.forEach(li => {
        const folderData = domToFolderMap.get(li);
        if (folderData && !newNames.has(folderData.name)) {
            // 检查是否是 Folder 实例（有 removeDOMNodes 方法）
            if (typeof folderData.removeDOMNodes === 'function') {
                folderData.removeDOMNodes();
            } else {
                // 降级方案：直接删除 DOM
                const path = li.dataset.path;
                const subUl = document.querySelector(`ul[data-parent-path="${CSS.escape(path)}"]`);
                if (subUl) subUl.remove();
                li.remove();
            }
        } else if (!folderData) {
            // 降级方案：从 dataset 获取信息
            const path = li.dataset.path;
            const name = path.substring(path.lastIndexOf('/') + 1);
            if (!newNames.has(name)) {
                const subUl = document.querySelector(`ul[data-parent-path="${CSS.escape(path)}"]`);
                if (subUl) subUl.remove();
                li.remove();
            }
        }
    });

    // 添加新节点
    for (const handle of newSubHandles) {
        if (!existingNames.has(handle.name)) {
            const fullPath = parentPath + '/' + handle.name;

            // 使用 getFolderData 确保创建 Folder 实例
            let folderData = appState.foldersData.get(fullPath);
            if (!folderData) {
                folderData = getFolderData(handle, fullPath);
            }

            // 先扫描文件夹以获取文件计数
            if (!folderData.scanned) {
                await scanDirectory(folderData);
            }

            updateTreeWithSubFolder(parentPath, handle.name, fullPath);
        }
    }
}

function removeTreeNode(path) {
    const folderData = appState.foldersData.get(path);
    if (folderData && typeof folderData.removeDOMNodes === 'function') {
        folderData.removeDOMNodes();
    } else {
        // 降级方案：使用 DOM 查询
        const li = document.querySelector(`li[data-path="${CSS.escape(path)}"]`);
        if (li) {
            const ul = document.querySelector(`ul[data-parent-path="${CSS.escape(path)}"]`);
            if (ul) ul.remove();
            li.remove();
        }
    }
}

function updateFolderIconState(path) {
    // 特殊节点不处理
    if (path === 'ALL_PHOTOS') return;

    const folderData = appState.foldersData.get(path);
    if (folderData && typeof folderData.updateIconState === 'function') {
        folderData.updateIconState();
    }
}
