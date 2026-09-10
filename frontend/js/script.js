// ======================================================
// Drawing Management System - Tree + SRSC File Browser
// ======================================================

// Use the same host as the browser for LAN access.
// When index.html is opened directly from disk, fall back to localhost.
const API_HOST = window.location.hostname || 'localhost';
const API_BASE = `http://${API_HOST}:3000`;

const API_URL = `${API_BASE}/api/nodes`;
const API_PDF_URL = `${API_BASE}/api/pdfs`;
const API_PDF_OPEN_URL = `${API_BASE}/api/pdf-open`;
const API_SRSC_FOLDERS_URL = `${API_BASE}/api/node-folders`;
const API_SRSC_FILES_URL = `${API_BASE}/api/node-folder-files`;
const API_SRSC_FILE_URL = `${API_BASE}/api/node-file`;

const SRSC_FOLDER_ORDER = ['SLD', 'DOC', 'PIC', 'Catalog'];

let allNodes = [];
let nodeElements = new Map();
let pdfsByNodeId = new Map();
let currentSearchQuery = '';
let parentById = new Map();
let currentSelectedNode = null;

const treeContainer = document.getElementById('treeContainer');
const connectionStatus = document.getElementById('connectionStatus');
const nodeCount = document.getElementById('nodeCount');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchInfo = document.getElementById('searchInfo');
const expandAllBtn = document.getElementById('expandAllBtn');
const collapseAllBtn = document.getElementById('collapseAllBtn');

function normalizeNodeId(value) {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
}

function normalizeParentId(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(value, query) {
    const text = escapeHtml(value || '');
    if (!query) return text || '-';
    return text.replace(new RegExp(`(${escapeRegExp(query)})`, 'gi'), '<mark>$1</mark>');
}

function formatFileSize(bytes) {
    if (!Number.isFinite(Number(bytes)) || Number(bytes) < 0) return '';
    const size = Number(bytes);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getFileIcon(item) {
    if (item.type === 'folder') return '📁';
    if (item.kind === 'pdf') return '📄';
    if (item.kind === 'image') return '🖼️';
    if (item.kind === 'cad') return '📐';
    if (item.kind === 'document') return '📝';
    return '📎';
}

function getFileActionLabel(item) {
    if (item.type === 'folder') return 'Open';
    if (item.kind === 'pdf' || item.kind === 'image') return 'Open';
    return 'Download';
}

async function loadNodes() {
    try {
        treeContainer.innerHTML = '<div class="loading">Loading equipment structure...</div>';
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Nodes API did not return an array.');

        allNodes = data;
        parentById = new Map();
        allNodes.forEach(node => parentById.set(normalizeNodeId(node.NodeID), normalizeParentId(node.ParentID)));

        connectionStatus.textContent = 'Connected';
        connectionStatus.className = 'status connected';
        nodeCount.textContent = `${allNodes.length.toLocaleString('en-US')} nodes`;
        renderTree(allNodes);
    } catch (error) {
        console.error('Tree loading error:', error);
        connectionStatus.textContent = 'Connection Error';
        connectionStatus.className = 'status disconnected';
        treeContainer.innerHTML = `<div class="error"><strong>Unable to load equipment structure</strong><br><br>${escapeHtml(error.message)}</div>`;
    }
}

async function loadPdfs() {
    try {
        const response = await fetch(API_PDF_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) return;

        pdfsByNodeId = new Map();
        data.forEach(pdf => {
            const nodeId = normalizeNodeId(pdf.NodeID);
            if (nodeId === null) return;
            if (!pdfsByNodeId.has(nodeId)) pdfsByNodeId.set(nodeId, []);
            pdfsByNodeId.get(nodeId).push(pdf);
        });

        nodeElements.forEach((entry, nodeId) => entry.row.classList.toggle('has-pdf', pdfsByNodeId.has(nodeId)));
    } catch (error) {
        console.error('PDF loading error:', error);
    }
}

function buildTree(nodes) {
    const nodeMap = new Map();
    const roots = [];

    nodes.forEach(node => {
        const id = normalizeNodeId(node.NodeID);
        if (id === null) return;
        nodeMap.set(id, { ...node, _id: id, _parentId: normalizeParentId(node.ParentID), children: [] });
    });

    nodeMap.forEach(node => {
        if (node._parentId === null || !nodeMap.has(node._parentId)) roots.push(node);
        else nodeMap.get(node._parentId).children.push(node);
    });

    function sort(node) {
        node.children.sort((a, b) => a._id - b._id);
        node.children.forEach(sort);
    }

    roots.sort((a, b) => a._id - b._id);
    roots.forEach(sort);
    return roots;
}

function renderTree(nodes) {
    treeContainer.innerHTML = '';
    nodeElements.clear();
    const roots = buildTree(nodes);

    if (!roots.length) {
        treeContainer.innerHTML = '<div class="error">No root nodes were found.</div>';
        return;
    }

    roots.forEach(root => {
        treeContainer.appendChild(createNodeElement(root, true));
        const entry = nodeElements.get(root._id);
        if (entry && entry.hasChildren) entry.setExpanded(true);
    });
}

function createNodeElement(node, isRoot = false) {
    const wrapper = document.createElement('div');
    wrapper.className = `tree-node${isRoot ? ' root' : ''}`;

    const row = document.createElement('div');
    row.className = 'node-row';

    const expandButton = document.createElement('button');
    expandButton.type = 'button';
    expandButton.className = 'expand-btn';

    const hasChildren = node.children.length > 0;
    if (hasChildren) expandButton.textContent = '+';
    else expandButton.classList.add('empty');

    const icon = document.createElement('div');
    icon.className = 'node-icon';
    icon.textContent = hasChildren ? '▰' : '▪';

    const content = document.createElement('div');
    content.className = 'node-content';

    const label = document.createElement('div');
    label.className = 'node-label';
    label.innerHTML = `${highlightText(node.NodeCode || '', currentSearchQuery)} <span class="node-separator">—</span> ${highlightText(node.NodeName || '(Unnamed)', currentSearchQuery)}`;
    content.appendChild(label);

    row.append(expandButton, icon, content);
    wrapper.appendChild(row);

    let childrenContainer = null;
    let isExpanded = false;

    function buildChildrenIfNeeded() {
        if (childrenContainer) return;
        childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        node.children.forEach(child => childrenContainer.appendChild(createNodeElement(child)));
        wrapper.appendChild(childrenContainer);
    }

    function setExpanded(expand) {
        if (!hasChildren) return;
        if (expand) {
            buildChildrenIfNeeded();
            childrenContainer.classList.remove('collapsed');
            expandButton.textContent = '−';
        } else {
            if (childrenContainer) childrenContainer.classList.add('collapsed');
            expandButton.textContent = '+';
        }
        isExpanded = expand;
    }

    if (hasChildren) {
        expandButton.addEventListener('click', event => {
            event.stopPropagation();
            setExpanded(!isExpanded);
        });
    }

    row.addEventListener('click', () => selectNode(node, row));
    if (pdfsByNodeId.has(node._id)) row.classList.add('has-pdf');

    nodeElements.set(node._id, { node, wrapper, row, hasChildren, setExpanded });
    return wrapper;
}

function selectNode(node, row) {
    document.querySelectorAll('.node-row.selected').forEach(el => el.classList.remove('selected'));
    row.classList.add('selected');
    currentSelectedNode = node;
    showNodeDetails(node);
}

function showNodeDetails(node) {
    document.getElementById('emptyDetails').classList.add('hidden');
    document.getElementById('nodeDetails').classList.remove('hidden');
    document.getElementById('detailName').textContent = node.NodeName || '-';
    document.getElementById('detailId').textContent = node.NodeID ?? '-';
    document.getElementById('detailParent').textContent = node.ParentID ?? 'Root';
    document.getElementById('detailCode').textContent = node.NodeCode || '-';
    document.getElementById('detailNodeName').textContent = node.NodeName || '-';

    const status = document.getElementById('detailStatus');
    const active = node.IsActive === true || Number(node.IsActive) === 1;
    status.textContent = active ? 'Active' : 'Inactive';
    status.className = active ? 'node-status' : 'node-status inactive';

    renderPdfList(node._id ?? normalizeNodeId(node.NodeID));
    loadSrscFolders(node._id ?? normalizeNodeId(node.NodeID));
}

function renderPdfList(nodeId) {
    const pdfList = document.getElementById('pdfList');
    if (!pdfList) return;
    const pdfs = pdfsByNodeId.get(nodeId) || [];

    if (!pdfs.length) {
        pdfList.innerHTML = '<div class="pdf-empty">No PDF files registered.</div>';
        return;
    }

    pdfList.innerHTML = pdfs.map(pdf => `
        <div class="pdf-item" data-pdf-id="${escapeHtml(pdf.PDFID)}" title="Open with the system default application">
            <span class="pdf-icon">📄</span>
            <span class="pdf-name">${escapeHtml(pdf.PDFName || '(Unnamed)')}</span>
        </div>`).join('');

    pdfList.querySelectorAll('.pdf-item').forEach(item => item.addEventListener('click', () => openPdfInDefaultApp(item.dataset.pdfId)));
}

async function openPdfInDefaultApp(pdfId) {
    try {
        const response = await fetch(`${API_PDF_OPEN_URL}/${encodeURIComponent(pdfId)}`);
        const data = await response.json();
        if (!response.ok || !data.success) alert(`Unable to open PDF: ${data.error || 'Unknown error'}`);
    } catch (error) {
        console.error('PDF open request failed:', error);
        alert('Unable to connect to the server to open the PDF.');
    }
}

async function loadSrscFolders(nodeId) {
    const container = document.getElementById('srscContent');
    if (!container) return;

    container.innerHTML = '<div class="srsc-loading">Loading company files...</div>';

    try {
        const response = await fetch(`${API_SRSC_FOLDERS_URL}/${encodeURIComponent(nodeId)}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

        if (!data.hasFolderPath) {
            container.innerHTML = `
                <div class="srsc-empty">
                    <div class="srsc-empty-icon">▱</div>
                    <strong>No SRSC folder configured</strong>
                    <span>This Node does not have a FolderPath.</span>
                </div>`;
            return;
        }

        if (data.folderExists === false) {
            container.innerHTML = `
                <div class="srsc-empty srsc-warning">
                    <div class="srsc-empty-icon">⚠</div>
                    <strong>SRSC folder not found</strong>
                    <span>The configured Node folder could not be found on the server.</span>
                </div>`;
            return;
        }

        const folders = SRSC_FOLDER_ORDER
            .map(name => (data.folders || []).find(folder => folder.name.toLowerCase() === name.toLowerCase()))
            .filter(Boolean);

        if (!folders.length) {
            container.innerHTML = `
                <div class="srsc-empty">
                    <div class="srsc-empty-icon">▱</div>
                    <strong>No company folders found</strong>
                    <span>SLD, DOC, PIC and Catalog are the only folders exposed here.</span>
                </div>`;
            return;
        }

        renderSrscFolderCards(nodeId, folders);
    } catch (error) {
        console.error('SRSC folder loading error:', error);
        container.innerHTML = `
            <div class="error">
                <strong>Unable to load SRSC files</strong><br><br>${escapeHtml(error.message)}
            </div>`;
    }
}

function renderSrscFolderCards(nodeId, folders) {
    const container = document.getElementById('srscContent');
    container.innerHTML = `
        <div class="srsc-folder-grid">
            ${folders.map(folder => `
                <button type="button" class="srsc-folder-card" data-folder="${escapeHtml(folder.name)}">
                    <span class="srsc-folder-icon">📁</span>
                    <span class="srsc-folder-name">${escapeHtml(folder.name)}</span>
                    <span class="srsc-folder-arrow">›</span>
                </button>`).join('')}
        </div>`;

    container.querySelectorAll('.srsc-folder-card').forEach(button => {
        button.addEventListener('click', () => openSrscFolder(nodeId, button.dataset.folder));
    });
}

async function openSrscFolder(nodeId, folderName) {
    const container = document.getElementById('srscContent');
    container.innerHTML = '<div class="srsc-loading">Loading folder...</div>';

    try {
        const response = await fetch(`${API_SRSC_FILES_URL}/${encodeURIComponent(nodeId)}/${encodeURIComponent(folderName)}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

        renderSrscFolderContents(nodeId, folderName, data.items || []);
    } catch (error) {
        console.error('SRSC folder contents error:', error);
        container.innerHTML = `
            <div class="error">
                <strong>Unable to load folder</strong><br><br>${escapeHtml(error.message)}
            </div>
            <button type="button" class="srsc-back-button" id="srscErrorBack">← Back to SRSC folders</button>`;
        document.getElementById('srscErrorBack')?.addEventListener('click', () => loadSrscFolders(nodeId));
    }
}

function renderSrscFolderContents(nodeId, folderName, items) {
    const container = document.getElementById('srscContent');

    const header = `
        <div class="srsc-browser-header">
            <button type="button" class="srsc-back-button" id="srscBackButton">← Back</button>
            <div class="srsc-current-folder">
                <span>📁</span>
                <strong>${escapeHtml(folderName)}</strong>
                <small>${items.length} item${items.length === 1 ? '' : 's'}</small>
            </div>
        </div>`;

    if (!items.length) {
        container.innerHTML = `${header}
            <div class="srsc-empty">
                <div class="srsc-empty-icon">∅</div>
                <strong>This folder is empty</strong>
                <span>No files are currently available in this folder.</span>
            </div>`;
        document.getElementById('srscBackButton')?.addEventListener('click', () => loadSrscFolders(nodeId));
        return;
    }

    container.innerHTML = `${header}
        <div class="srsc-file-list">
            ${items.map(item => {
                if (item.type === 'folder') {
                    return `
                        <div class="srsc-file-row srsc-subfolder" data-subfolder="${escapeHtml(item.name)}">
                            <span class="srsc-file-icon">📁</span>
                            <span class="srsc-file-main">
                                <strong>${escapeHtml(item.name)}</strong>
                                <small>Folder</small>
                            </span>
                            <span class="srsc-file-action">Open ›</span>
                        </div>`;
                }

                return `
                    <div class="srsc-file-row srsc-file" data-file="${escapeHtml(item.name)}" data-kind="${escapeHtml(item.kind || 'file')}" title="${getFileActionLabel(item)}">
                        <span class="srsc-file-icon">${getFileIcon(item)}</span>
                        <span class="srsc-file-main">
                            <strong>${escapeHtml(item.name)}</strong>
                            <small>${escapeHtml(item.extension || '').replace('.', '').toUpperCase() || 'FILE'}${item.size !== undefined ? ` · ${formatFileSize(item.size)}` : ''}</small>
                        </span>
                        <span class="srsc-file-action">${getFileActionLabel(item)}</span>
                    </div>`;
            }).join('')}
        </div>`;

    document.getElementById('srscBackButton')?.addEventListener('click', () => loadSrscFolders(nodeId));

    container.querySelectorAll('.srsc-file').forEach(row => {
        row.addEventListener('click', () => openSrscFile(nodeId, folderName, row.dataset.file, row.dataset.kind));
    });

    // Nested folders are supported without exposing arbitrary folders at Node level.
    container.querySelectorAll('.srsc-subfolder').forEach(row => {
        row.addEventListener('click', () => openNestedSrscFolder(nodeId, folderName, row.dataset.subfolder));
    });
}

async function openNestedSrscFolder(nodeId, topFolderName, relativeFolder) {
    // The current backend endpoint accepts a top-level allowed folder only.
    // Nested folder browsing is intentionally disabled here to keep the exposed
    // filesystem surface limited to the four SRSC root folders.
    alert('Nested folders are not available in this version. Files in the SRSC folder can be opened or downloaded directly.');
}

function openSrscFile(nodeId, folderName, fileName, kind) {
    const url = `${API_SRSC_FILE_URL}?nodeId=${encodeURIComponent(nodeId)}&folder=${encodeURIComponent(folderName)}&file=${encodeURIComponent(fileName)}`;

    if (kind === 'pdf' || kind === 'image') {
        window.open(url, '_blank', 'noopener');
        return;
    }

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function expandAll() {
    let changed = true;
    while (changed) {
        changed = false;
        [...nodeElements.values()].forEach(entry => {
            if (entry.hasChildren) {
                const before = nodeElements.size;
                entry.setExpanded(true);
                if (nodeElements.size !== before) changed = true;
            }
        });
    }
}

function collapseAll() {
    nodeElements.forEach(entry => {
        if (entry.hasChildren) entry.setExpanded(false);
    });
}

function nodeMatches(node, query) {
    const q = query.toLowerCase();
    return String(node.NodeCode || '').toLowerCase().includes(q) || String(node.NodeName || '').toLowerCase().includes(q);
}

// Search runs ONLY when the Search button is clicked (or Enter is pressed).
function searchTree() {
    const query = searchInput.value.trim();
    currentSearchQuery = query;

    if (!query) {
        searchInfo.classList.add('hidden');
        renderTree(allNodes);
        return;
    }

    renderTree(allNodes);
    collapseAll();

    const matches = allNodes.filter(node => nodeMatches(node, query));
    const matchIds = new Set(matches.map(node => normalizeNodeId(node.NodeID)));

    matches.forEach(node => {
        let id = normalizeNodeId(node.NodeID);
        const path = [];
        const visited = new Set();

        while (id !== null && !visited.has(id)) {
            visited.add(id);
            path.unshift(id);
            id = parentById.get(id) ?? null;
        }

        for (let i = 0; i < path.length - 1; i++) {
            const entry = nodeElements.get(path[i]);
            if (entry && entry.hasChildren) entry.setExpanded(true);
        }
    });

    nodeElements.forEach(entry => {
        const isMatch = matchIds.has(entry.node._id);
        entry.row.classList.toggle('search-match', isMatch);
        entry.row.querySelector('.node-label').innerHTML = `${highlightText(entry.node.NodeCode || '', currentSearchQuery)} <span class="node-separator">—</span> ${highlightText(entry.node.NodeName || '(Unnamed)', currentSearchQuery)}`;
    });

    if (matches.length) {
        searchInfo.textContent = `${matches.length.toLocaleString('en-US')} matching node${matches.length === 1 ? '' : 's'} found. Other branches remain available and collapsed.`;
        searchInfo.classList.remove('hidden');
        const firstMatch = nodeElements.get(normalizeNodeId(matches[0].NodeID));
        if (firstMatch) firstMatch.row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
        searchInfo.textContent = `No nodes found for “${query}”.`;
        searchInfo.classList.remove('hidden');
    }
}

searchBtn.addEventListener('click', searchTree);
searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') searchTree();
});
expandAllBtn.addEventListener('click', expandAll);
collapseAllBtn.addEventListener('click', collapseAll);

loadNodes();
loadPdfs();
