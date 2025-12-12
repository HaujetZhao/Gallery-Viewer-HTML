
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
}

// Global invocation
document.addEventListener('DOMContentLoaded', init);
