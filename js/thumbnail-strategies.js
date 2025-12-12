
/**
 * 缩略图生成策略
 * 为不同媒体类型提供缩略图生成和卡片标识
 */

const ThumbnailStrategies = {
    // 图片策略
    image: {
        types: FileTypes.image.standard,

        // 创建缩略图元素
        createThumbnailElement: () => {
            const canvas = document.createElement('canvas');
            canvas.className = 'thumbnail-canvas';
            return canvas;
        },

        // 生成缩略图
        generateThumbnail: async (element, fileData, targetSize) => {
            const img = new Image();
            img.src = fileData.blobUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            const canvas = element;
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');
            const ratio = Math.max(targetSize / img.width, targetSize / img.height);
            const centerShift_x = (targetSize - img.width * ratio) / 2;
            const centerShift_y = (targetSize - img.height * ratio) / 2;

            ctx.drawImage(img, 0, 0, img.width, img.height,
                centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);

            return new Promise(resolve => {
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
            });
        },

        // 卡片标识(可选)
        getCardBadge: () => null
    },

    // GIF 策略
    gif: {
        types: FileTypes.image.gif,

        createThumbnailElement: () => {
            const img = document.createElement('img');
            img.className = 'thumbnail-img';
            return img;
        },

        generateThumbnail: async (element, fileData) => {
            element.src = fileData.blobUrl;
            return null; // GIF 不需要缓存
        },

        getCardBadge: () => null
    },

    // SVG 策略
    svg: {
        types: FileTypes.image.svg,

        createThumbnailElement: () => {
            const object = document.createElement('object');
            object.className = 'thumbnail-svg';
            object.type = 'image/svg+xml';
            return object;
        },

        generateThumbnail: async (element, fileData) => {
            // 直接设置 data 属性加载 SVG
            element.data = fileData.blobUrl;

            // 等待加载完成
            return new Promise((resolve, reject) => {
                element.onload = () => resolve(null);
                element.onerror = () => reject(new Error('SVG 加载失败'));
            });
        },

        getCardBadge: () => null
    },

    // 视频策略
    video: {
        types: FileTypes.video.all,

        createThumbnailElement: () => {
            const canvas = document.createElement('canvas');
            canvas.className = 'thumbnail-canvas';
            return canvas;
        },

        // 绘制视频帧到canvas
        drawVideoFrame: (canvas, video, targetSize) => {
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');
            const ratio = Math.max(targetSize / video.videoWidth, targetSize / video.videoHeight);
            const centerShift_x = (targetSize - video.videoWidth * ratio) / 2;
            const centerShift_y = (targetSize - video.videoHeight * ratio) / 2;
            ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight,
                centerShift_x, centerShift_y, video.videoWidth * ratio, video.videoHeight * ratio);
        },

        // 绘制默认缩略图(带播放图标)
        drawDefaultThumbnail: (canvas, targetSize) => {
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, targetSize, targetSize);
            gradient.addColorStop(0, '#667eea');
            gradient.addColorStop(1, '#764ba2');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, targetSize, targetSize);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = `${targetSize * 0.4}px "Font Awesome 6 Free"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('▶', targetSize / 2, targetSize / 2);
        },

        generateThumbnail: async (element, fileData, targetSize) => {
            return new Promise((resolve) => {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;
                video.playsInline = true;

                let captured = false;
                let timeoutId = null;

                const cleanup = () => {
                    if (timeoutId) clearTimeout(timeoutId);
                    video.removeEventListener('loadedmetadata', onLoadedMetadata);
                    video.removeEventListener('seeked', onSeeked);
                    video.removeEventListener('error', onError);
                    video.src = '';
                };

                const finishWithDefault = () => {
                    cleanup();
                    ThumbnailStrategies.video.drawDefaultThumbnail(element, targetSize);
                    element.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
                };

                const onLoadedMetadata = () => {    // 载入后跳转
                    video.currentTime = 0.1;
                };

                const onSeeked = () => {            // 跳转后绘制
                    if (captured) return;
                    captured = true;
                    try {
                        ThumbnailStrategies.video.drawVideoFrame(element, video, targetSize);
                        element.toBlob(blob => {
                            cleanup();
                            resolve(blob);
                        }, 'image/jpeg', 0.85);
                    } catch (err) {
                        finishWithDefault();
                    }
                };

                const onError = () => finishWithDefault();

                video.addEventListener('loadedmetadata', onLoadedMetadata);
                video.addEventListener('seeked', onSeeked);
                video.addEventListener('error', onError);

                timeoutId = setTimeout(() => {
                    if (!captured) finishWithDefault();
                }, 10000);

                video.src = fileData.blobUrl;
            });
        },

        getCardBadge: () => ({
            icon: 'fa-play-circle',
            text: 'VIDEO',
            className: 'badge-video'
        })
    },

    // 音频策略
    audio: {
        types: FileTypes.audio.all,

        createThumbnailElement: () => {
            const canvas = document.createElement('canvas');
            canvas.className = 'thumbnail-canvas';
            return canvas;
        },

        generateThumbnail: async (element, fileData, targetSize) => {
            // 尝试从音频文件中提取封面
            try {
                const coverBlob = await extractAudioCover(fileData);
                if (coverBlob) {
                    const img = new Image();
                    img.src = URL.createObjectURL(coverBlob);
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                    });

                    const canvas = element;
                    canvas.width = targetSize;
                    canvas.height = targetSize;
                    const ctx = canvas.getContext('2d');
                    const ratio = Math.max(targetSize / img.width, targetSize / img.height);
                    const centerShift_x = (targetSize - img.width * ratio) / 2;
                    const centerShift_y = (targetSize - img.height * ratio) / 2;

                    ctx.drawImage(img, 0, 0, img.width, img.height,
                        centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);

                    URL.revokeObjectURL(img.src);

                    return new Promise(resolve => {
                        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
                    });
                }
            } catch (err) {
                console.log('无法提取音频封面:', err.message);
            }

            // 使用默认音频图标
            const canvas = element;
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');

            // 绘制渐变背景
            const gradient = ctx.createLinearGradient(0, 0, targetSize, targetSize);
            gradient.addColorStop(0, '#667eea');
            gradient.addColorStop(1, '#764ba2');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, targetSize, targetSize);

            // 绘制音乐图标
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = `${targetSize * 0.4}px "Font Awesome 6 Free"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🎵', targetSize / 2, targetSize / 2);

            return new Promise(resolve => {
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
            });
        },

        getCardBadge: () => ({
            icon: 'fa-music',
            text: 'AUDIO',
            className: 'badge-audio'
        })
    }
};

/**
 * 从音频文件中提取封面图片
 * @param {SmartFile} fileData - 文件数据
 * @returns {Promise<Blob|null>} 封面图片 Blob
 */
async function extractAudioCover(fileData) {
    try {
        const file = await fileData.handle.getFile();
        // 只读取前 5MB,避免内存问题
        const maxSize = Math.min(file.size, 5 * 1024 * 1024);
        const arrayBuffer = await file.slice(0, maxSize).arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // 检查 ID3v2 标签 (MP3)
        if (!(uint8Array[0] === 0x49 && uint8Array[1] === 0x44 && uint8Array[2] === 0x33)) {
            return null;
        }
        // ID3v2 标签存在
        const version = uint8Array[3];
        const flags = uint8Array[5];

        // 计算标签大小 (synchsafe integer)
        const tagSize = ((uint8Array[6] & 0x7f) << 21) |
            ((uint8Array[7] & 0x7f) << 14) |
            ((uint8Array[8] & 0x7f) << 7) |
            (uint8Array[9] & 0x7f);


        // 从第 10 字节开始解析帧
        let offset = 10;
        const tagEnd = 10 + tagSize;

        while (offset < tagEnd - 10) {
            // 读取帧 ID (4 字节)
            const frameId = String.fromCharCode(
                uint8Array[offset],
                uint8Array[offset + 1],
                uint8Array[offset + 2],
                uint8Array[offset + 3]
            );

            // 如果遇到填充，停止解析
            if (frameId === '\0\0\0\0') break;

            // 读取帧大小
            let frameSize;
            if (version === 4) {
                // ID3v2.4 使用 synchsafe integer
                frameSize = ((uint8Array[offset + 4] & 0x7f) << 21) |
                    ((uint8Array[offset + 5] & 0x7f) << 14) |
                    ((uint8Array[offset + 6] & 0x7f) << 7) |
                    (uint8Array[offset + 7] & 0x7f);
            } else {
                // ID3v2.3 使用普通整数
                frameSize = (uint8Array[offset + 4] << 24) |
                    (uint8Array[offset + 5] << 16) |
                    (uint8Array[offset + 6] << 8) |
                    uint8Array[offset + 7];
            }

            const frameFlags = (uint8Array[offset + 8] << 8) | uint8Array[offset + 9];

            // 查找图片帧 (APIC)
            if (frameId === 'APIC') {
                const frameDataOffset = offset + 10;
                let pos = frameDataOffset;

                // 跳过文本编码 (1 字节)
                const textEncoding = uint8Array[pos];
                pos++;

                // 读取 MIME 类型 (以 null 结尾)
                let mimeType = '';
                while (pos < frameDataOffset + frameSize && uint8Array[pos] !== 0) {
                    mimeType += String.fromCharCode(uint8Array[pos]);
                    pos++;
                }
                pos++; // 跳过 null 终止符

                // 跳过图片类型 (1 字节)
                const pictureType = uint8Array[pos];
                pos++;

                // 跳过描述 (以 null 结尾)
                while (pos < frameDataOffset + frameSize && uint8Array[pos] !== 0) {
                    pos++;
                }
                pos++; // 跳过 null 终止符

                // 剩余的就是图片数据
                const imageDataStart = pos;
                const imageDataEnd = frameDataOffset + frameSize;
                const imageData = uint8Array.slice(imageDataStart, imageDataEnd);

                // 创建 Blob 并返回
                const blob = new Blob([imageData], { type: mimeType || 'image/jpeg' });
                return blob;
            }

            // 移动到下一帧
            offset += 10 + frameSize;
        }


        return null;
    } catch (err) {
        return null;
    }
}

/**
 * 根据文件类型获取缩略图策略
 * @param {string} fileType - 文件类型(扩展名)
 * @returns {Object} 缩略图策略
 */
function getThumbnailStrategy(fileType) {
    for (const [strategyName, strategy] of Object.entries(ThumbnailStrategies)) {
        if (strategy.types.includes(fileType)) {
            return { name: strategyName, ...strategy };
        }
    }
    // 默认使用图片策略
    return { name: 'image', ...ThumbnailStrategies.image };
}
