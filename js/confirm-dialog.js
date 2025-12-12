/**
 * 自定义确认对话框
 * 用于文件夹删除的双重确认
 */

class ConfirmDialog {
    constructor() {
        this.dialog = null;
        this.currentStep = 0;
        this.totalSteps = 2;
        this.resolve = null;
        this.createDialog();
    }

    createDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog-overlay hidden';
        dialog.innerHTML = `
            <div class="confirm-dialog">
                <div class="confirm-dialog-header">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3 class="confirm-dialog-title">确认删除</h3>
                </div>
                <div class="confirm-dialog-body">
                    <p class="confirm-dialog-message"></p>
                    <div class="confirm-dialog-progress">
                        <div class="progress-step" data-step="1">
                            <div class="step-circle">1</div>
                            <div class="step-label">第一步确认</div>
                        </div>
                        <div class="progress-line"></div>
                        <div class="progress-step" data-step="2">
                            <div class="step-circle">2</div>
                            <div class="step-label">最终确认</div>
                        </div>
                    </div>
                </div>
                <div class="confirm-dialog-footer">
                    <button class="confirm-btn confirm-btn-next" data-action="next">
                        <i class="fas fa-arrow-right"></i>
                        <span>下一步</span>
                    </button>
                    <button class="confirm-btn confirm-btn-confirm hidden" data-action="confirm">
                        <i class="fas fa-trash-alt"></i>
                        <span>确认删除</span>
                    </button>
                    <button class="confirm-btn confirm-btn-cancel" data-action="cancel">
                        <i class="fas fa-times"></i>
                        <span>取消</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
        this.dialog = dialog;

        // 绑定事件
        this.bindEvents();
    }

    bindEvents() {
        const nextBtn = this.dialog.querySelector('[data-action="next"]');
        const confirmBtn = this.dialog.querySelector('[data-action="confirm"]');
        const cancelBtn = this.dialog.querySelector('[data-action="cancel"]');

        nextBtn.addEventListener('click', () => this.handleNext());
        confirmBtn.addEventListener('click', () => this.handleConfirm());
        cancelBtn.addEventListener('click', () => this.handleCancel());

        // 点击背景关闭
        this.dialog.addEventListener('click', (e) => {
            if (e.target === this.dialog) {
                this.handleCancel();
            }
        });

        // ESC 键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.dialog.classList.contains('hidden')) {
                this.handleCancel();
            }
        });
    }

    handleNext() {
        this.currentStep = 1;
        this.updateUI();
    }

    handleConfirm() {
        if (this.resolve) {
            this.resolve(true);
        }
        this.hide();
    }

    handleCancel() {
        if (this.resolve) {
            this.resolve(false);
        }
        this.hide();
    }

    updateUI() {
        const nextBtn = this.dialog.querySelector('[data-action="next"]');
        const confirmBtn = this.dialog.querySelector('[data-action="confirm"]');
        const steps = this.dialog.querySelectorAll('.progress-step');
        const message = this.dialog.querySelector('.confirm-dialog-message');

        if (this.currentStep === 0) {
            // 第一步
            nextBtn.classList.remove('hidden');
            confirmBtn.classList.add('hidden');
            steps[0].classList.add('active');
            steps[1].classList.remove('active');
        } else {
            // 第二步
            nextBtn.classList.add('hidden');
            confirmBtn.classList.remove('hidden');
            steps[0].classList.add('completed');
            steps[0].classList.remove('active');
            steps[1].classList.add('active');
            message.innerHTML = `
                <strong style="color: #e74c3c;">🔴 最后确认</strong><br><br>
                真的要删除此文件夹吗?<br>
                <span style="color: #e67e22;">此操作无法撤销!</span>
            `;
        }
    }

    /**
     * 显示确认对话框
     * @param {string} folderName - 文件夹名称
     * @param {boolean} hasContent - 是否包含内容
     * @returns {Promise<boolean>} 用户是否确认
     */
    show(folderName, hasContent = false) {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.currentStep = 0;

            const message = this.dialog.querySelector('.confirm-dialog-message');
            message.innerHTML = `
                <strong>即将删除文件夹:</strong><br>
                <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; color: #2c3e50;">${folderName}</code><br><br>
                ${hasContent ? '<span style="color: #e67e22;">⚠️ 此文件夹不为空!</span><br>' : ''}
                <span style="color: #7f8c8d;">删除操作复杂且无法撤销</span><br><br>
                <strong>请按顺序点击按钮确认</strong>
            `;

            this.updateUI();
            this.dialog.classList.remove('hidden');

            // 添加动画
            setTimeout(() => {
                this.dialog.querySelector('.confirm-dialog').classList.add('show');
            }, 10);
        });
    }

    hide() {
        const dialogBox = this.dialog.querySelector('.confirm-dialog');
        dialogBox.classList.remove('show');

        setTimeout(() => {
            this.dialog.classList.add('hidden');
            this.currentStep = 0;
            this.resolve = null;
        }, 300);
    }
}

// 创建全局实例
const confirmDialog = new ConfirmDialog();
