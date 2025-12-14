
let scrollZoneEnabled = true;
let scrollZoneSpeed = 1.0;
let scrollZoneInterval = null;
let scrollZoneActive = false;
let scrollZoneDirection = 0;
let scrollZoneIntensity = 0;

let scrollZoneCache = {
    topRect: null,
    bottomRect: null,
    lastUpdate: 0
};

function setupScrollZone() {
    document.addEventListener('mousemove', handleScrollZoneMouseMove);
    document.addEventListener('mouseleave', handleScrollZoneMouseLeave);
    document.getElementById('scrollZoneLabel').addEventListener('click', toggleScrollZone);

    const scrollSpeedSlider = document.getElementById('scrollSpeedSlider');
    const scrollSpeedValue = document.getElementById('scrollSpeedValue');

    scrollSpeedSlider.addEventListener('input', () => {
        scrollZoneSpeed = parseFloat(scrollSpeedSlider.value);
        scrollSpeedValue.textContent = scrollZoneSpeed.toFixed(1);
    });

    updateScrollZoneToggle();

    window.addEventListener('resize', () => {
        scrollZoneCache.lastUpdate = 0;
    });
}

function toggleScrollZone() {
    scrollZoneEnabled = !scrollZoneEnabled;
    updateScrollZoneToggle();
}

function updateScrollZoneToggle() {
    const scrollZoneIcon = document.getElementById('scrollZoneIcon');
    const scrollZoneLabel = document.getElementById('scrollZoneLabel');

    if (scrollZoneEnabled) {
        scrollZoneIcon.className = 'fas fa-toggle-on';
        scrollZoneLabel.removeAttribute('inactive');
    } else {
        scrollZoneIcon.className = 'fas fa-toggle-off';
        scrollZoneLabel.setAttribute('inactive', '');
    }
}

function handleScrollZoneMouseMove(e) {
    if (!scrollZoneEnabled) return;
    if (isInExcludedZone(e.clientX, e.clientY)) {
        hideScrollZones();
        stopScrollZone();
        return;
    }

    const now = Date.now();
    if (now - scrollZoneCache.lastUpdate > 100) {
        const topZone = document.getElementById('topScrollZone');
        const bottomZone = document.getElementById('bottomScrollZone');
        if (topZone && bottomZone) {
            scrollZoneCache.topRect = topZone.getBoundingClientRect();
            scrollZoneCache.bottomRect = bottomZone.getBoundingClientRect();
            scrollZoneCache.lastUpdate = now;
        }
    }

    const { topRect, bottomRect } = scrollZoneCache;
    if (!topRect || !bottomRect) return;

    if (e.clientY >= topRect.top && e.clientY <= topRect.bottom) {
        const intensity = 1 - ((e.clientY - topRect.top) / topRect.height);
        showScrollZones();
        startScrollZone(-1, intensity);
    } else if (e.clientY >= bottomRect.top && e.clientY <= bottomRect.bottom) {
        const intensity = (e.clientY - bottomRect.top) / bottomRect.height;
        showScrollZones();
        startScrollZone(1, intensity);
    } else {
        if (scrollZoneActive) {
            hideScrollZones();
            stopScrollZone();
        }
    }
}

function startScrollZone(direction, intensity) {
    if (!scrollZoneEnabled) return;
    if (scrollZoneActive && scrollZoneDirection === direction) {
        scrollZoneIntensity = intensity;
        return;
    }
    stopScrollZone();
    scrollZoneActive = true;
    scrollZoneDirection = direction;
    scrollZoneIntensity = intensity;
    scrollZoneInterval = setInterval(() => {
        if (!scrollZoneActive) {
            clearInterval(scrollZoneInterval);
            scrollZoneInterval = null;
            return;
        }
        const scrollAmount = 5 * scrollZoneIntensity * scrollZoneSpeed * scrollZoneDirection;
        window.scrollBy({ top: scrollAmount, behavior: 'instant' });
    }, 16);
}

function stopScrollZone() {
    scrollZoneActive = false;
    scrollZoneIntensity = 0;
    if (scrollZoneInterval) {
        clearInterval(scrollZoneInterval);
        scrollZoneInterval = null;
    }
    scrollZoneDirection = 0;
}

function handleScrollZoneMouseLeave() {
    hideScrollZones();
    stopScrollZone();
}

function isInExcludedZone(x, y) {
    const excludedElements = [
        UI.sidebar,                                 // 侧边栏文件树
        UI.settingBar,                              // 设置面板
        document.getElementById('settingBtn'),      // 设置按钮
        UI.filterCount?.parentElement,              // 筛选计数器
        document.getElementById('toastContainer'),  // Toast 通知
        UI.modal                                    // Modal 弹窗
    ];
    for (const el of excludedElements) {
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return true;
        }
    }
    return false;
}

function showScrollZones() {
    document.getElementById('topScrollZone').classList.add('visible');
    document.getElementById('bottomScrollZone').classList.add('visible');
}

function hideScrollZones() {
    document.getElementById('topScrollZone').classList.remove('visible');
    document.getElementById('bottomScrollZone').classList.remove('visible');
}
