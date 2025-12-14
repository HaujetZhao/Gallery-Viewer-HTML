/**
 * 浏览器兼容性检测模块
 * 用于检测 File System Access API 的支持情况
 */

/**
 * 检测浏览器名称
 * @returns {string} 浏览器名称
 */
function getBrowserName() {
    const userAgent = navigator.userAgent;
    if (userAgent.indexOf('Firefox') > -1) {
        return 'Firefox';
    } else if (userAgent.indexOf('Edg') > -1) {
        return 'Microsoft Edge';
    } else if (userAgent.indexOf('Chrome') > -1) {
        return 'Chrome';
    } else if (userAgent.indexOf('Safari') > -1) {
        return 'Safari';
    } else if (userAgent.indexOf('Opera') > -1 || userAgent.indexOf('OPR') > -1) {
        return 'Opera';
    }
    return '未知浏览器';
}

/**
 * 检查是否支持 File System Access API
 * @returns {boolean} 是否支持
 */
function isFileSystemAccessSupported() {
    return typeof window.showDirectoryPicker === 'function';
}

/**
 * 检查浏览器兼容性并在界面上显示警告(如果不兼容)
 */
function checkBrowserCompatibility() {
    if (!isFileSystemAccessSupported()) {
        const hint = document.getElementById('hint');
        if (hint) {
            // 在提示界面添加警告信息
            const warning = document.createElement('div');
            warning.style.cssText = `
                margin-top: 20px;
                padding: 15px 20px;
                background: #fff3cd;
                border: 2px solid #ffc107;
                border-radius: 8px;
                color: #856404;
                max-width: 500px;
                text-align: left;
            `;
            warning.innerHTML = `
                <strong style="display: block; margin-bottom: 8px;">⚠️ 浏览器不兼容</strong>
                <p style="margin: 5px 0; font-size: 14px;">您当前使用的浏览器不支持文件系统访问 API。</p>
                <p style="margin: 5px 0; font-size: 14px;">请使用以下浏览器之一:</p>
                <ul style="margin: 5px 0; padding-left: 20px; font-size: 14px;">
                    <li>Google Chrome</li>
                    <li>Microsoft Edge</li>
                    <li>Opera</li>
                </ul>
                <p style="margin: 5px 0; font-size: 13px; font-style: italic;">Firefox 目前尚不支持此功能。</p>
            `;

            const introContent = hint.querySelector('.intro-content');
            if (introContent) {
                introContent.appendChild(warning);
            }
        }
    }
}

/**
 * 显示不兼容的错误提示对话框
 */
function showIncompatibilityAlert() {
    const browserName = getBrowserName();
    const message = `抱歉,您的浏览器 (${browserName}) 不支持文件系统访问 API。\n\n` +
        `此应用需要完整的文件读写权限才能正常工作。\n\n` +
        `请使用以下浏览器之一:\n` +
        `• Google Chrome\n` +
        `• Microsoft Edge\n` +
        `• Opera\n\n` +
        `Firefox 目前尚不支持此功能。`;

    alert(message);
    console.error('File System Access API 不可用');
}
