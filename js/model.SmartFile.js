/**
 * SmartFile 类 - 表示一个图片文件
 */
class SmartFile {
    constructor({ handle, file, parent = null }) {
        this.handle = handle;           // FileSystemFileHandle
        this.file = file;               // File 对象
        this.parent = parent;           // Folder 对象引用
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
     * 获取文件名
     * @returns {string} 文件名
     */
    get name() {
        return this.handle.name;
    }

    /**
     * 获取文件大小
     * @returns {number} 文件大小（字节）
     */
    get size() {
        return this.file.size;
    }

    /**
     * 获取最后修改时间
     * @returns {number} 时间戳
     */
    get lastModified() {
        return this.file.lastModified;
    }

    /**
     * 获取文件类型（扩展名）
     * @returns {string} 文件类型
     */
    get type() {
        return this._extractType(this.name);
    }

    /**
     * 获取文件相对于根目录的完整路径
     * @returns {string} 完整路径
     */
    get path() {
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

            // 重新获取 File 对象
            const newFile = await this.handle.getFile();
            this.file = newFile;

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

