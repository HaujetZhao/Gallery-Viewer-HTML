
/**
 * 媒体属性提取策略
 * 为不同媒体类型提供元数据提取方法
 */

const MetadataStrategies = {
    // 图片元数据提取
    image: {
        types: [...FileTypes.image.standard, ...FileTypes.image.gif],

        async getDimensions(fileData) {
            return new Promise(resolve => {
                const img = new Image();
                img.src = fileData.blobUrl;
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = () => resolve({ width: 0, height: 0 });
            });
        },

        async getMetadata(fileData) {
            const metadata = {};

            // 获取尺寸
            const dim = await this.getDimensions(fileData);
            metadata.dimensions = dim;

            // 获取 EXIF
            try {
                let fileObj = fileData.handle ? await fileData.handle.getFile() : fileData.file;
                if (window.extractExif) {
                    metadata.exif = await window.extractExif(fileObj);
                }
            } catch (e) {
                console.error("读取EXIF失败", e);
            }

            return metadata;
        }
    },

    // 视频元数据提取
    video: {
        types: FileTypes.video.all,

        async getDimensions(fileData) {
            return new Promise(resolve => {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;

                const cleanup = () => {
                    video.removeAttribute('src');
                    video.load(); // 重置 video 元素
                };

                video.addEventListener('loadedmetadata', () => {
                    const metadata = {
                        width: video.videoWidth,
                        height: video.videoHeight,
                        duration: video.duration
                    };

                    // 估算比特率 (文件大小 / 时长)
                    if (fileData.size && video.duration) {
                        metadata.estimatedBitrate = Math.round((fileData.size * 8) / video.duration / 1000); // kbps
                    }

                    resolve(metadata);
                    cleanup();
                }, { once: true });

                video.addEventListener('error', () => {
                    resolve({ width: 0, height: 0, duration: 0 });
                    cleanup();
                }, { once: true });

                video.src = fileData.blobUrl;
            });
        },

        async getMetadata(fileData) {
            const metadata = {};
            const dim = await this.getDimensions(fileData);
            metadata.dimensions = dim;
            return metadata;
        }
    },

    // 音频元数据提取
    audio: {
        types: FileTypes.audio.all,

        async getDimensions(fileData) {
            return new Promise(resolve => {
                const audio = new Audio();
                audio.preload = 'metadata';

                const cleanup = () => {
                    audio.removeAttribute('src');
                    audio.load(); // 重置 audio 元素
                };

                audio.addEventListener('loadedmetadata', () => {
                    resolve({ duration: audio.duration });
                    cleanup();
                }, { once: true });

                audio.addEventListener('error', () => {
                    resolve({ duration: 0 });
                    cleanup();
                }, { once: true });

                audio.src = fileData.blobUrl;
            });
        },

        async getMetadata(fileData) {
            const metadata = {};

            // 获取时长
            const dim = await this.getDimensions(fileData);
            metadata.dimensions = dim;

            // 提取 ID3 标签信息 (仅 MP3)
            if (fileData.type === 'mp3') {
                try {
                    const id3Tags = await extractID3Tags(fileData);
                    if (id3Tags) {
                        metadata.id3 = id3Tags;
                        console.log('ID3 标签信息:', id3Tags);
                    }
                } catch (err) {
                    console.error('提取 ID3 标签失败:', err);
                }
            }

            return metadata;
        }
    },

    // SVG 元数据提取
    svg: {
        types: FileTypes.image.svg,

        async getDimensions(fileData) {
            return new Promise(resolve => {
                const img = new Image();
                img.src = fileData.blobUrl;
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = () => resolve({ width: 0, height: 0 });
            });
        },

        async getMetadata(fileData) {
            const metadata = {};
            const dim = await this.getDimensions(fileData);
            metadata.dimensions = dim;
            return metadata;
        }
    }
};

/**
 * 根据文件类型获取元数据策略
 */
function getMetadataStrategy(fileType) {
    for (const [strategyName, strategy] of Object.entries(MetadataStrategies)) {
        if (strategy.types.includes(fileType)) {
            return strategy;
        }
    }
    // 默认使用图片策略
    return MetadataStrategies.image;
}

/**
 * 格式化时长(秒)为可读格式
 */
function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '未知';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    } else {
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}
