/**
 * SmartFile 类 - 表示一个图片文件
 */
class SmartFile {
    constructor({ handle, file, name, parent = null }) {
        this.handle = handle;           // FileSystemFileHandle
        this.file = file;               // File 对象
        this.name = name;               // 文件名
        this.parent = parent;           // Folder 对象引用
        this.size = file.size;
        this.lastModified = file.lastModified;
        this.blobUrl = URL.createObjectURL(file);
        this.dom = null;                // 关联的 DOM 元素
        this.md5 = null;                // MD5 哈希值
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
     * @param {Folder} targetFolder - 目标文件夹
     */
    async move(targetFolder) {
        if (!this.parent || !this.parent.handle) {
            throw new Error('无法移动：缺少父级引用');
        }
        if (!targetFolder || !targetFolder.handle) {
            throw new Error('无法移动：目标文件夹无效');
        }

        try {
            // 1. 复制文件到目标文件夹
            const newFileHandle = await targetFolder.handle.getFileHandle(this.name, { create: true });
            const srcFile = await this.handle.getFile();
            const writable = await newFileHandle.createWritable();
            await writable.write(srcFile);
            await writable.close();

            // 2. 删除源文件
            await this.parent.handle.removeEntry(this.name);

            // 3. 从原父级的 files 数组中移除
            const index = this.parent.files.indexOf(this);
            if (index > -1) {
                this.parent.files.splice(index, 1);
            }

            // 4. 更新自己的属性
            this.parent = targetFolder;
            this.handle = newFileHandle;

            // 5. 添加到新父级的 files 数组
            targetFolder.files.push(this);

            // 重新获取 File 对象
            const newFile = await newFileHandle.getFile();
            this.file = newFile;

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
            // NotFoundError 是预期的错误（文件被删除/移动），不需要警告
            if (err.name === 'NotFoundError') {
                return false;
            }
            // 其他错误才打印警告
            console.warn(`文件 ${this.name} 验证失败:`, err);
            return false;
        }
    }
}

/**
 * Folder 类 - 表示一个文件夹
 */
class Folder {
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
            // 使用 File System Access API 的 move 方法重命名
            await this.handle.move(newName);

            // 更新自身属性
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

