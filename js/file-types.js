/**
 * 文件类型配置
 * 统一管理所有支持的媒体文件类型
 */

const FileTypes = {
    // 图片格式
    image: {
        // 普通图片
        standard: ['jpg', 'jpeg', 'png', 'webp', 'bmp'],
        // GIF 动图
        gif: ['gif'],
        // SVG 矢量图
        svg: ['svg'],
        // 所有图片格式
        get all() {
            return [...this.standard, ...this.gif, ...this.svg];
        }
    },

    // 视频格式
    video: {
        // 常见格式
        common: ['mp4', 'webm', 'ogg', 'mov'],
        // 扩展格式
        extended: ['mkv', 'flv', 'avi'],
        // 所有视频格式
        get all() {
            return [...this.common, ...this.extended];
        }
    },

    // 音频格式
    audio: {
        // 常见格式
        common: ['mp3', 'wav', 'ogg', 'flac', 'm4a'],
        // 所有音频格式
        get all() {
            return [...this.common];
        }
    },

    // 所有支持的媒体格式
    get allMedia() {
        return [...this.image.all, ...this.video.all, ...this.audio.all];
    },

    /**
     * 根据文件扩展名获取文件类型
     * @param {string} extension - 文件扩展名(小写)
     * @returns {string} 文件类型: 'image', 'video', 'audio', 'unknown'
     */
    getType(extension) {
        if (this.image.all.includes(extension)) return 'image';
        if (this.video.all.includes(extension)) return 'video';
        if (this.audio.all.includes(extension)) return 'audio';
        return 'unknown';
    },

    /**
     * 根据文件扩展名获取详细类型
     * @param {string} extension - 文件扩展名(小写)
     * @returns {string} 详细类型: 'standard', 'gif', 'svg', 'common', 'extended', 'unknown'
     */
    getDetailedType(extension) {
        if (this.image.standard.includes(extension)) return 'standard';
        if (this.image.gif.includes(extension)) return 'gif';
        if (this.image.svg.includes(extension)) return 'svg';
        if (this.video.common.includes(extension)) return 'common';
        if (this.video.extended.includes(extension)) return 'extended';
        if (this.audio.common.includes(extension)) return 'common';
        return 'unknown';
    },

    /**
     * 检查文件扩展名是否被支持
     * @param {string} extension - 文件扩展名(小写)
     * @returns {boolean}
     */
    isSupported(extension) {
        return this.allMedia.includes(extension);
    }
};
