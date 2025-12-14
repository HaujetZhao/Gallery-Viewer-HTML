
async function init() {
    try {
        await initDB();
    } catch (e) {
        console.error("DB Error", e);
    }

    setupEventListeners();
    setupSidebarEvents();
    setupIntersectionObserver();
    setupScrollZone();
    setupCSSBasedResizer();
    initContextMenus();

    const pinned = localStorage.getItem('sidebarPinned') === 'true';
    if (pinned) toggleSidebarPin(true);

    // 检查浏览器兼容性
    checkBrowserCompatibility();
}

// Global invocation
document.addEventListener('DOMContentLoaded', init);
