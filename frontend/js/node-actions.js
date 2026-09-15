// ======================================================
// Node actions + SRSC visual status + lazy PDF loading
// ======================================================

const nodeActionsTree = document.getElementById('treeContainer');
let srscPollTimer = null;
let selectedPdfRequestId = 0;

function applySrscVisualStatus() {
    if (typeof nodeElements === 'undefined') return;
    nodeElements.forEach((entry, nodeId) => {
        entry.row.classList.toggle('has-srsc', srscNodeIds.has(nodeId));
    });
}

async function refreshSrscStatusUntilReady() {
    try {
        const response = await fetch(API_SRSC_STATUS_URL, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (Array.isArray(data.nodeIds)) {
            srscNodeIds = new Set(data.nodeIds.map(normalizeNodeId));
            applySrscVisualStatus();
        }

        if (data.pending) {
            clearTimeout(srscPollTimer);
            srscPollTimer = setTimeout(refreshSrscStatusUntilReady, 1500);
        } else {
            clearTimeout(srscPollTimer);
            srscPollTimer = null;
        }
    } catch (error) {
        console.warn('SRSC status refresh failed:', error.message);
    }
}

async function loadSelectedNodePdfs(nodeId) {
    const requestId = ++selectedPdfRequestId;
    const pdfList = document.getElementById('pdfList');
    if (!pdfList) return;

    pdfList.innerHTML = '<div class="pdf-empty">Loading PDF files...</div>';

    try {
        const response = await fetch(`${API_PDF_URL}?nodeId=${encodeURIComponent(nodeId)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (requestId !== selectedPdfRequestId) return;
        if (!Array.isArray(data)) return;

        const pdfs = data.filter(pdf => normalizeNodeId(pdf.NodeID) === normalizeNodeId(nodeId));
        pdfsByNodeId.set(normalizeNodeId(nodeId), pdfs);

        const entry = nodeElements.get(normalizeNodeId(nodeId));
        if (entry) entry.row.classList.toggle('has-pdf', pdfs.length > 0);

        if (typeof renderPdfList === 'function') renderPdfList(normalizeNodeId(nodeId));
    } catch (error) {
        if (requestId !== selectedPdfRequestId) return;
        console.error('Lazy PDF loading error:', error);
        pdfList.innerHTML = '<div class="pdf-empty">Unable to load PDF files.</div>';
    }
}

function clearSelectedNodeDetails() {
    currentSelectedNode = null;
    document.getElementById('nodeDetails')?.classList.add('hidden');
    document.getElementById('emptyDetails')?.classList.remove('hidden');
    const pdfList = document.getElementById('pdfList');
    if (pdfList) pdfList.innerHTML = '';
}

function attachDeleteButton(entry) {
    if (!entry?.row || entry.row.querySelector(':scope > .node-delete-btn')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'node-delete-btn';
    button.title = `Delete ${entry.node.NodeCode || entry.node.NodeName || 'Node'}`;
    button.setAttribute('aria-label', 'Delete Node');
    button.textContent = '×';

    button.addEventListener('click', async event => {
        event.stopPropagation();

        const node = entry.node;
        const label = `${node.NodeCode || '-'} — ${node.NodeName || '(Unnamed)'}`;
        const confirmed = window.confirm(
            `Are you sure you want to delete this Node?\n\n${label}\n\n` +
            `This action removes the Node record from the database. Child Nodes or registered PDF records will prevent deletion.`
        );
        if (!confirmed) return;

        button.disabled = true;
        button.textContent = '…';

        try {
            const response = await fetch(`${API_URL}/${encodeURIComponent(node.NodeID)}`, {
                method: 'DELETE'
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

            if (currentSelectedNode && normalizeNodeId(currentSelectedNode.NodeID) === normalizeNodeId(node.NodeID)) {
                clearSelectedNodeDetails();
            }

            await loadNodes();
            // PDFs are loaded lazily now; do not issue a full-table query after deletion.
            refreshSrscStatusUntilReady();
        } catch (error) {
            console.error('Delete Node failed:', error);
            window.alert(`Unable to delete Node.\n\n${error.message}`);
            button.disabled = false;
            button.textContent = '×';
        }
    });

    entry.row.appendChild(button);
}

function refreshDeleteButtons() {
    if (typeof nodeElements === 'undefined') return;
    nodeElements.forEach(entry => attachDeleteButton(entry));
}

// Rows are created dynamically, including after search and expansion.
if (nodeActionsTree) {
    const observer = new MutationObserver(() => refreshDeleteButtons());
    observer.observe(nodeActionsTree, { childList: true, subtree: true });
}

// Intercept row clicks after script.js has handled selection, then load only
// the PDFs belonging to the selected Node instead of downloading the entire
// DanieliPDF table during startup.
if (nodeActionsTree) {
    nodeActionsTree.addEventListener('click', event => {
        const row = event.target.closest('.node-row');
        if (!row || event.target.closest('button')) return;
        const entry = [...nodeElements.values()].find(item => item.row === row);
        if (!entry) return;
        loadSelectedNodePdfs(entry.node._id ?? normalizeNodeId(entry.node.NodeID));
    });
}

setTimeout(() => {
    refreshDeleteButtons();
    refreshSrscStatusUntilReady();
}, 0);
