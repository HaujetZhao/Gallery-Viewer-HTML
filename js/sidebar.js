
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

// ----------------------------------------------------
// Event Delegation Setup needed in init or sidebar load
// We'll export a setup function for sidebar events
// ----------------------------------------------------
function setupSidebarEvents() {
    UI.treeRoot.addEventListener('click', (e) => {
        // Find the closest tree node li
        const li = e.target.closest('li.tree-node');
        if (!li) return;

        e.stopPropagation(); // Stop bubbling to prevent issues?

        const path = li.dataset.path;
        if (!path) return;

        // Determine if click was inside the icon area for toggle
        // The icon is usually the first child i tag.
        // Or we can check if the target IS the icon or closely wrapping span.

        const isIconClick = e.target.classList.contains('fa-folder') ||
            e.target.classList.contains('fa-folder-open');

        // Logic: Always load folder on click anywhere on line
        // Only toggle expand/collapse if computing isIconClick

        const ul = document.querySelector(`ul[data-parent-path="${CSS.escape(path)}"]`);

        handleFolderClick(path, li); // Load folder

        if (isIconClick && ul) {
            toggleFolderState(li, ul);
        }
    });

    // Drag and Drop Delegation
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

        const path = li.dataset.path;
        const folderData = appState.foldersData.get(path);
        if (folderData) {
            handleDropOnFolder(e, folderData.handle, path, li);
        }
    });
}


function createRootNode(rootData) {
    const li = document.createElement('li');
    li.className = 'tree-node root-node active';
    li.dataset.path = rootData.handle.name;
    li.id = 'tree-root-node';
    // Add count for root too
    const count = rootData.files ? rootData.files.length : 0;
    li.innerHTML = `<i class="fas fa-folder-open"></i> ${rootData.handle.name} <span class="tree-node-count">(${count})</span>`;

    const ul = document.createElement('ul');
    ul.className = 'tree-sub-list expanded';
    ul.dataset.parentPath = rootData.handle.name;

    // No individual listeners added here anymore

    UI.treeRoot.appendChild(li);
    UI.treeRoot.appendChild(ul);
}

function updateTreeWithSubFolder(parentPath, folderName, fullPath) {
    const parentUl = document.querySelector(`ul[data-parent-path="${CSS.escape(parentPath)}"]`);
    if (!parentUl) return;
    if (parentUl.querySelector(`li[data-path="${CSS.escape(fullPath)}"]`)) return;

    const folderData = appState.foldersData.get(fullPath);
    const isEmpty = folderData.files.length === 0 && folderData.subFolders.length === 0;

    const li = document.createElement('li');
    li.className = `tree-node ${isEmpty ? 'empty-folder' : ''}`;
    li.dataset.path = fullPath;

    const count = folderData.files.length;
    li.innerHTML = `<i class="fas fa-folder-open"></i> ${folderName} <span class="tree-node-count">(${count})</span>`;

    const ul = document.createElement('ul');
    ul.className = 'tree-sub-list expanded';
    ul.dataset.parentPath = fullPath;

    // No individual listeners added here anymore

    parentUl.appendChild(li);
    parentUl.appendChild(ul);
}

function updateFolderCount(path) {
    const li = document.querySelector(`li.tree-node[data-path="${CSS.escape(path)}"]`);
    if (!li) return;

    // 查找或创建计数 span (优先找带 class 的，否则找任意 span)
    let countSpan = li.querySelector('.tree-node-count') || li.querySelector('span');

    if (!countSpan) {
        countSpan = document.createElement('span');
        countSpan.className = 'tree-node-count';
        li.appendChild(countSpan);
    } else {
        // 确保 class 存在 (兼容旧元素)
        if (!countSpan.classList.contains('tree-node-count')) {
            countSpan.classList.add('tree-node-count');
            countSpan.style.cssText = ''; // 清除之前的内联样式
        }
    }

    // 此时无需传入 count，直接从全局数据拿
    const data = appState.foldersData.get(path);
    if (data) {
        if (data.files) {
            countSpan.textContent = `(${data.files.length})`;
        }
        updateFolderIconState(path);
    }
}

function updateActiveTreeNode(path) {
    document.querySelectorAll('.tree-node').forEach(node => {
        node.classList.remove('active');
        if (node.dataset.path === path || (path === 'ALL_PHOTOS' && node.id === 'allPhotosNode')) {
            node.classList.add('active');
        }
    });
}

function toggleFolderState(li, ul) {
    ul.classList.toggle('expanded');
    const isExpanded = ul.classList.contains('expanded');
    const icon = li.querySelector('i');
    if (icon) {
        icon.classList.remove('fa-folder', 'fa-folder-open');
        icon.classList.add(isExpanded ? 'fa-folder-open' : 'fa-folder');
    }
}

function syncTreeStructure(parentPath, newSubHandles) {
    const parentUl = document.querySelector(`ul[data-parent-path="${CSS.escape(parentPath)}"]`);
    if (!parentUl) return;

    const existingLis = Array.from(parentUl.querySelectorAll(':scope > li.tree-node'));
    const existingNames = new Set(existingLis.map(li => {
        const path = li.dataset.path;
        return path.substring(path.lastIndexOf('/') + 1);
    }));

    const newNames = new Set(newSubHandles.map(h => h.name));

    existingLis.forEach(li => {
        const path = li.dataset.path;
        const name = path.substring(path.lastIndexOf('/') + 1);
        if (!newNames.has(name)) {
            const subUl = document.querySelector(`ul[data-parent-path="${CSS.escape(path)}"]`);
            if (subUl) subUl.remove();
            li.remove();
        }
    });

    newSubHandles.forEach(handle => {
        if (!existingNames.has(handle.name)) {
            const fullPath = parentPath + '/' + handle.name;
            if (!appState.foldersData.has(fullPath)) {
                appState.foldersData.set(fullPath, {
                    handle: handle,
                    files: [],
                    subFolders: [],
                    doms: [],
                    loaded: false
                });
            }
            updateTreeWithSubFolder(parentPath, handle.name, fullPath);
        }
    });
}

function removeTreeNode(path) {
    const li = document.querySelector(`li[data-path="${CSS.escape(path)}"]`);
    if (li) {
        const ul = document.querySelector(`ul[data-parent-path="${CSS.escape(path)}"]`);
        if (ul) ul.remove();
        li.remove();
    }
}

function updateFolderIconState(path) {
    const li = document.querySelector(`li.tree-node[data-path="${CSS.escape(path)}"]`);
    if (!li) return;

    // 如果是 ALL_PHOTOS 特殊节点，通常不用处理 empty-folder 样式，或者有单独逻辑
    if (path === 'ALL_PHOTOS') return;

    const data = appState.foldersData.get(path);
    if (!data) return; // 数据尚未加载

    const isEmpty = (!data.files || data.files.length === 0) &&
        (!data.subFolders || data.subFolders.length === 0);

    if (isEmpty) {
        li.classList.add('empty-folder');
    } else {
        li.classList.remove('empty-folder');
    }
}
