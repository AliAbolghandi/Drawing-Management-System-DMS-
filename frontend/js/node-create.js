// ======================================================
// Create New Node UI
// ======================================================

const createNodeBtn = document.getElementById('createNewNodeBtn');
const createNodeModal = document.getElementById('createNodeModal');
const createNodeForm = document.getElementById('createNodeForm');
const createNodeParent = document.getElementById('createNodeParent');
const createNodeCode = document.getElementById('createNodeCode');
const createNodeName = document.getElementById('createNodeName');
const createNodeError = document.getElementById('createNodeError');
const createNodeCancel = document.getElementById('createNodeCancel');
const createNodeClose = document.getElementById('createNodeClose');
const createNodeSubmit = document.getElementById('createNodeSubmit');
const treeContainerForCreate = document.getElementById('treeContainer');

let createNodeMode = false;

function closeCreateNodeModal() {
    createNodeModal.classList.add('hidden');
    createNodeError.classList.add('hidden');
    createNodeForm.reset();
    delete createNodeForm.dataset.parentId;
}

function openCreateNodeModal(parentNode) {
    createNodeParent.textContent = `${parentNode.NodeCode || '-'} — ${parentNode.NodeName || '(Unnamed)'}`;
    createNodeForm.dataset.parentId = String(parentNode.NodeID);
    createNodeCode.value = '';
    createNodeName.value = '';
    createNodeError.classList.add('hidden');
    createNodeModal.classList.remove('hidden');
    setTimeout(() => createNodeCode.focus(), 50);
}

function attachCreateNodeButton(row, node) {
    if (row.querySelector(':scope > .node-add-btn')) return;

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = `node-add-btn${createNodeMode ? '' : ' hidden'}`;
    addButton.title = `Add a new child node under ${node.NodeCode || node.NodeName || 'this node'}`;
    addButton.textContent = '+';
    addButton.addEventListener('click', event => {
        event.stopPropagation();
        openCreateNodeModal(node);
    });
    row.appendChild(addButton);
}

function refreshCreateNodeButtons() {
    if (!treeContainerForCreate) return;
    nodeElements.forEach(entry => {
        attachCreateNodeButton(entry.row, entry.node);
        const button = entry.row.querySelector(':scope > .node-add-btn');
        if (button) button.classList.toggle('hidden', !createNodeMode);
    });
}

// renderTree() in script.js creates rows dynamically. A MutationObserver lets
// this feature add the + button to every current/future row without modifying
// the existing tree/search implementation.
if (treeContainerForCreate) {
    const observer = new MutationObserver(() => refreshCreateNodeButtons());
    observer.observe(treeContainerForCreate, { childList: true, subtree: true });
}

createNodeBtn.addEventListener('click', () => {
    setCreateNodeMode(!createNodeMode);
    refreshCreateNodeButtons();
});

createNodeCancel.addEventListener('click', closeCreateNodeModal);
createNodeClose.addEventListener('click', closeCreateNodeModal);
createNodeModal.addEventListener('click', event => {
    if (event.target === createNodeModal) closeCreateNodeModal();
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !createNodeModal.classList.contains('hidden')) closeCreateNodeModal();
});

createNodeForm.addEventListener('submit', async event => {
    event.preventDefault();

    const parentId = Number(createNodeForm.dataset.parentId);
    const nodeCode = createNodeCode.value.trim();
    const nodeName = createNodeName.value.trim();

    if (!parentId || !nodeCode || !nodeName) {
        createNodeError.textContent = 'Parent Node, Node Code and Node Name are required.';
        createNodeError.classList.remove('hidden');
        return;
    }

    createNodeSubmit.disabled = true;
    createNodeSubmit.textContent = 'Creating...';
    createNodeError.classList.add('hidden');

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ParentID: parentId, NodeCode: nodeCode, NodeName: nodeName })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

        closeCreateNodeModal();
        setCreateNodeMode(false);
        await loadNodes();
        await loadPdfs();
        await loadSrscStatus();

        const createdId = normalizeNodeId(data.node?.NodeID);
        if (createdId !== null) {
            const entry = nodeElements.get(createdId);
            if (entry) {
                let parent = normalizeParentId(data.node?.ParentID);
                const visited = new Set();
                while (parent !== null && !visited.has(parent)) {
                    visited.add(parent);
                    const parentEntry = nodeElements.get(parent);
                    if (parentEntry?.hasChildren) parentEntry.setExpanded(true);
                    parent = parentById.get(parent) ?? null;
                }
                entry.row.scrollIntoView({ block: 'center', behavior: 'smooth' });
                selectNode(entry.node, entry.row);
            }
        }
    } catch (error) {
        console.error('Create Node failed:', error);
        createNodeError.textContent = error.message || 'Unable to create the Node.';
        createNodeError.classList.remove('hidden');
    } finally {
        createNodeSubmit.disabled = false;
        createNodeSubmit.textContent = 'Create Node';
    }
});

refreshCreateNodeButtons();
