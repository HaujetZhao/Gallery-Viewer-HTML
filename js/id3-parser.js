/**
 * ID3 标签解析工具
 * 用于从 MP3 文件中提取元数据(歌手、专辑、标题等)
 */

/**
 * 从 MP3 文件中提取 ID3 标签信息
 * @param {SmartFile} fileData - 文件数据对象
 * @returns {Promise<Object>} ID3 标签信息
 */
async function extractID3Tags(fileData) {
    try {
        const file = await fileData.handle.getFile();
        // 读取文件的前 5MB 用于解析 ID3 标签
        const maxSize = Math.min(file.size, 5 * 1024 * 1024);
        const arrayBuffer = await file.slice(0, maxSize).arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // 检查 ID3v2 标签头
        if (!(uint8Array[0] === 0x49 && uint8Array[1] === 0x44 && uint8Array[2] === 0x33)) {
            console.log('未找到 ID3v2 标签');
            return null;
        }

        const version = uint8Array[3];
        const revision = uint8Array[4];
        const flags = uint8Array[5];

        console.log(`ID3v2.${version}.${revision} 标签`);

        // 计算标签大小 (synchsafe integer)
        const tagSize = ((uint8Array[6] & 0x7f) << 21) |
            ((uint8Array[7] & 0x7f) << 14) |
            ((uint8Array[8] & 0x7f) << 7) |
            (uint8Array[9] & 0x7f);

        const tags = {};
        let offset = 10;
        const tagEnd = 10 + tagSize;

        // 解析所有帧
        while (offset < tagEnd - 10) {
            // 读取帧 ID (4 字节)
            const frameId = String.fromCharCode(
                uint8Array[offset],
                uint8Array[offset + 1],
                uint8Array[offset + 2],
                uint8Array[offset + 3]
            );

            // 如果遇到填充,停止解析
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
            const frameDataOffset = offset + 10;

            // 解析常见的文本帧
            const textFrames = {
                'TIT2': 'title',      // 标题
                'TPE1': 'artist',     // 艺术家/歌手
                'TALB': 'album',      // 专辑
                'TYER': 'year',       // 年份
                'TCON': 'genre',      // 流派
                'TPE2': 'albumArtist', // 专辑艺术家
                'TCOM': 'composer',   // 作曲家
                'TRCK': 'track',      // 音轨号
                'TPOS': 'disc',       // 碟片号
                'COMM': 'comment'     // 注释
            };

            if (textFrames[frameId]) {
                const text = decodeTextFrame(uint8Array, frameDataOffset, frameSize);
                if (text) {
                    tags[textFrames[frameId]] = text;
                }
            }

            // 移动到下一帧
            offset += 10 + frameSize;
        }

        return tags;
    } catch (err) {
        console.error('解析 ID3 标签失败:', err);
        return null;
    }
}

/**
 * 解码文本帧
 * @param {Uint8Array} data - 数据数组
 * @param {number} offset - 起始偏移
 * @param {number} size - 帧大小
 * @returns {string} 解码后的文本
 */
function decodeTextFrame(data, offset, size) {
    if (size <= 1) return '';

    const encoding = data[offset];
    let text = '';
    let pos = offset + 1;
    const end = offset + size;

    try {
        switch (encoding) {
            case 0: // ISO-8859-1
                for (let i = pos; i < end && data[i] !== 0; i++) {
                    text += String.fromCharCode(data[i]);
                }
                break;

            case 1: // UTF-16 with BOM
                // 检查 BOM
                if (pos + 1 < end) {
                    const bom = (data[pos] << 8) | data[pos + 1];
                    const littleEndian = bom === 0xFFFE;
                    pos += 2;

                    const chars = [];
                    for (let i = pos; i < end - 1; i += 2) {
                        if (data[i] === 0 && data[i + 1] === 0) break;
                        const charCode = littleEndian
                            ? (data[i + 1] << 8) | data[i]
                            : (data[i] << 8) | data[i + 1];
                        chars.push(charCode);
                    }
                    text = String.fromCharCode(...chars);
                }
                break;

            case 2: // UTF-16BE without BOM
                for (let i = pos; i < end - 1; i += 2) {
                    if (data[i] === 0 && data[i + 1] === 0) break;
                    const charCode = (data[i] << 8) | data[i + 1];
                    text += String.fromCharCode(charCode);
                }
                break;

            case 3: // UTF-8
                const bytes = [];
                for (let i = pos; i < end && data[i] !== 0; i++) {
                    bytes.push(data[i]);
                }
                text = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
                break;

            default:
                console.warn('未知的文本编码:', encoding);
        }
    } catch (err) {
        console.error('解码文本失败:', err);
    }

    return text.trim();
}

/**
 * 格式化 ID3 标签信息为可读格式
 * @param {Object} tags - ID3 标签对象
 * @returns {Object} 格式化后的信息
 */
function formatID3Tags(tags) {
    if (!tags) return null;

    const formatted = {};

    if (tags.title) formatted['标题'] = tags.title;
    if (tags.artist) formatted['艺术家'] = tags.artist;
    if (tags.album) formatted['专辑'] = tags.album;
    if (tags.albumArtist) formatted['专辑艺术家'] = tags.albumArtist;
    if (tags.year) formatted['年份'] = tags.year;
    if (tags.genre) formatted['流派'] = tags.genre;
    if (tags.track) formatted['音轨'] = tags.track;
    if (tags.disc) formatted['碟片'] = tags.disc;
    if (tags.composer) formatted['作曲家'] = tags.composer;
    if (tags.comment) formatted['注释'] = tags.comment;

    return Object.keys(formatted).length > 0 ? formatted : null;
}
