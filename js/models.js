/**
 * SmartFile 类 - 表示一个图片文件
 */
class SmartFile {
    constructor({ handle, file, name, parent = null }) {
        this.handle = handle;           // FileSystemFileHandle
        this.file = file;               // File 对象
        this.name = name;               // 文件名
        this.parent = parent;           // Folder 对象引用
        this.type = this._extractType(name); // 从文件名提取类型(扩展名)
        this.size = file.size;
        this.lastModified = file.lastModified;
        this.blobUrl = URL.createObjectURL(file);
        this.dom = null;                // 关联的 DOM 元素
        this.md5 = null;                // MD5 哈希值
    }

    /**
     * 从文件名提取文件类型(扩展名)
     * @param {string} filename - 文件名
     * @returns {string} 文件类型(小写),如 'png', 'jpg', 'svg', 'gif'
     * @private
     */
    _extractType(filename) {
        const parts = filename.split('.');
        if (parts.length < 2) return '';
        return parts.pop().toLowerCase();
    }

    /**
     * 获取文件相对于根目录的完整路径
     * @returns {string} 完整路径
     */
    getPath() {
        const parts = [this.name];
        let current = this.parent;

        while (current) {
            parts.unshift(current.name);
            current = current.parent;
        }

        return parts.join('/');
    }

    /**
     * 重命名文件
     * @param {string} newName - 新文件名
     */
    async rename(newName) {
        if (!this.handle || !this.parent) {
            throw new Error('无法重命名：缺少必要的句柄或父级引用');
        }

        try {
            // 使用 File System Access API 的 move 方法重命名
            await this.handle.move(newName);

            // 更新自身属性
            this.name = newName;
            this.type = this._extractType(newName); // 更新文件类型
            this.path = this.getPath(); // 自动更新完整路径

            // 重新获取 File 对象
            const newFile = await this.handle.getFile();
            this.file = newFile;
            this.size = newFile.size;
            this.lastModified = newFile.lastModified;

            // 更新 blob URL
            if (this.blobUrl) {
                URL.revokeObjectURL(this.blobUrl);
            }
            this.blobUrl = URL.createObjectURL(newFile);

            // 清除 MD5 缓存
            this.md5 = null;

            return true;
        } catch (err) {
            console.error('重命名失败:', err);
            throw err;
        }
    }

    /**
     * 删除文件（移动到回收站）
     */
    async delete() {
        if (!this.parent || !this.parent.handle) {
            throw new Error('无法删除：缺少父级引用');
        }

        try {
            // 调用全局的 moveFileToTrash 函数
            const deleteInfo = await moveFileToTrash(this);

            // 从父级的 files 数组中移除
            const index = this.parent.files.indexOf(this);
            if (index > -1) {
                this.parent.files.splice(index, 1);
            }

            // 释放资源
            if (this.blobUrl) {
                URL.revokeObjectURL(this.blobUrl);
            }

            return deleteInfo;
        } catch (err) {
            console.error('删除失败:', err);
            throw err;
        }
    }

    /**
     * 移动文件到另一个文件夹
     * @param {Folder} targetFolder - 目标文件夹对象
     */
    async move(targetFolder) {
        if (!this.parent || !this.parent.handle) {
            throw new Error('无法移动：缺少父级引用');
        }
        if (!targetFolder || !targetFolder.handle) {
            throw new Error('无法移动：目标文件夹无效');
        }

        try {
            // 使用 File System Access API 的 move 方法，handle 不变
            await this.handle.move(targetFolder.handle);

            // 从原父级的 files 数组中移除
            const index = this.parent.files.indexOf(this);
            if (index > -1) {
                this.parent.files.splice(index, 1);
            }

            // 更新父级引用
            this.parent = targetFolder;

            // 添加到新父级的 files 数组
            targetFolder.files.push(this);

            // 更新路径
            this.path = this.getPath();

            return true;
        } catch (err) {
            console.error('移动失败:', err);
            throw err;
        }
    }

    /**
     * 更新文件信息（用于刷新）
     */
    async refresh() {
        try {
            const file = await this.handle.getFile();

            // 检查是否发生变化
            if (this.size !== file.size || this.lastModified !== file.lastModified) {
                // 文件已变化，更新属性
                if (this.blobUrl) {
                    URL.revokeObjectURL(this.blobUrl);
                }

                this.file = file;
                this.size = file.size;
                this.lastModified = file.lastModified;
                this.blobUrl = URL.createObjectURL(file);
                this.md5 = null;
            }

            return true;
        } catch (err) {
            console.error('刷新文件失败:', err);
            throw err;
        }
    }

    /**
     * 清理资源
     */
    dispose() {
        if (this.blobUrl) {
            URL.revokeObjectURL(this.blobUrl);
            this.blobUrl = null;
        }
    }

    /**
     * 验证文件 handle 是否可用
     * @returns {Promise<boolean>}
     */
    async validate() {
        if (!this.handle) return false;
        try {
            // 尝试获取文件来验证 handle 是否有效
            await this.handle.getFile();
            return true;
        } catch (err) {
            // NotFoundError 是预期的错误(文件被删除/移动),不需要警告
            if (err.name === 'NotFoundError') {
                return false;
            }
            // 其他错误才打印警告
            console.warn(`文件 ${this.name} 验证失败:`, err);
            return false;
        }
    }

    /**
     * 从文件头获取实际文件类型(通过魔数识别)
     * @returns {Promise<string>} 实际文件类型,如 'png', 'jpg', 'gif', 'webp', 'svg' 等
     */
    async getActualType() {
        try {
            const file = await this.handle.getFile();

            // 读取文件头部字节
            const buffer = await file.slice(0, 12).arrayBuffer();
            const bytes = new Uint8Array(buffer);

            // 检查魔数(magic number)
            // PNG: 89 50 4E 47 0D 0A 1A 0A
            if (bytes.length >= 8 &&
                bytes[0] === 0x89 && bytes[1] === 0x50 &&
                bytes[2] === 0x4E && bytes[3] === 0x47) {
                return 'png';
            }

            // JPEG: FF D8 FF
            if (bytes.length >= 3 &&
                bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
                return 'jpg';
            }

            // GIF: 47 49 46 38 (GIF8)
            if (bytes.length >= 4 &&
                bytes[0] === 0x47 && bytes[1] === 0x49 &&
                bytes[2] === 0x46 && bytes[3] === 0x38) {
                return 'gif';
            }

            // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF...WEBP)
            if (bytes.length >= 12 &&
                bytes[0] === 0x52 && bytes[1] === 0x49 &&
                bytes[2] === 0x46 && bytes[3] === 0x46 &&
                bytes[8] === 0x57 && bytes[9] === 0x45 &&
                bytes[10] === 0x42 && bytes[11] === 0x50) {
                return 'webp';
            }

            // BMP: 42 4D (BM)
            if (bytes.length >= 2 &&
                bytes[0] === 0x42 && bytes[1] === 0x4D) {
                return 'bmp';
            }

            // SVG: 检查文本内容是否包含 <svg
            if (this.type === 'svg') {
                const text = await file.slice(0, 1000).text();
                if (text.includes('<svg') || text.includes('<?xml')) {
                    return 'svg';
                }
            }

            // 如果无法识别,返回从文件名提取的类型
            return this.type;

        } catch (err) {
            console.warn(`获取文件 ${this.name} 实际类型失败:`, err);
            return this.type; // 失败时返回从文件名提取的类型
        }
    }
}


/**
 * SmartFolder 类 - 表示一个文件夹
 */
class SmartFolder {
    constructor({ handle, name, parent = null }) {
        this.handle = handle;           // FileSystemDirectoryHandle
        this.name = name;               // 文件夹名
        this.parent = parent;           // Folder 对象引用 (null 表示根目录)
        this.files = [];                // SmartFile 对象数组
        this.subFolders = [];           // 子文件夹句柄数组 (暂时保持兼容)
        this.children = [];             // Folder 对象数组 (未来使用)
        this.doms = [];                 // 关联的 DOM 元素（兼容性）
        this.scanned = false;           // 是否已扫描

        // DOM 节点引用
        this.treeNode = null;           // li.tree-node 元素
        this.treeList = null;           // ul.tree-sub-list 元素
    }

    /**
     * 获取文件夹相对于根目录的完整路径
     * @returns {string} 完整路径
     */
    getPath() {
        const parts = [this.name];
        let current = this.parent;

        while (current) {
            parts.unshift(current.name);
            current = current.parent;
        }

        return parts.join('/');
    }

    /**
     * 重命名文件夹
     * @param {string} newName - 新文件夹名
     */
    async rename(newName) {
        if (!this.handle || !this.parent) {
            throw new Error('无法重命名根目录或缺少父级引用');
        }

        try {
            // 注意: File System Access API 的 move() 方法是实验性的,可能不被支持
            // 我们使用一个变通方法:
            // 1. 在父目录创建新名称的文件夹
            // 2. 递归复制所有内容
            // 3. 删除旧文件夹
            // 但这个操作非常复杂且耗时,所以我们暂时只支持空文件夹重命名

            // 检查是否为空文件夹
            const isEmpty = this.files.length === 0 && this.subFolders.length === 0;
            if (!isEmpty) {
                throw new Error('当前只支持重命名空文件夹。非空文件夹重命名功能开发中。');
            }

            // 创建新文件夹
            await this.parent.handle.getDirectoryHandle(newName, { create: true });

            // 删除旧文件夹
            await this.parent.handle.removeEntry(this.name);

            // 获取新文件夹的 handle
            const newHandle = await this.parent.handle.getDirectoryHandle(newName);

            // 更新自身属性
            this.handle = newHandle;
            this.name = newName;

            return true;
        } catch (err) {
            console.error('重命名文件夹失败:', err);
            throw err;
        }
    }

    /**
     * 删除文件夹
     * 注意：此方法仅用于删除空文件夹或将来扩展
     */
    async delete() {
        if (!this.parent || !this.parent.handle) {
            throw new Error('无法删除根目录或缺少父级引用');
        }

        try {
            // 删除文件夹
            await this.parent.handle.removeEntry(this.name, { recursive: true });

            // 从父级的 children 数组中移除
            const index = this.parent.children.indexOf(this);
            if (index > -1) {
                this.parent.children.splice(index, 1);
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
     * 更新文件夹计数显示
     */
    updateCount() {
        if (!this.treeNode) return;

        let countSpan = this.treeNode.querySelector('.tree-node-count');
        if (!countSpan) {
            countSpan = document.createElement('span');
            countSpan.className = 'tree-node-count';
            this.treeNode.appendChild(countSpan);
        }

        countSpan.textContent = `(${this.files.length})`;
        this.updateIconState();
    }

    /**
     * 更新文件夹图标状态（是否为空）
     */
    updateIconState() {
        if (!this.treeNode) return;

        const isEmpty = this.files.length === 0 && this.subFolders.length === 0;

        if (isEmpty) {
            this.treeNode.classList.add('empty-folder');
        } else {
            this.treeNode.classList.remove('empty-folder');
        }
    }

    /**
     * 切换文件夹展开/折叠状态
     */
    toggleExpanded() {
        if (!this.treeList || !this.treeNode) return;

        this.treeList.classList.toggle('expanded');
        const isExpanded = this.treeList.classList.contains('expanded');

        const icon = this.treeNode.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-folder', 'fa-folder-open');
            icon.classList.add(isExpanded ? 'fa-folder-open' : 'fa-folder');
        }
    }

    /**
     * 设置为激活状态
     */
    setActive() {
        if (!this.treeNode) return;

        // 移除所有其他节点的激活状态
        document.querySelectorAll('.tree-node').forEach(node => {
            node.classList.remove('active');
        });

        this.treeNode.classList.add('active');
    }

    /**
     * 移除 DOM 节点
     */
    removeDOMNodes() {
        if (this.treeNode) {
            this.treeNode.remove();
            this.treeNode = null;
        }
        if (this.treeList) {
            this.treeList.remove();
            this.treeList = null;
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
     * @deprecated 现在使用增量更新策略（scanDirectory + syncTreeStructure）
     * @param {Map} foldersDataMap - appState.foldersData
     */
    clearSubtree(foldersDataMap) {
        // 1. 清理所有文件资源
        this.dispose();

        // 2. 递归清理所有子文件夹
        const pathPrefix = this.getPath() + '/';
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
     * @deprecated 现在使用增量更新策略（scanDirectory + syncTreeStructure）
     * @returns {Promise<void>}
     */
    async rescanSubtree() {
        try {
            // 1. 扫描当前文件夹
            await scanDirectory(this);

            // 2. 更新 UI
            if (this.updateCount) {
                this.updateCount();
            }

            // 3. 同步树结构
            if (this.subFolders && this.subFolders.length > 0) {
                const path = this.getPath();
                await syncTreeStructure(path, this.subFolders);
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
    const allMediaFolder = new SmartFolder({
        handle: null,  // 虚拟文件夹没有实际的 handle
        name: 'ALL_MEDIA',
        parent: null
    });

    // 标记为虚拟文件夹
    allMediaFolder.isVirtual = true;

    // 重写 getPath 方法
    allMediaFolder.getPath = function () {
        return 'ALL_MEDIA';
    };

    // 重写 updateCount 方法 (虚拟文件夹不需要更新计数)
    allMediaFolder.updateCount = function () {
        // 不执行任何操作
    };

    // 重写 updateIconState 方法
    allMediaFolder.updateIconState = function () {
        // 不执行任何操作
    };

    return allMediaFolder;
}

// 创建全局 ALL_MEDIA 文件夹实例
const ALL_MEDIA_FOLDER = createAllMediaFolder();

