const appState = {
    rootHandle: null,
    currentPath: null,
    foldersData: new Map(),
    allPhotosMode: false,
    dirMap: new Map()
};

const globals = {
    currentDisplayList: [],
    get currentImageIndex() { return this._currentImageIndex || -1; },
    set currentImageIndex(val) { this._currentImageIndex = val; }
};
