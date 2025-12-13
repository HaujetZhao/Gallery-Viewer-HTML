
/**
 * SmartFolder 类 - 表示一个文件夹
 */
class SmartFolder {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {FileSystemDirectoryHandle} options.handle - 文件夹句柄（虚拟文件夹为 null）
     * @param {SmartFolder} options.parent - 父文件夹对象
     * @param {string} options.virtualName - 虚拟文件夹名称（仅用于虚拟文件夹）
     * @param {Object} options.virtualConfig - 虚拟文件夹配置（可选）
     */
    constructor({ handle, parent = null, virtualName = null, virtualConfig = null }) {
        this.handle = handle;           // FileSystemDirectoryHandle
        this.parent = parent;           // Folder 对象引用 (null 表示根目录)

        // 从 handle 获取名字，或使用 virtualName
        if (virtualName) {
            this.name = virtualName;
            this.isVirtual = true;
            this.virtualConfig = virtualConfig || {};
        } else if (handle) {
            this.name = handle.name;
            this.isVirtual = false;
            this.virtualConfig = null;
        } else {
            throw new Error('必须提供 handle 或 virtualName');
        }

        this.files = [];                // SmartFile 对象数组
        this.subFolders = [];           // SmartFolder 对象数组
        this.scanned = false;           // 是否已扫描

        // TreeNode 实例 - 封装所有 DOM 操作
        this.treeNode = new TreeNode(this);
    }

    /**
     * 获取子文件夹列表的 ul 元素
     * @returns {HTMLElement|null} ul.tree-sub-list 元素
     */
    get treeList() {
        return this.treeNode.getChildContainer();
    }

    /**
     * 获取 li 元素（向后兼容）
     * @returns {HTMLElement|null}
     */
    get treeNodeElement() {
        return this.treeNode.li;
    }

    /**
     * 静态工厂方法：创建并扫描文件夹
     * @param {Object} options - 配置选项
     * @param {FileSystemDirectoryHandle} options.handle - 文件夹句柄
     * @param {SmartFolder} options.parent - 父文件夹对象
     * @returns {Promise<Object>} 返回扫描结果 { folder, newFiles, newSubFolders, ... }
     */
    static async create({ handle, parent = null }) {
        const folder = new SmartFolder({ handle, parent });
        return await folder.scan();
    }

    /**
     * 静态工厂方法：创建虚拟文件夹（不扫描）
     * @param {Object} options - 配置选项
     * @param {string} options.virtualName - 虚拟文件夹名称
     * @param {Object} options.virtualConfig - 虚拟文件夹配置
     * @returns {SmartFolder} 返回虚拟文件夹对象
     */
    static createVirtual({ virtualName, virtualConfig = {} }) {
        return new SmartFolder({ handle: null, virtualName, virtualConfig });
    }

    /**
     * 获取文件夹相对于根目录的完整路径
     * @returns {string} 完整路径
     */
    get path() {
        // 虚拟文件夹可以自定义路径
        if (this.isVirtual && this.virtualConfig.customPath) {
            return this.virtualConfig.customPath;
        }

        // 如果没有 handle 或 rootHandle，回退到基于 parent 的路径计算
        if (!this.handle || !appState.rootHandle) {
            const parts = [this.name];
            let current = this.parent;
            while (current) {
                parts.unshift(current.name);
                current = current.parent;
            }
            return parts.join('/');
        }

        // 使用 resolve() 获取路径（同步缓存版本）
        // 注意：resolve() 是异步的，但我们在这里使用缓存的路径
        // 实际的路径解析在 getFolderData 中完成
        const parts = [this.name];
        let current = this.parent;
        while (current) {
            parts.unshift(current.name);
            current = current.parent;
        }
        return parts.join('/');
    }


    /**
     * 删除文件夹
     */
    async delete() {
        if (!this.parent || !this.parent.handle) {
            throw new Error('无法删除根目录或缺少父级引用');
        }

        try {
            // 删除文件夹
            await this.parent.handle.removeEntry(this.name, { recursive: true });

            // 从父级的 subFolders 数组中移除
            const index = this.parent.subFolders.indexOf(this);
            if (index > -1) {
                this.parent.subFolders.splice(index, 1);
            }

            return true;
        } catch (err) {
            console.error('删除文件夹失败:', err);
            throw err;
        }
    }

    /**
     * 移动文件夹 - 暂不实现
     * @param {Folder} targetFolder - 目标文件夹
     */
    async move(targetFolder) {
        throw new Error('文件夹移动功能暂未实现');
    }

    /**
     * 添加文件到文件夹
     * @param {SmartFile} file - 文件对象
     */
    addFile(file) {
        if (!this.files.includes(file)) {
            this.files.push(file);
            file.parent = this;
        }
    }

    /**
     * 添加文件并排序
     * @param {SmartFile} file - 文件对象
     */
    addFileAndSort(file) {
        if (!this.files.includes(file)) {
            this.files.push(file);
            file.parent = this;
            // 重新排序
            this.files.sort((a, b) => windowsCompareStrings(a.name, b.name));
        }
    }

    /**
     * 移除文件
     * @param {SmartFile} file - 文件对象
     */
    removeFile(file) {
        const index = this.files.indexOf(file);
        if (index > -1) {
            this.files.splice(index, 1);
        }
    }

    /**
     * 根据名称查找文件
     * @param {string} fileName - 文件名
     * @returns {SmartFile|null}
     */
    findFile(fileName) {
        return this.files.find(f => f.name === fileName) || null;
    }

    /**
     * 获取文件数量
     * @returns {number}
     */
    getFileCount() {
        return this.files.length;
    }

    /**
     * 获取所有文件（包括子文件夹中的）
     * @returns {SmartFile[]}
     */
    getAllFiles() {
        let allFiles = [...this.files];

        for (const child of this.children) {
            allFiles = allFiles.concat(child.getAllFiles());
        }

        return allFiles;
    }

    /**
     * 清理所有文件资源
     */
    dispose() {
        for (const file of this.files) {
            file.dispose();
        }
        this.files = [];
    }

    /**
     * 扫描文件夹内容（深度复用：在现有容器上执行增删改查）
     * @returns {Promise<SmartFolder>} 返回自身
     */
    async scan() {
        if (!this.handle) {
            throw new Error('scan 需要有效的 handle');
        }

        const dirHandle = this.handle;
        const start = performance.now();

        // 创建现有文件和文件夹的映射表
        const existingFilesMap = new Map(this.files.map(f => [f.name, f]));
        const existingFoldersMap = new Map(this.subFolders.map(f => [f.name, f]));

        const filesToKeep = [];
        const foldersToKeep = [];
        const newFiles = [];
        const newSubFolders = [];

        // ========== 只遍历一次文件夹 ==========
        const scanStart = performance.now();
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                const ext = entry.name.split('.').pop().toLowerCase();
                if (!FileTypes.allMedia.includes(ext)) continue;

                const existingFile = existingFilesMap.get(entry.name);
                if (existingFile) {
                    // 文件已存在，验证并更新
                    try {
                        const file = await entry.getFile();

                        // 检查文件是否有变化
                        if (existingFile.size !== file.size || existingFile.lastModified !== file.lastModified) {
                            await existingFile.refresh();
                        }

                        filesToKeep.push(existingFile);
                        existingFilesMap.delete(entry.name); // 标记为已处理
                    } catch (e) {
                        console.log(`文件 ${entry.name} 的 handle 已失效，将被移除`);
                        // 不添加到 filesToKeep，相当于删除
                    }
                } else {
                    // 新文件
                    try {
                        const file = await entry.getFile();
                        const fileObj = new SmartFile({
                            handle: entry,
                            file: file,
                            parent: this
                        });

                        filesToKeep.push(fileObj);
                        newFiles.push(fileObj);
                    } catch (e) {
                        console.warn("无法读取文件:", entry.name, e);
                    }
                }
            } else if (entry.kind === 'directory') {
                if (entry.name.startsWith('.')) continue;

                const existingFolder = existingFoldersMap.get(entry.name);
                if (existingFolder) {
                    // 文件夹已存在，直接保留（能在遍历中找到就说明存在）
                    foldersToKeep.push(existingFolder);
                    existingFoldersMap.delete(entry.name); // 标记为已处理
                } else {
                    // 新文件夹
                    const subFolderData = new SmartFolder({
                        handle: entry,
                        parent: this
                    });

                    // 注册到全局状态
                    const subPath = this.path + '/' + entry.name;
                    appState.foldersData.set(subPath, subFolderData);

                    foldersToKeep.push(subFolderData);
                    newSubFolders.push(subFolderData);
                }
            }
        }
        console.log(`单次扫描耗时：${performance.now() - scanStart} ms`);

        // ========== 清理已删除的文件和文件夹 ==========
        const cleanupStart = performance.now();

        // 剩余在 Map 中的就是已被删除的
        for (const fileObj of existingFilesMap.values()) {
            fileObj.dispose();
        }

        for (const folderObj of existingFoldersMap.values()) {
            const deletedPath = folderObj.path;
            appState.foldersData.delete(deletedPath);
            folderObj.removeDOMNodes();
        }

        console.log(`清理耗时：${performance.now() - cleanupStart} ms`);

        // ========== 排序并更新 ==========
        const sortStart = performance.now();
        filesToKeep.sort((a, b) => windowsCompareStrings(a.name, b.name));
        foldersToKeep.sort((a, b) => windowsCompareStrings(a.name, b.name));
        console.log(`排序耗时：${performance.now() - sortStart} ms`);

        this.files = filesToKeep;
        this.subFolders = foldersToKeep;
        this.scanned = true;

        console.log(`总耗时：${performance.now() - start} ms`);

        // 返回扫描结果
        return {
            folder: this,
            newFiles,
            newSubFolders,
            removedFileCount: existingFilesMap.size,
            removedFolderCount: existingFoldersMap.size
        };
    }

    /**
     * 更新文件夹计数显示
     */
    updateCount() {
        // 虚拟文件夹可能不需要更新计数
        if (this.isVirtual && this.virtualConfig.skipUpdateCount) {
            return;
        }
        if (this.treeNode) {
            this.treeNode.updateCount();
        }
    }

    /**
     * 更新文件夹图标状态（是否为空）
     */
    updateIconState() {
        // 虚拟文件夹可能不需要更新图标状态
        if (this.isVirtual && this.virtualConfig.skipUpdateIconState) {
            return;
        }
        if (this.treeNode) {
            this.treeNode.updateIconState();
        }
    }

    /**
     * 切换文件夹展开/折叠状态
     */
    toggleExpanded() {
        if (this.treeNode) {
            this.treeNode.toggleExpanded();
        }
    }

    /**
     * 设置为激活状态
     */
    setActive() {
        if (this.treeNode) {
            this.treeNode.setActive();
        }
    }

    /**
     * 移除 DOM 节点
     */
    removeDOMNodes() {
        if (this.treeNode) {
            this.treeNode.remove();
        }
    }

    /**
     * 初始化UI（主要用于虚拟文件夹）
     */
    initUI() {
        if (!this.isVirtual || !this.virtualConfig.uiConfig) {
            return;
        }

        if (!this.treeNode.li) {
            const config = this.virtualConfig.uiConfig;
            // 创建特殊节点
            this.treeNode.createSpecial({
                iconHTML: config.iconHTML,
                text: config.text,
                onClick: config.onClick,
                id: config.id
            });
            // 添加到UI
            this.treeNode.addToUI();
        }
    }

    /**
     * 验证文件夹 handle 是否可用
     * @returns {Promise<boolean>}
     */
    async validate() {
        if (!this.handle) return false;
        try {
            // 尝试查询权限来验证 handle 是否有效
            const permission = await this.handle.queryPermission({ mode: 'read' });
            if (permission === 'denied') return false;

            // 尝试获取第一个条目来验证目录是否存在
            for await (const entry of this.handle.values()) {
                break; // 只需要第一个条目
            }
            return true;
        } catch (err) {
            // NotFoundError 是预期的错误（文件夹被删除/移动），不需要警告
            if (err.name === 'NotFoundError') {
                return false;
            }
            // 其他错误才打印警告
            console.warn(`文件夹 ${this.name} 验证失败:`, err);
            return false;
        }
    }

    /**
     * 向上递归查找第一个可用的祖先
     * @returns {Promise<Folder|null>}
     */
    async findValidAncestor() {
        let current = this;

        while (current) {
            const isValid = await current.validate();
            if (isValid) {
                return current;
            }
            current = current.parent;
        }

        return null; // 连根目录都失效了
    }

    /**
     * 清理整个子树（包括子文件夹和文件）
     * @deprecated 现在使用增量更新策略（scan() + syncTreeStructure）
     * @param {Map} foldersDataMap - appState.foldersData
     */
    clearSubtree(foldersDataMap) {
        // 1. 清理所有文件资源
        this.dispose();

        // 2. 递归清理所有子文件夹
        const pathPrefix = this.path + '/';
        const pathsToDelete = [];

        for (const [path, folderData] of foldersDataMap) {
            if (path.startsWith(pathPrefix)) {
                // 清理该子文件夹的资源
                if (folderData.dispose) folderData.dispose();
                if (folderData.removeDOMNodes) folderData.removeDOMNodes();
                pathsToDelete.push(path);
            }
        }

        // 3. 从 Map 中删除
        for (const path of pathsToDelete) {
            foldersDataMap.delete(path);
        }

        // 4. 清理自己的 DOM 节点（但不删除自己，因为要重新扫描）
        if (this.treeList) {
            // 清空子节点列表
            this.treeList.innerHTML = '';
        }

        // 5. 清空状态
        this.files = [];
        this.subFolders = [];
        this.scanned = false;
    }

    /**
     * 重新扫描并重建子树
     * @deprecated 现在使用增量更新策略（scan() + syncTreeStructure）
     * @returns {Promise<void>}
     */
    async rescanSubtree() {
        try {
            // 1. 扫描当前文件夹
            await this.scan();

            // 2. 更新 UI
            if (this.updateCount) {
                this.updateCount();
            }

            // 3. 同步树结构
            if (this.subFolders && this.subFolders.length > 0) {
                await syncTreeStructure(this);
            }

            return true;
        } catch (err) {
            console.error('重新扫描失败:', err);
            throw err;
        }
    }
}

/**
 * 创建虚拟的 ALL_MEDIA SmartFolder
 * 这是一个特殊的文件夹对象,用于表示"所有媒体"视图
 */
function createAllMediaFolder() {
    return SmartFolder.createVirtual({
        virtualName: 'ALL_MEDIA',
        virtualConfig: {
            customPath: 'ALL_MEDIA',
            skipUpdateCount: true,
            skipUpdateIconState: true,
            uiConfig: {
                iconHTML: '<i class="fas fa-layer-group"></i>',
                text: '所有媒体 (All Media)',
                id: 'allPhotosNode'
            }
        }
    });
}

// 创建全局 ALL_MEDIA 文件夹实例
const ALL_MEDIA_FOLDER = createAllMediaFolder();
appState.foldersData.set('ALL_MEDIA', ALL_MEDIA_FOLDER);

