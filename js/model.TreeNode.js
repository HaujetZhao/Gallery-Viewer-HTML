/**
 * TreeNode 全局注册表 - 跟踪所有活动的 TreeNode
 */
const treeNodeRegistry = {
    nodes: new Set(),
    activeNode: null,

    /**
     * 注册一个 TreeNode
     */
    register(node) {
        this.nodes.add(node);
    },

    /**
     * 注销一个 TreeNode
     */
    unregister(node) {
        this.nodes.delete(node);
        if (this.activeNode === node) {
            this.activeNode = null;
        }
    },

    /**
     * 设置激活节点（自动取消之前的激活状态）
     */
    setActive(node) {
        // 取消之前激活的节点
        if (this.activeNode && this.activeNode !== node) {
            this.activeNode.setInactive();
        }
        this.activeNode = node;
    }
};

/**
 * TreeNode 类 - 封装文件夹树节点的 DOM 操作
 */
class TreeNode {
    /**
     * @param {SmartFolder} folder - 关联的文件夹对象
     */
    constructor(folder) {
        this.folder = folder;
        this.li = null;  // li.tree-node 元素
        this.ul = null;  // ul.tree-sub-list 元素
        this.children = []; // 子 TreeNode 列表

        // 注册到全局注册表
        treeNodeRegistry.register(this);
    }

    /**
     * 创建根节点
     * @returns {TreeNode}
     */
    createRoot() {
        this.li = document.createElement('li');
        this.li.className = 'tree-node root-node active';
        this.li.id = 'tree-root-node';

        const count = this.folder.files ? this.folder.files.length : 0;
        this.li.innerHTML = `<i class="fas fa-folder-open"></i> ${this.folder.name} <span class="tree-node-count">(${count})</span>`;

        this.ul = document.createElement('ul');
        this.ul.className = 'tree-sub-list expanded';
        
        // 建立双向绑定
        domToFolderMap.set(this.li, this.folder);
        domToFolderMap.set(this.ul, this.folder);

        return this;
    }

    /**
     * 创建普通节点
     * @returns {TreeNode}
    */
    create() {
        const isEmpty = this.folder.files.length === 0 && this.folder.subFolders.length === 0;

        this.li = document.createElement('li');
        this.li.className = `tree-node ${isEmpty ? 'empty-folder' : ''}`;
        
        const count = this.folder.files.length;
        this.li.innerHTML = `<i class="fas fa-folder-open"></i> ${this.folder.name} <span class="tree-node-count">(${count})</span>`;

        this.ul = document.createElement('ul');
        this.ul.className = 'tree-sub-list expanded';

        // 建立双向绑定
        domToFolderMap.set(this.li, this.folder);
        domToFolderMap.set(this.ul, this.folder);

        return this;
    }
    
    /**
     * 创建特殊节点
     * @param {Object} options
     * @param {string} options.iconHTML - 图标 HTML
     * @param {string} options.text - 节点文本
     * @param {Function} options.onClick - 点击回调
     * @param {string} options.id - 可选的 ID
     * @returns {TreeNode}
     */
    createSpecial({ iconHTML, text, onClick, id }) {
        this.li = document.createElement('li');
        this.li.className = 'tree-node';
        if (id) this.li.id = id;
 
        this.li.innerHTML = `${iconHTML} ${text}`;
 
        if (onClick) {
            this.li.addEventListener('click', onClick);
        }
 
        // 建立双向绑定
        domToFolderMap.set(this.li, this.folder);
 
        return this;
    }

    /**
     * 添加子节点（按名称排序插入）
     * @param {TreeNode} childNode - 子节点对象
    */
   addChild(childNode) {
       if (!this.ul) {
           throw new Error('父节点的容器未创建');
        }
        if (!childNode.li || !childNode.ul) {
            try {
                childNode.create();
            } catch (e) {
                throw new Error('子节点未创建且无法自动创建');
            }
        }

        // 检查是否已存在（通过内部 children 列表）
        if (this.children.includes(childNode)) {
            return;
        }

        const parentUl = this.ul;

        // 记录到子节点列表
        this.children.push(childNode);

        // 按名称排序插入 DOM
        // 注意：这里我们查找的是 DOM 节点，但用 childNode.folder.name 进行比较
        // 我们可以优化为直接在 this.children 中查找插入位置，但为了保持 DOM 顺序通过 insertBefore 操作，
        // 还是遍历 DOM 比较稳妥，或者 maintain this.children sorted.
        // 咱们保持原有的 insertBefore 逻辑，但数据源检查用 this.children

        const existingNodes = Array.from(parentUl.querySelectorAll(':scope > li.tree-node'));
        let insertBeforeNode = null;

        for (const node of existingNodes) {
            const nodeData = domToFolderMap.get(node);
            const nodeName = nodeData ? nodeData.name : node.textContent.trim();

            if (windowsCompareStrings(childNode.folder.name, nodeName) < 0) {
                insertBeforeNode = node;
                break;
            }
        }

        if (insertBeforeNode) {
            parentUl.insertBefore(childNode.li, insertBeforeNode);
            parentUl.insertBefore(childNode.ul, insertBeforeNode);
        } else {
            parentUl.appendChild(childNode.li);
            parentUl.appendChild(childNode.ul);
        }
    }

    /**
     * 移除子节点
     * @param {TreeNode} childNode 
     */
    removeChild(childNode) {
        // 从 DOM 移除
        childNode.remove();

        // 从列表移除
        const index = this.children.indexOf(childNode);
        if (index > -1) {
            this.children.splice(index, 1);
        }
    }

    /**
     * 同步子节点（Diff 算法）
     * @param {Array<SmartFolder>} subFolders - 最新的子文件夹列表
     */
    async syncChildren(subFolders) {
        // 1. 找出需要移除的节点
        // 使用 Set 加速查找
        const newFolderNames = new Set(subFolders.map(f => f.name));

        // 复制一份数组进行遍历，因为 removeChild 会修改 this.children
        const currentChildren = [...this.children];

        for (const childNode of currentChildren) {
            if (!newFolderNames.has(childNode.folder.name)) {
                this.removeChild(childNode);
            }
        }

        // 2. 找出需要添加的节点
        const currentFolderNames = new Set(this.children.map(c => c.folder.name));

        for (const subFolder of subFolders) {
            if (!currentFolderNames.has(subFolder.name)) {
                // 这是新文件夹
                if (!subFolder.treeNode) {
                    console.error('Subfolder missing treeNode', subFolder);
                    continue;
                }

                // 确保已扫描（为了获取正确的文件计数）
                if (!subFolder.scanned) {
                    await subFolder.scan();
                }

                this.addChild(subFolder.treeNode);
            }
        }
    }


    /**
     * 追加到容器
     * @param {HTMLElement} container - 容器元素
     */
    appendTo(container) {
        if (!this.li) {
            throw new Error('TreeNode 未创建，请先调用 create(), createRoot() 或 createSpecial()');
        }

        container.appendChild(this.li);

        // ul 是可选的（特殊节点可能没有子列表）
        if (this.ul) {
            container.appendChild(this.ul);
        }
    }

    /**
     * 添加到UI（统一的添加方法）
     * 根据节点类型自动选择合适的容器
     * @returns {TreeNode}
     */
    addToUI() {
        if (!this.li) {
            throw new Error('TreeNode 未创建，请先调用 create(), createRoot() 或 createSpecial()');
        }

        // 根据节点类型选择容器
        let container;

        if (this.li.classList.contains('root-node')) {
            // 根节点添加到 treeRoot
            container = UI.treeRoot;
        } else if (this.folder.isVirtual) {
            // 虚拟节点添加到 virtualContainer
            container = document.querySelector('#virtualContainer ul');
        } else if (this.folder.parent && this.folder.parent.treeNode) {
            // 普通节点添加到父节点的容器
            container = this.folder.parent.treeNode.getChildContainer();
        } else {
            throw new Error('无法确定节点的容器');
        }

        if (!container) {
            throw new Error('容器不存在');
        }

        this.appendTo(container);
        return this;
    }

    /**
     * 更新文件计数显示
     */
    updateCount() {
        if (!this.li) return;

        const countSpan = this.li.querySelector('.tree-node-count');
        if (countSpan) {
            const count = this.folder.files.length;
            countSpan.textContent = `(${count})`;
        }
    }

    /**
     * 更新图标状态（是否为空）
     */
    updateIconState() {
        if (!this.li) return;

        const isEmpty = this.folder.files.length === 0 && this.folder.subFolders.length === 0;

        if (isEmpty) {
            this.li.classList.add('empty-folder');
        } else {
            this.li.classList.remove('empty-folder');
        }
    }

    /**
     * 设置为激活状态
     */
    setActive() {
        if (!this.li) return;

        // 先移除所有激活状态
        document.querySelectorAll('.tree-node').forEach(node => {
            node.classList.remove('active');
        });

        // 设置当前节点为激活
        this.li.classList.add('active');
    }

    /**
     * 切换展开/折叠状态
     */
    toggleExpanded() {
        if (!this.li || !this.ul) return;

        const icon = this.li.querySelector('i');
        const isExpanded = this.ul.classList.contains('expanded');

        if (isExpanded) {
            this.ul.classList.remove('expanded');
            icon.classList.remove('fa-folder-open');
            icon.classList.add('fa-folder');
        } else {
            this.ul.classList.add('expanded');
            icon.classList.remove('fa-folder');
            icon.classList.add('fa-folder-open');
        }
    }

    /**
     * 移除 DOM 节点
     */
    remove() {
        if (this.ul) {
            this.ul.remove();
            this.ul = null;
        }
        if (this.li) {
            this.li.remove();
            this.li = null;
        }
        // 清空子节点引用，但不递归调用 remove，因为 DOM 已经被移除了
        this.children = [];

        // 从全局注册表注销
        treeNodeRegistry.unregister(this);
    }

    /**
     * 获取子节点列表容器
     * @returns {HTMLElement|null}
     */
    getChildContainer() {
        return this.ul;
    }

    /**
     * 判断是否已创建
     * @returns {boolean}
     */
    isCreated() {
        return this.li !== null && this.ul !== null;
    }

    /**
     * 设置激活状态（选中状态）
     */
    setActive() {
        // 通过注册表设置激活（自动取消之前的激活状态）
        treeNodeRegistry.setActive(this);

        if (this.li) {
            this.li.classList.add('active');
        }
    }

    /**
     * 取消激活状态
     */
    setInactive() {
        if (this.li) {
            this.li.classList.remove('active');
        }
    }

    /**
     * 设置右键菜单激活状态
     */
    setContextActive() {
        if (this.li) {
            this.li.classList.add('context-menu-active');
        }
    }

    /**
     * 取消右键菜单激活状态
     */
    setContextInactive() {
        if (this.li) {
            this.li.classList.remove('context-menu-active');
        }
    }

    /**
     * 设置拖拽悬停状态
     */
    setDragOver() {
        if (this.li) {
            this.li.classList.add('drag-over');
        }
    }

    /**
     * 取消拖拽悬停状态
     */
    setDragLeave() {
        if (this.li) {
            this.li.classList.remove('drag-over');
        }
    }
}

