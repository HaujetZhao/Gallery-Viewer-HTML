const appState = {
    rootHandle: null,
    currentPath: null,
    foldersData: new Map(),
    allPhotosMode: false,
    dirMap: new Map(),
    deleteHistory: []
};

// WeakMap 用于存储 DOM -> Folder 的双向引用（避免内存泄漏）
const domToFolderMap = new WeakMap();

const globals = {
    currentDisplayList: [],
    visibleFileList: [], // 当前屏幕上显示的列表（经过过滤和排序）
    get currentImageIndex() { return this._currentImageIndex || -1; },
    set currentImageIndex(val) { this._currentImageIndex = val; }
};
