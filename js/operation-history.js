/**
 * 操作历史管理系统
 * 统一管理文件和文件夹的操作(删除、重命名等),支持撤销
 */

/**
 * 操作类型枚举
 */
const OperationType = {
    FILE_DELETE: 'file_delete',
    FILE_RENAME: 'file_rename',
    FILE_MOVE: 'file_move',
};

/**
 * 基础操作类
 */
class Operation {
    constructor(type, target) {
        this.type = type;
        this.target = target;
        this.timestamp = Date.now();
    }

    /**
     * 执行操作
     * @abstract
     */
    async execute() {
        throw new Error('execute() must be implemented');
    }

    /**
     * 撤销操作
     * @abstract
     */
    async undo() {
        throw new Error('undo() must be implemented');
    }

    /**
     * 获取操作描述
     * @abstract
     */
    getDescription() {
        throw new Error('getDescription() must be implemented');
    }
}

/**
 * 文件删除操作
 */
class FileDeleteOperation extends Operation {
    constructor(fileData) {
        super(OperationType.FILE_DELETE, fileData);
        this.fileData = fileData;

        // 保存必要信息
        this.parentFolder = fileData.parent;
        this.originalName = fileData.name;
        this.trashPath = null;  // 删除后在回收站中的完整路径
    }

    /**
     * 获取文件在回收站中的相对路径
     * @returns {string} 相对路径（不含根目录名）
     */
    _getRelativePath() {
        const fullPath = this.fileData.path;
        const pathParts = fullPath.split('/');
        const rootName = appState.rootHandle.name;

        // 移除根目录名称
        if (pathParts[0] === rootName) {
            pathParts.shift();
        }

        pathParts.pop(); // 移除文件名
        return pathParts.join('/');
    }

    /**
     * 创建回收站目录结构
     * @returns {Promise<FileSystemDirectoryHandle>} 目标目录句柄
     */
    async _createTrashDirectory() {
        const rootTrashHandle = await appState.rootHandle.getDirectoryHandle('.trash', { create: true });
        const relativePath = this._getRelativePath();

        if (!relativePath) {
            return rootTrashHandle;
        }

        let currentDirHandle = rootTrashHandle;
        const dirs = relativePath.split('/');
        for (const dir of dirs) {
            currentDirHandle = await currentDirHandle.getDirectoryHandle(dir, { create: true });
        }

        return currentDirHandle;
    }

    /**
     * 生成唯一的回收站文件名（防重名）
     * @param {FileSystemDirectoryHandle} trashDirHandle - 回收站目录句柄
     * @returns {Promise<string>} 唯一的文件名
     */
    async _generateUniqueTrashName(trashDirHandle) {
        const fileName = this.originalName;
        const dotIdx = fileName.lastIndexOf('.');
        const baseName = dotIdx !== -1 ? fileName.substring(0, dotIdx) : fileName;
        const ext = dotIdx !== -1 ? fileName.substring(dotIdx) : '';

        let targetName = fileName;
        let counter = 1;

        while (true) {
            try {
                await trashDirHandle.getFileHandle(targetName);
                targetName = `${baseName}_${counter}${ext}`;
                counter++;
            } catch (e) {
                if (e.name === 'NotFoundError') break;
                throw e;
            }
        }

        return targetName;
    }

    /**
     * 从显示列表中移除文件
     */
    _removeFromDisplayList() {
        const listIdx = globals.currentDisplayList.indexOf(this.fileData);
        if (listIdx > -1) {
            globals.currentDisplayList.splice(listIdx, 1);
        }
    }

    async execute() {
        if (!this.parentFolder || !this.parentFolder.handle) {
            throw new Error("无法定位父文件夹");
        }

        // 创建回收站目录结构
        const trashDirHandle = await this._createTrashDirectory();

        // 生成唯一文件名
        const trashName = await this._generateUniqueTrashName(trashDirHandle);

        // 移动文件到回收站
        await this.fileData.handle.move(trashDirHandle, trashName);

        // 保存回收站路径
        const relativePath = this._getRelativePath();
        this.trashPath = relativePath ? `${relativePath}/${trashName}` : trashName;

        // 更新内存数据
        this.parentFolder.removeFile(this.fileData);
        this._removeFromDisplayList();
    }

    async undo() {
        if (!this.trashPath) {
            throw new Error('没有删除信息，无法撤销');
        }

        // 解析回收站路径
        const rootTrashHandle = await appState.rootHandle.getDirectoryHandle('.trash');
        const pathParts = this.trashPath.split('/');
        const trashName = pathParts.pop();

        // 定位到回收站中的文件
        let trashDirHandle = rootTrashHandle;
        for (const dir of pathParts) {
            trashDirHandle = await trashDirHandle.getDirectoryHandle(dir);
        }

        // 从回收站移回原位置
        const trashedFileHandle = await trashDirHandle.getFileHandle(trashName);
        await trashedFileHandle.move(this.parentFolder.handle, this.originalName);

        // 重新获取文件信息
        const restoredHandle = await this.parentFolder.handle.getFileHandle(this.originalName);
        const restoredFile = await restoredHandle.getFile();

        // 更新 fileData
        this.fileData.handle = restoredHandle;
        this.fileData.file = restoredFile;

        // 重新添加到父文件夹
        this.parentFolder.addFile(this.fileData);
    }

    getDescription() {
        return `删除文件: ${this.originalName}`;
    }
}

/**
 * 文件重命名操作
 */
class FileRenameOperation extends Operation {
    constructor(fileData, oldName, newName) {
        super(OperationType.FILE_RENAME, fileData);
        this.fileData = fileData;
        this.oldName = oldName;
        this.newName = newName;
    }

    async execute() {
        await this.fileData.rename(this.newName);
    }

    async undo() {
        await this.fileData.rename(this.oldName);

        // 更新 DOM 显示
        if (this.fileData.dom) {
            const nameEl = this.fileData.dom.querySelector('.file-name');
            if (nameEl) {
                nameEl.textContent = this.oldName;
            }
        }
    }

    getDescription() {
        return `重命名：${this.oldName}`;
    }
}

/**
 * 文件移动操作
 */
class FileMoveOperation extends Operation {
    constructor(fileData, targetFolder) {
        super(OperationType.FILE_MOVE, fileData);
        this.fileData = fileData;

        // 从 fileData.parent 获取源文件夹
        if (!fileData.parent) {
            throw new Error('文件缺少父文件夹引用');
        }

        // 直接保存源文件夹对象引用
        this.sourceFolder = fileData.parent;

        // 保存目标文件夹对象
        this.targetFolder = targetFolder;
    }

    async execute() {
        await this.fileData.move(this.targetFolder);
    }

    async undo() {
        // 直接使用保存的源文件夹对象
        if (!this.sourceFolder) {
            throw new Error('源文件夹引用丢失');
        }

        // 移回原文件夹
        await this.fileData.move(this.sourceFolder);
    }

    getDescription() {
        return `移动文件：${this.fileData.name}`;
    }
}

/**
 * 操作历史管理器
 */
class OperationHistory {
    constructor(maxSize = 50) {
        this.history = [];
        this.maxSize = maxSize;
    }

    /**
     * 添加操作到历史
     */
    push(operation) {
        this.history.push(operation);

        // 限制历史记录大小
        if (this.history.length > this.maxSize) {
            this.history.shift();
        }
    }

    /**
     * 撤销最后一个操作
     * @returns {Promise<Operation>} 返回被撤销的操作对象
     */
    async undo() {
        if (this.history.length === 0) {
            throw new Error('没有可撤销的操作');
        }

        const operation = this.history.pop();
        await operation.undo();

        return operation;
    }

    /**
     * 清空历史
     */
    clear() {
        this.history = [];
    }

    /**
     * 获取历史记录数量
     */
    size() {
        return this.history.length;
    }

    /**
     * 获取最后一个操作的描述
     */
    getLastOperationDescription() {
        if (this.history.length === 0) {
            return null;
        }
        return this.history[this.history.length - 1].getDescription();
    }
}

// 创建全局操作历史管理器
const operationHistory = new OperationHistory();

/**
 * 辅助函数: 执行文件删除并记录到历史
 */
async function deleteFileWithHistory(fileData) {
    const operation = new FileDeleteOperation(fileData);
    const deleteInfo = await operation.execute();
    operationHistory.push(operation);
    return deleteInfo;
}

/**
 * 辅助函数: 执行文件重命名并记录到历史
 */
async function renameFileWithHistory(fileData, newName) {
    const oldName = fileData.name;
    const operation = new FileRenameOperation(fileData, oldName, newName);
    await operation.execute();
    operationHistory.push(operation);
}

/**
 * 辅助函数: 执行文件移动并记录到历史
 */
async function moveFileWithHistory(fileData, targetFolder) {
    const operation = new FileMoveOperation(fileData, targetFolder);
    await operation.execute();
    operationHistory.push(operation);
}


/**
 * 辅助函数: 撤销最后一个操作
 * @returns {Promise<Operation>} 返回被撤销的操作对象
 */
async function undoLastOperation() {
    const operation = await operationHistory.undo();
    return operation;
}
