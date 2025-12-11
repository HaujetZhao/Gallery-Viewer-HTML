// 移除 imports

async function init() {
    try {
        await initDB();
    } catch (e) {
        console.error("DB Error", e);
    }

    setupEventListeners();
    setupSidebarEvents(); // New delegation setup
    setupIntersectionObserver();
    setupScrollZone();
    setupCSSBasedResizer();

    const pinned = localStorage.getItem('sidebarPinned') === 'true';
    if (pinned) toggleSidebarPin(true);
}

// Global invocation
document.addEventListener('DOMContentLoaded', init);
