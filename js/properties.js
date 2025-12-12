
const EXIF_MAP = {
    'Make': '制造商', 'Model': '型号', 'LensModel': '镜头', 'Software': '后期软件',
    'ExposureTime': '曝光时间', 'FNumber': '光圈', 'ISOSpeedRatings': 'ISO',
    'FocalLength': '焦距', 'FocalLengthIn35mmFilm': '等效焦距',
    'ExposureBias': '曝光补偿', 'MeteringMode': '测光模式', 'Flash': '闪光灯',
    'WhiteBalance': '白平衡', 'DateTimeOriginal': '拍摄时间',
    'PixelXDimension': '宽', 'PixelYDimension': '高',
    'ResolutionUnit': '分辨率单位', 'Orientation': '方向', 'ColorSpace': '色彩空间',
    'GPSLatitude': '纬度', 'GPSLongitude': '经度', 'GPSAltitude': '海拔'
};

const EXIF_GROUPS = {
    'GPS位置信息': ['GPSLatitude', 'GPSLongitude', 'GPSAltitude'],
    '设备信息': ['Make', 'Model', 'LensModel', 'Software'],
    '拍摄参数': ['DateTimeOriginal', 'ExposureTime', 'FNumber', 'ISOSpeedRatings', 'FocalLength', 'FocalLengthIn35mmFilm', 'ExposureBias', 'MeteringMode', 'Flash', 'WhiteBalance'],
    '图像参数': ['PixelXDimension', 'PixelYDimension', 'ColorSpace', 'Orientation'],
};

function showImageProperties() {
    const menu = UI.contextMenu;

    // 直接从菜单获取 fileData（更可靠）
    const fileData = menu.fileData;
    if (!fileData) {
        console.warn("无法获取文件数据");
        return;
    }

    UI.contextMenu.classList.remove('show');
    const modal = document.getElementById('propertiesModal');
    if (!modal) return;

    const bodyContent = document.getElementById('propsBodyContent');
    bodyContent.innerHTML = '<div class="loader">正在分析文件信息...</div>';

    modal.classList.remove('hidden');

    // 获取文件类型对应的元数据策略
    const fileExt = fileData.name.split('.').pop().toLowerCase();
    const strategy = getMetadataStrategy(fileExt);

    (async () => {
        let metadata = null;

        try {
            metadata = await strategy.getMetadata(fileData);
        } catch (e) {
            console.error("获取元数据失败", e);
        }

        renderProperties(fileData, metadata, fileExt);
    })();
}

function renderProperties(fileData, metadata, fileExt) {
    const container = document.getElementById('propsBodyContent');
    container.innerHTML = '';

    const dim = metadata?.dimensions || {};
    const exifTags = metadata?.exif;

    // 1. 基本信息 (始终显示)
    const basicSection = document.createElement('div');
    basicSection.className = 'props-section';

    let dimensionText = '';
    if (dim.width && dim.height) {
        dimensionText = `${dim.width} x ${dim.height}`;
    } else if (dim.width === 0) {
        dimensionText = '未知';
    }

    let durationRow = '';
    if (dim.duration !== undefined) {
        durationRow = `<tr><td><i class="fas fa-play-circle"></i> 时长</td><td>${formatDuration(dim.duration)}</td></tr>`;
    }

    basicSection.innerHTML = `
        <h4>基本信息</h4>
        <table class="props-table">
            <tr>
                <td><i class="fas fa-file"></i> 文件名</td>
                <td class="editable-filename" style="cursor: pointer; color: #3498db;" title="点击编辑">${fileData.name}</td>
            </tr>
            <tr><td><i class="fas fa-folder-open"></i> 路径</td><td style="word-break: break-all;">${fileData.path || fileData.webkitRelativePath || fileData.name}</td></tr>
            ${dimensionText ? `<tr><td><i class="fas fa-expand"></i> 分辨率</td><td>${dimensionText}</td></tr>` : ''}
            ${durationRow}
            <tr><td><i class="fas fa-database"></i> 大小</td><td>${formatBytes(fileData.size)}</td></tr>
            <tr><td><i class="fas fa-clock"></i> 修改时间</td><td>${new Date(fileData.lastModified).toLocaleString()}</td></tr>
        </table>
    `;
    container.appendChild(basicSection);

    // 添加文件名编辑功能
    const filenameCell = basicSection.querySelector('.editable-filename');
    filenameCell.addEventListener('click', () => {
        enablePropertiesRename(filenameCell, fileData);
    });

    // 2. 视频/音频技术信息 (如果有)
    if (dim.estimatedBitrate || dim.videoTrack || dim.audioTrack) {
        const techSection = document.createElement('div');
        techSection.className = 'props-section';
        let techRows = '';

        if (dim.estimatedBitrate) {
            techRows += `<tr><td><i class="fas fa-tachometer-alt"></i> 估算比特率</td><td>${dim.estimatedBitrate} kbps</td></tr>`;
        }

        if (dim.videoTrack) {
            if (dim.videoTrack.label) {
                techRows += `<tr><td><i class="fas fa-video"></i> 视频轨道</td><td>${dim.videoTrack.label}</td></tr>`;
            }
        }

        if (dim.audioTrack) {
            if (dim.audioTrack.label) {
                techRows += `<tr><td><i class="fas fa-volume-up"></i> 音频轨道</td><td>${dim.audioTrack.label}</td></tr>`;
            }
        }

        if (techRows) {
            techSection.innerHTML = `
                <h4>技术信息</h4>
                <table class="props-table">
                    ${techRows}
                </table>
            `;
            container.appendChild(techSection);
        }
    }

    // 2.5 ID3 标签信息 (音频文件)
    if (metadata?.id3) {
        const id3Section = document.createElement('div');
        id3Section.className = 'props-section';

        const id3Tags = metadata.id3;
        let id3Rows = '';

        // 按优先级显示 ID3 信息
        const id3Fields = [
            { key: 'title', label: '标题', icon: 'fa-music' },
            { key: 'artist', label: '艺术家', icon: 'fa-user' },
            { key: 'album', label: '专辑', icon: 'fa-compact-disc' },
            { key: 'albumArtist', label: '专辑艺术家', icon: 'fa-users' },
            { key: 'year', label: '年份', icon: 'fa-calendar' },
            { key: 'genre', label: '流派', icon: 'fa-guitar' },
            { key: 'track', label: '音轨', icon: 'fa-list-ol' },
            { key: 'disc', label: '碟片', icon: 'fa-record-vinyl' },
            { key: 'composer', label: '作曲家', icon: 'fa-pen-fancy' },
            { key: 'comment', label: '注释', icon: 'fa-comment' }
        ];

        id3Fields.forEach(field => {
            if (id3Tags[field.key]) {
                id3Rows += `<tr><td><i class="fas ${field.icon}"></i> ${field.label}</td><td>${id3Tags[field.key]}</td></tr>`;
            }
        });

        if (id3Rows) {
            id3Section.innerHTML = `
                <h4><i class="fas fa-tags"></i> 音乐信息</h4>
                <table class="props-table">
                    ${id3Rows}
                </table>
            `;
            container.appendChild(id3Section);
        }
    }

    // 计算 GPS (仅图片)
    let gpsHTML = null;
    let latDec = NaN, lonDec = NaN;
    if (exifTags && exifTags.GPSLatitude && exifTags.GPSLongitude) {
        const lat = exifTags.GPSLatitude;
        const lon = exifTags.GPSLongitude;
        const latRef = exifTags.GPSLatitudeRef || "N";
        const lonRef = exifTags.GPSLongitudeRef || "E";
        latDec = convertDMSToDD(lat, latRef);
        lonDec = convertDMSToDD(lon, lonRef);

        if (!isNaN(latDec) && !isNaN(lonDec)) {
            // 坐标转换
            const [gcjLon, gcjLat] = wgs84ToGcj02(lonDec, latDec);
            const [bdLon, bdLat] = gcj02ToBd09(gcjLon, gcjLat);

            gpsHTML = `
                <div class="map-actions">
                    <div class="map-buttons">
                        <a href="https://www.google.com/maps?q=${latDec},${lonDec}" target="_blank" class="map-btn google" title="Google Maps (WGS84)">
                            <i class="fab fa-google"></i> 谷歌
                        </a>
                        <a href="https://uri.amap.com/marker?position=${gcjLon},${gcjLat}&name=图片位置" target="_blank" class="map-btn gaode" title="高德地图 (GCJ-02)">
                            <i class="fas fa-map-marked-alt"></i> 高德
                        </a>
                        <a href="http://api.map.baidu.com/marker?location=${bdLat},${bdLon}&output=html" target="_blank" class="map-btn baidu" title="百度地图 (BD-09)">
                            <i class="fas fa-paw"></i> 百度
                        </a>
                    </div>
                    <span class="gps-coords-text">WGS84: ${latDec.toFixed(6)}, ${lonDec.toFixed(6)}</span>
                </div>
            `;
        }
    }

    // 2. 地理位置 (如果有)
    if (gpsHTML) {
        const mapSection = document.createElement('div');
        mapSection.className = 'props-section';
        mapSection.innerHTML = `<h4>地理位置</h4>${gpsHTML}`;
        container.appendChild(mapSection);
    }

    // 3. EXIF 信息 (仅图片,如果有)
    if (exifTags && Object.keys(exifTags).length > 0) {
        const exifSection = document.createElement('div');
        exifSection.className = 'props-section';
        exifSection.innerHTML = `<h4>EXIF 信息</h4>`;

        const gridContainer = document.createElement('div');
        gridContainer.id = 'propExifContent';

        // 分组渲染
        const groupsFragment = document.createDocumentFragment();
        const usedKeys = new Set();
        const ignoreKeys = ['MakerNote', 'UserComment', 'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSVersionID', 'thumbnail', 'ExifIFDPointer', 'GPSInfoIFDPointer', 'InteroperabilityIFDPointer', 'undefined'];

        // 预定义分组
        for (const [groupName, keys] of Object.entries(EXIF_GROUPS)) {
            let groupItems = [];
            keys.forEach(key => {
                if (exifTags[key] !== undefined) {
                    usedKeys.add(key);
                    let val = exifTags[key];

                    // 格式化处理
                    if (key === 'ExposureTime' && val < 1 && val > 0) val = `1/${Math.round(1 / val)}`;
                    if (key === 'FocalLength' || key === 'FocalLengthIn35mmFilm') val += ' mm';

                    // GPS 特殊格式化
                    if (key === 'GPSLatitude') val = FormatDMS(val) + (exifTags.GPSLatitudeRef ? ' ' + exifTags.GPSLatitudeRef : '');
                    if (key === 'GPSLongitude') val = FormatDMS(val) + (exifTags.GPSLongitudeRef ? ' ' + exifTags.GPSLongitudeRef : '');
                    if (key === 'GPSAltitude') val = val + ' m';

                    groupItems.push({ k: EXIF_MAP[key] || key, v: val });
                }
            });

            if (groupItems.length > 0) {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'exif-group';
                groupDiv.innerHTML = `<h5 class="exif-group-title">${groupName}</h5>`;
                const subGrid = document.createElement('div');
                subGrid.className = 'exif-sub-grid';
                groupItems.forEach(item => {
                    subGrid.innerHTML += `
                        <div class="exif-item">
                            <span class="exif-label">${item.k}</span>
                            <div class="exif-value">${item.v}</div>
                        </div>`;
                });
                groupDiv.appendChild(subGrid);
                groupsFragment.appendChild(groupDiv);
            }
        }

        // 其他 EXIF
        const otherItems = [];
        for (let key in exifTags) {
            if (usedKeys.has(key) || ignoreKeys.includes(key)) continue;
            const val = exifTags[key];
            if (typeof val === 'object' || typeof val === 'function') continue;
            otherItems.push({ k: EXIF_MAP[key] || key, v: val });
        }

        if (otherItems.length > 0) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'exif-group';
            groupDiv.innerHTML = `<h5 class="exif-group-title">其他参数</h5>`;
            const subGrid = document.createElement('div');
            subGrid.className = 'exif-sub-grid';
            otherItems.forEach(item => {
                subGrid.innerHTML += `
                     <div class="exif-item">
                         <span class="exif-label">${item.k}</span>
                         <div class="exif-value">${item.v}</div>
                     </div>`;
            });
            groupDiv.appendChild(subGrid);
            groupsFragment.appendChild(groupDiv);
        }

        if (groupsFragment.childElementCount > 0) {
            gridContainer.appendChild(groupsFragment);
            exifSection.appendChild(gridContainer);
            container.appendChild(exifSection);
        }
    }
}

function FormatDMS(dms) {
    if (!dms) return '';
    return `${dms[0]}° ${dms[1]}' ${dms[2]}"`
}

function convertDMSToDD(dms, ref) {
    let dd = dms[0] + dms[1] / 60 + dms[2] / 3600;
    if (ref === "S" || ref === "W") dd = dd * -1;
    return dd;
}

// ----------------------------------------------------
// 坐标转换算法
// ----------------------------------------------------
function wgs84ToGcj02(lon, lat) {
    if (outOfChina(lon, lat)) return [lon, lat];
    let dLat = transformLat(lon - 105.0, lat - 35.0);
    let dLon = transformLon(lon - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - 0.00669342162296594323 * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((6378245.0 * (1 - 0.00669342162296594323)) / (magic * sqrtMagic) * Math.PI);
    dLon = (dLon * 180.0) / (6378245.0 / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lon + dLon, lat + dLat];
}

function gcj02ToBd09(lon, lat) {
    const x_pi = 3.14159265358979324 * 3000.0 / 180.0;
    const z = Math.sqrt(lon * lon + lat * lat) + 0.00002 * Math.sin(lat * x_pi);
    const theta = Math.atan2(lat, lon) + 0.000003 * Math.cos(lon * x_pi);
    const bdLon = z * Math.cos(theta) + 0.0065;
    const bdLat = z * Math.sin(theta) + 0.006;
    return [bdLon, bdLat];
}

function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLon(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
}

function outOfChina(lon, lat) {
    return !(lon > 73.66 && lon < 135.05 && lat > 3.86 && lat < 53.55);
}

function enablePropertiesRename(cell, fileData) {
    const oldName = fileData.name;
    const originalText = cell.textContent;

    const input = document.createElement('textarea');
    input.value = oldName;
    input.className = 'renaming-input';
    input.rows = 1;
    input.style.width = '100%';
    input.style.minWidth = '200px';

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();

    // 选中文件名部分（不含扩展名）
    const dotIndex = oldName.lastIndexOf('.');
    if (dotIndex > 0) {
        input.setSelectionRange(0, dotIndex);
    } else {
        input.select();
    }

    // 自动调整高度
    const autoResize = () => {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
    };
    input.addEventListener('input', autoResize);
    autoResize();

    const commit = async () => {
        const newName = input.value.trim().replace(/\n/g, '');
        if (!newName || newName === oldName) {
            cleanup();
            return;
        }
        if (/[<>:"/\\|?*]/.test(newName)) {
            showToast("文件名包含非法字符", "error");
            input.focus();
            return;
        }
        try {
            // 使用 SmartFile 的 rename 方法（会自动更新 name 和 path）
            await fileData.rename(newName);

            // 更新卡片显示
            if (fileData.dom) {
                const cardNameEl = fileData.dom.querySelector('.file-name');
                if (cardNameEl) cardNameEl.textContent = newName;
            }

            cell.textContent = newName;
            showToast("重命名成功");
        } catch (e) {
            showToast("重命名失败: " + e.message, "error");
            cell.textContent = originalText;
        }
    };

    const cleanup = () => {
        cell.textContent = fileData.name;
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cleanup();
        }
        e.stopPropagation();
    });
    input.addEventListener('blur', commit);
}
