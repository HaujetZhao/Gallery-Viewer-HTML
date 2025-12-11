
let sortDirection = 'asc';

function toggleSortDirection() {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    document.getElementById('sortToggleBtn').querySelector('i').className =
        sortDirection === 'asc' ? 'fas fa-arrow-down-short-wide' : 'fas fa-arrow-down-wide-short';

    if (globals.currentDisplayList) {
        renderGallery(globals.currentDisplayList);
    }
}

function renderGallery(fileList) {
    const galleryContainer = UI.gallery;
    galleryContainer.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'gallery-grid';

    const colCount = parseInt(document.getElementById('colCountSlider').value) || 5;
    const columns = [];
    for (let i = 0; i < colCount; i++) {
        const col = document.createElement('div');
        col.className = 'masonry-col';
        columns.push(col);
    }

    const searchTerm = UI.searchInput.value.toLowerCase();
    let displayFiles = fileList.filter(f => f.path.toLowerCase().includes(searchTerm));

    const sortField = document.getElementById('sortSelect').value;
    const isAsc = sortDirection === 'asc';

    displayFiles.sort((a, b) => {
        let valA, valB;
        if (sortField === 'name') {
            return windowsCompareStrings(a.name, b.name) * (isAsc ? 1 : -1);
        } else if (sortField === 'size') {
            valA = a.size; valB = b.size;
        } else {
            valA = a.lastModified; valB = b.lastModified;
        }
        return (valA - valB) * (isAsc ? 1 : -1);
    });

    const approxCardWidth = (window.innerWidth - 300) / colCount;
    wrapper.style.setProperty('--estimated-height', `${approxCardWidth + 60}px`);

    displayFiles.forEach((fileData, index) => {
        if (!fileData.dom) {
            fileData.dom = createPhotoCard(fileData);
        }
        fileData.dom.dataset.currentIndex = index;
        const colIndex = index % colCount;
        columns[colIndex].appendChild(fileData.dom);
    });

    columns.forEach(col => wrapper.appendChild(col));
    galleryContainer.appendChild(wrapper);

    updateFilterCount(displayFiles.length, fileList.length);

    unobserveAll();
    const observer = getObserver();
    if (observer) {
        displayFiles.forEach(f => {
            const target = f.dom.querySelector('.thumbnail-canvas, .thumbnail-img');
            if (target && f.dom.dataset.loaded !== 'true') {
                observer.observe(target);
            }
        });
    }

    updateFolderIconState(appState.currentPath);
}

function renderGalleryFromCache() {
    if (globals.currentDisplayList) {
        renderGallery(globals.currentDisplayList);
    }
}

function createPhotoCard(fileData) {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.draggable = true;
    card.fileData = fileData; // Direct binding

    const isGif = fileData.name.toLowerCase().endsWith('.gif');
    let mediaEl;

    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'thumbnail-container';

    if (isGif) {
        mediaEl = document.createElement('img');
        mediaEl.className = 'thumbnail-img';
    } else {
        mediaEl = document.createElement('canvas');
        mediaEl.className = 'thumbnail-canvas';
    }

    mediaEl.dataset.loading = 'false';
    mediaEl.dataset.loaded = 'false';
    mediaEl.fileData = fileData;

    const loader = document.createElement('div');
    loader.className = 'loading-indicator';
    loader.innerHTML = '<i class="fas fa-spinner"></i>';

    thumbContainer.appendChild(mediaEl);
    thumbContainer.appendChild(loader);

    const infoName = document.createElement('div');
    infoName.className = 'card-info-filename';
    infoName.innerHTML = `<div class="file-name">${fileData.name}</div>`;

    const infoMeta = document.createElement('div');
    infoMeta.className = 'card-info-meta';
    infoMeta.innerHTML = `
        <div class="file-meta">
            <div class="file-size"><i class="fas fa-hdd"></i> ${formatFileSize(fileData.size)}</div>
            <div class="file-date"><i class="far fa-calendar"></i> ${formatDate(fileData.lastModified)}</div>
        </div>
    `;

    card.appendChild(thumbContainer);
    card.appendChild(infoName);
    card.appendChild(infoMeta);

    return card;
}



function handleDragStart(e) {
    const card = e.target.closest('.photo-card');
    if (!card) return;
    const fileData = card.fileData;
    if (!fileData) return;

    e.dataTransfer.effectAllowed = 'all';
    e.dataTransfer.setData('application/json', JSON.stringify({
        path: fileData.path,
        name: fileData.name,
        sourceDir: appState.currentPath
    }));

    const blobUrl = fileData.blobUrl;
    e.dataTransfer.setData('text/uri-list', blobUrl);
    e.dataTransfer.setData('text/plain', blobUrl);

    const mime = getMimeType(fileData.name);
    e.dataTransfer.setData("DownloadURL", `${mime}:${fileData.name}:${blobUrl}`);

    card.classList.add('dragging');
    setTimeout(() => card.classList.remove('dragging'), 0);
}
