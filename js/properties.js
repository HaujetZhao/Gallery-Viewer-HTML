// 移除 imports

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
    const idx = parseInt(menu.dataset.displayIndex);
    if (isNaN(idx)) return;

    const fileData = globals.currentDisplayList[idx];
    if (!fileData) return;

    UI.contextMenu.classList.remove('show');
    const modal = document.getElementById('propertiesModal');
    if (!modal) return;

    const bodyContent = document.getElementById('propsBodyContent');
    bodyContent.innerHTML = '<div class="loader">正在分析图片信息...</div>';

    modal.classList.remove('hidden');

    // 预加载图片获取尺寸 (如果没读过)
    const imgLoader = new Promise(resolve => {
        const img = new Image();
        img.src = fileData.blobUrl;
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 0, h: 0 });
    });

    (async () => {
        const dim = await imgLoader;
        let exifTags = null;

        // 读取 EXIF
        try {
            let fileObj = null;
            if (fileData.handle) fileObj = await fileData.handle.getFile();
            else fileObj = fileData.file;

            if (window.extractExif) {
                exifTags = await window.extractExif(fileObj);
            }
        } catch (e) {
            console.error("读取EXIF失败", e);
        }

        renderProperties(fileData, dim, exifTags);
    })();
}

function renderProperties(fileData, dim, tags) {
    const container = document.getElementById('propsBodyContent');
    container.innerHTML = '';

    // 1. 基本信息 (始终显示)
    const basicSection = document.createElement('div');
    basicSection.className = 'props-section';
    basicSection.innerHTML = `
        <h4>基本信息</h4>
        <table class="props-table">
            <tr><td>文件名</td><td>${fileData.name}</td></tr>
            <tr><td>路径</td><td style="word-break: break-all;">${fileData.path || fileData.webkitRelativePath || fileData.name}</td></tr>
            <tr><td>分辨率</td><td>${dim.w > 0 ? `${dim.w} x ${dim.h}` : '未知'}</td></tr>
            <tr><td>大小</td><td>${formatBytes(fileData.size)}</td></tr>
            <tr><td>修改时间</td><td>${new Date(fileData.lastModified).toLocaleString()}</td></tr>
        </table>
    `;
    container.appendChild(basicSection);

    // 计算 GPS
    let gpsHTML = null;
    let latDec = NaN, lonDec = NaN;
    if (tags && tags.GPSLatitude && tags.GPSLongitude) {
        const lat = tags.GPSLatitude;
        const lon = tags.GPSLongitude;
        const latRef = tags.GPSLatitudeRef || "N";
        const lonRef = tags.GPSLongitudeRef || "E";
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

    // 3. EXIF 信息 (如果有)
    if (tags && Object.keys(tags).length > 0) {
        const exifSection = document.createElement('div');
        exifSection.className = 'props-section';
        exifSection.innerHTML = `<h4>EXIF 信息</h4>`;

        const gridContainer = document.createElement('div');
        gridContainer.id = 'propExifContent'; // Keep ID for potential future use or styling

        // 分组渲染
        const groupsFragment = document.createDocumentFragment();
        const usedKeys = new Set();
        const ignoreKeys = ['MakerNote', 'UserComment', 'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSVersionID', 'thumbnail', 'ExifIFDPointer', 'GPSInfoIFDPointer', 'InteroperabilityIFDPointer', 'undefined'];

        // 预定义分组
        for (const [groupName, keys] of Object.entries(EXIF_GROUPS)) {
            let groupItems = [];
            keys.forEach(key => {
                if (tags[key] !== undefined) {
                    usedKeys.add(key);
                    let val = tags[key];

                    // 格式化处理
                    if (key === 'ExposureTime' && val < 1 && val > 0) val = `1/${Math.round(1 / val)}`;
                    if (key === 'FocalLength' || key === 'FocalLengthIn35mmFilm') val += ' mm';

                    // GPS 特殊格式化
                    if (key === 'GPSLatitude') val = FormatDMS(val) + (tags.GPSLatitudeRef ? ' ' + tags.GPSLatitudeRef : '');
                    if (key === 'GPSLongitude') val = FormatDMS(val) + (tags.GPSLongitudeRef ? ' ' + tags.GPSLongitudeRef : '');
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
        for (let key in tags) {
            if (usedKeys.has(key) || ignoreKeys.includes(key)) continue;
            const val = tags[key];
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
