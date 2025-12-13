const UI = {
    hint: document.getElementById('hint'),
    sidebar: document.getElementById('sidebar'),
    treeRoot: document.getElementById('folderTreeRoot'),
    virtualTreeRoot: document.getElementById('virtualTreeRoot'),
    gallery: document.getElementById('galleryContainer'),
    pinBtn: document.getElementById('pinSidebarBtn'),
    resizeHelper: document.getElementById('resize-helper'),
    searchInput: document.getElementById('searchInput'),
    filterCount: document.getElementById('filterCount'),
    filteredCount: document.getElementById('filteredCount'),
    totalCount: document.getElementById('totalCount'),
    pathDisplay: document.getElementById('currentPathDisplay'),
    settingBar: document.getElementById('settingBar'),
    modal: document.getElementById('modal'),
    modalImage: document.getElementById('modalImage'),
    modalLoader: document.getElementById('modalLoader'),
    contextMenu: document.getElementById('contextMenu'),
    refreshBtn: document.getElementById('refreshBtn'),
    folderInput: document.getElementById('folderInput'),
    clearAllBtn: document.getElementById('clearAllBtn')
};

function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<i class="toast-icon">${type === 'success' ? '✓' : '✗'}</i><span>${msg}</span>`;
    document.getElementById('toastContainer').appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function updateFilterCount(displayed, total) {
    UI.filteredCount.textContent = displayed;
    UI.totalCount.textContent = total;
}
