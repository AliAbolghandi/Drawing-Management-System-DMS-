// ======================================================
// Drawing Management System - Tree Renderer
// LAN version: API uses the same host/port as the frontend.
// ======================================================

const API_BASE_URL = '/api';
const API_URL = `${API_BASE_URL}/nodes`;
const API_PDF_URL = `${API_BASE_URL}/pdfs`;
const API_PDF_FILE_URL = `${API_BASE_URL}/pdf-file`;

let allNodes = [];
let nodeElements = new Map();
let pdfsByNodeId = new Map();
let currentSearchQuery = '';
let parentById = new Map();

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

function highlightText(value, query) {
    const text = escapeHtml(value || '');
    if (!query) return text || '-';
    const escaped = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
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
        <div class="pdf-item" data-pdf-id="${escapeHtml(pdf.PDFID)}" title="Open PDF in browser">
            <span class="pdf-icon">📄</span>
            <span class="pdf-name">${escapeHtml(pdf.PDFName || '(Unnamed)')}</span>
        </div>`).join('');

    pdfList.querySelectorAll('.pdf-item').forEach(item => item.addEventListener('click', () => openPdfInBrowser(item.dataset.pdfId)));
}

function openPdfInBrowser(pdfId) {
    const url = `${API_PDF_FILE_URL}/${encodeURIComponent(pdfId)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
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
