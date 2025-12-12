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
    FOLDER_DELETE: 'folder_delete',
    FOLDER_RENAME: 'folder_rename',
    FOLDER_MOVE: 'folder_move'
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
        this.deleteInfo = null;
    }

    async execute() {
        const fileData = this.fileData;
        const fullPath = fileData.getPath();
        const pathParts = fullPath.split('/');
        const rootName = appState.rootHandle.name;

        // 移除根目录名称
        if (pathParts[0] === rootName) {
            pathParts.shift();
        }

        const fileName = pathParts.pop();
        const relativeDirPath = pathParts.join('/');

        if (!fileData.parent || !fileData.parent.handle) {
            throw new Error("无法定位父文件夹句柄");
        }

        // 创建 .trash 目录结构
        const rootTrashHandle = await appState.rootHandle.getDirectoryHandle('.trash', { create: true });

        let currentDirHandle = rootTrashHandle;
        if (relativeDirPath) {
            const dirs = relativeDirPath.split('/');
            for (const dir of dirs) {
                currentDirHandle = await currentDirHandle.getDirectoryHandle(dir, { create: true });
            }
        }

        // 计算目标文件名(防重名)
        const dotIdx = fileName.lastIndexOf('.');
        const baseName = dotIdx !== -1 ? fileName.substring(0, dotIdx) : fileName;
        const ext = dotIdx !== -1 ? fileName.substring(dotIdx) : '';

        let targetName = fileName;
        let counter = 1;
        while (true) {
            try {
                await currentDirHandle.getFileHandle(targetName);
                targetName = `${baseName}_${counter}${ext}`;
                counter++;
            } catch (e) {
                if (e.name === 'NotFoundError') break;
                throw e;
            }
        }

        // 移动文件到 .trash
        await fileData.handle.move(currentDirHandle, targetName);

        // 更新内存数据
        fileData.parent.removeFile(fileData);

        const listIdx = globals.currentDisplayList.indexOf(fileData);
        if (listIdx > -1) {
            globals.currentDisplayList.splice(listIdx, 1);
        }

        // 保存删除信息
        this.deleteInfo = {
            parentPath: fileData.parent.getPath(),
            parentHandle: fileData.parent.handle,
            originalName: fileName,
            trashName: targetName,
            trashDirHandle: currentDirHandle,
            relativeDirPath,
            fileData: fileData
        };

        return this.deleteInfo;
    }

    async undo() {
        if (!this.deleteInfo) {
            throw new Error('没有删除信息,无法撤销');
        }

        const { parentHandle, originalName, trashName, trashDirHandle, fileData } = this.deleteInfo;

        // 从 .trash 移回原位置
        const trashedFileHandle = await trashDirHandle.getFileHandle(trashName);
        await trashedFileHandle.move(parentHandle, originalName);

        // 重新获取文件句柄
        const restoredHandle = await parentHandle.getFileHandle(originalName);
        const restoredFile = await restoredHandle.getFile();

        // 更新 fileData
        fileData.handle = restoredHandle;
        fileData.file = restoredFile;
        fileData.name = originalName;

        // 重新添加到父文件夹
        if (fileData.parent) {
            fileData.parent.addFile(fileData);
        }

        return originalName;
    }

    getDescription() {
        return `删除文件: ${this.fileData.name}`;
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

        // 保存源文件夹路径
        this.sourcePath = fileData.parent.getPath();

        // 保存目标文件夹路径和对象
        this.targetPath = targetFolder.getPath();
        this.targetFolder = targetFolder;
    }

    async execute() {
        await this.fileData.move(this.targetFolder);
    }

    async undo() {
        // 从 appState.foldersData 获取源文件夹
        const sourceFolder = appState.foldersData.get(this.sourcePath);
        if (!sourceFolder) {
            throw new Error(`源文件夹未找到: ${this.sourcePath}`);
        }

        // 移回原文件夹
        await this.fileData.move(sourceFolder);
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
     */
    async undo() {
        if (this.history.length === 0) {
            throw new Error('没有可撤销的操作');
        }

        const operation = this.history.pop();
        await operation.undo();

        return operation.getDescription();
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
 */
async function undoLastOperation() {
    const description = await operationHistory.undo();
    return description;
}
