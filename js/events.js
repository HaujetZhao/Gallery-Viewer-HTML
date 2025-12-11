
function setupEventListeners() {
    document.querySelector('.intro-content').addEventListener('click', openFolderPicker);
    UI.pinBtn.addEventListener('click', () => toggleSidebarPin());
    UI.allPhotosNode.addEventListener('click', () => switchToAllPhotos());

    UI.searchInput.addEventListener('input', debounce(() => {
        renderGalleryFromCache();
    }, 300));

    document.getElementById('sortSelect').addEventListener('change', renderGalleryFromCache);
    document.getElementById('sortToggleBtn').addEventListener('click', toggleSortDirection);

    document.getElementById('settingBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSettingsModal();
    });

    document.addEventListener('click', (e) => {
        if (UI.settingBar.classList.contains('show') &&
            !UI.settingBar.contains(e.target) &&
            e.target.id !== 'settingBtn') {
            hideSettingsModal();
        }
        UI.contextMenu.classList.remove('show');
    });

    UI.refreshBtn.addEventListener('click', handleRefreshAction);
    document.getElementById('clearCurrentBtn').addEventListener('click', forceRegenerateCurrentThumbnails);
    document.getElementById('cleanOldBtn').addEventListener('click', cleanOldCache);
    UI.clearAllBtn.addEventListener('click', () => {
        if (confirm('确定要清空所有缩略图缓存吗？')) {
            clearAllCache();
        }
    });

    const colSlider = document.getElementById('colCountSlider');
    colSlider.addEventListener('input', (e) => {
        document.getElementById('colCountValue').textContent = `${e.target.value}列`;
    });
    colSlider.addEventListener('change', () => {
        renderGalleryFromCache();
    });
    document.getElementById('thumbSizeSlider').addEventListener('change', () => redrawAllThumbnails(true));

    setupSettingsDrag();
    setupModalEvents();

    document.addEventListener('keydown', handleKeyDown);

    UI.gallery.addEventListener('click', handleGalleryClick);
    UI.gallery.addEventListener('contextmenu', handleContextMenu);
    UI.gallery.addEventListener('dragstart', handleDragStart);

    UI.settingBar.addEventListener('click', (e) => {
    });

    const ctxRename = document.getElementById('ctxRename');
    const ctxDelete = document.getElementById('ctxDelete');
    const ctxProperties = document.getElementById('ctxProperties');

    if (ctxProperties) {
        ctxProperties.addEventListener('click', (e) => {
            e.stopPropagation();
            showImageProperties();
        });
    }

    document.getElementById('ctxRename').addEventListener('click', () => {
        const idx = parseInt(UI.contextMenu.dataset.displayIndex);
        const fileData = globals.currentDisplayList[idx];
        if (fileData) {
            UI.contextMenu.classList.remove('show');
            enableInlineRename(fileData.dom, fileData);
        }
    });

    document.getElementById('ctxDelete').addEventListener('click', handleDelete);

    const closePropsBtn = document.querySelector('.close-props-btn');
    const propsModal = document.getElementById('propertiesModal');
    if (closePropsBtn && propsModal) {
        closePropsBtn.addEventListener('click', () => propsModal.classList.add('hidden'));
        propsModal.addEventListener('click', (e) => {
            if (e.target === propsModal) propsModal.classList.add('hidden');
        });
    }
}

function handleGalleryClick(e) {
    if (e.button !== 0) return;
    const card = e.target.closest('.photo-card');
    if (!card || e.target.closest('.card-menu-btn') || e.target.closest('input')) return;
    if (card.fileData) openModal(card.fileData);
}

function handleContextMenu(e) {
    e.preventDefault();
    const card = e.target.closest('.photo-card');
    if (!card) return;

    const menu = UI.contextMenu;
    const fileIndex = globals.currentDisplayList.findIndex(f => f.dom === card);
    const idx = parseInt(card.dataset.currentIndex);
    menu.dataset.displayIndex = idx;

    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;
    menu.classList.add('show');
}

function handleKeyDown(e) {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const isCtrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    const modalState = getModalState();

    if (modalState.isOpen) {
        switch (e.key) {
            case 'Escape': closeModal(); break;
            case 'ArrowRight':
                if (modalState.currentIndex < globals.currentDisplayList.length - 1) {
                    openModalByIndex(modalState.currentIndex + 1);
                }
                break;
            case 'ArrowLeft':
                if (modalState.currentIndex > 0) {
                    openModalByIndex(modalState.currentIndex - 1);
                }
                break;
            case 'c':
            case 'C':
                if (isCtrl) {
                    e.preventDefault();
                    copyCurrentImageToClipboard();
                }
                break;
        }
    } else {
        if (isCtrl && key === 'c') {
            const selectedCard = document.querySelector('.photo-card:hover');
            if (selectedCard && selectedCard.fileData) {
                e.preventDefault();
                copyImage(selectedCard.fileData);
            }
        }
        if (isCtrl && key === 'o') {
            e.preventDefault();
            if (appState.rootHandle) openFolderPicker();
            else UI.folderInput.click();
        }
    }
    if (e.key === 'Escape') {
        if (UI.settingBar.classList.contains('show')) hideSettingsModal();
    }
}

function toggleSettingsModal() {
    if (UI.settingBar.classList.contains('show')) hideSettingsModal();
    else showSettingsModal();
}

function showSettingsModal() {
    updateStorageUsage();
    UI.settingBar.classList.add('show');
    const btnRect = document.getElementById('settingBtn').getBoundingClientRect();
    const modalRect = UI.settingBar.getBoundingClientRect();
    let top = btnRect.bottom + 10;
    let left = btnRect.left;
    if (top + modalRect.height > window.innerHeight) top = btnRect.top - modalRect.height - 10;
    if (left + modalRect.width > window.innerWidth) left = window.innerWidth - modalRect.width - 20;
    UI.settingBar.style.top = `${top}px`;
    UI.settingBar.style.left = `${left}px`;
}

function hideSettingsModal() {
    UI.settingBar.classList.remove('show');
}

let dragData = null;
function setupSettingsDrag() {
    UI.settingBar.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.settings-header')) return;
        e.preventDefault();
        const rect = UI.settingBar.getBoundingClientRect();
        dragData = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        UI.settingBar.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragData) return;
        e.preventDefault();
        const newX = e.clientX - dragData.x;
        const newY = e.clientY - dragData.y;
        const maxX = window.innerWidth - UI.settingBar.offsetWidth;
        const maxY = window.innerHeight - UI.settingBar.offsetHeight;
        UI.settingBar.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
        UI.settingBar.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
    });
    document.addEventListener('mouseup', () => {
        dragData = null;
        UI.settingBar.style.cursor = '';
    });
}

function enableInlineRename(card, fileData) {
    const nameContainer = card.querySelector('.card-info-filename');
    const nameEl = card.querySelector('.file-name');
    const oldName = fileData.name;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.className = 'renaming-input';

    nameEl.style.display = 'none';
    nameContainer.appendChild(input);
    input.focus();
    input.setSelectionRange(0, oldName.lastIndexOf('.'));

    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('dblclick', e => e.stopPropagation());

    const commit = async () => {
        const newName = input.value.trim();
        if (!newName || newName === oldName) { cleanup(); return; }
        if (/[<>:"/\\|?*]/.test(newName)) {
            showToast("文件名包含非法字符", "error");
            input.focus();
            return;
        }
        try {
            await fileData.handle.move(newName);
            fileData.name = newName;
            fileData.path = fileData.path.replace(/[^/]+$/, newName);
            nameEl.textContent = newName;
            showToast("重命名成功");
            cleanup();
        } catch (e) {
            showToast("重命名失败: " + e.message, "error");
            cleanup();
        }
    };

    const cleanup = () => {
        input.remove();
        nameEl.style.display = 'block';
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
        e.stopPropagation();
    });
    input.addEventListener('blur', commit);
}

async function handleDelete() {
    const idx = parseInt(UI.contextMenu.dataset.displayIndex);
    const fileData = globals.currentDisplayList[idx];
    if (!fileData) return;
    if (!confirm(`确定要将 "${fileData.name}" 放入回收站吗？`)) return;

    try {
        const parentPath = await moveFileToTrash(fileData);
        fileData.dom.remove();
        updateFolderCount(parentPath);
        showToast("已移动到 .trash 回收站");
    } catch (e) {
        console.error(e);
        showToast("操作失败: " + e.message, "error");
    }
}
