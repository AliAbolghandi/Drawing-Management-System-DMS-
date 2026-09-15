(() => {
  'use strict';

  const API_HOST = window.location.hostname || 'localhost';
  const API_BASE = `http://${API_HOST}:3000`;
  const API_URL = `${API_BASE}/api/nodes`;
  const API_PDF_URL = `${API_BASE}/api/pdfs`;
  const API_PDF_OPEN_URL = `${API_BASE}/api/pdf-open`;
  const API_SRSC_FOLDERS_URL = `${API_BASE}/api/node-folders`;
  const API_SRSC_FILES_URL = `${API_BASE}/api/node-folder-files`;
  const API_SRSC_FILE_URL = `${API_BASE}/api/node-file`;
  const API_SRSC_STATUS_URL = `${API_BASE}/api/srsc-status`;
  const SRSC_FOLDER_ORDER = ['SLD', 'DOC', 'PIC', 'Catalog'];

  const state = {
    nodeElements: new Map(),
    nodeCache: new Map(),
    loadedParents: new Set(),
    pdfsByNodeId: new Map(),
    srscNodeIds: new Set(),
    srscStatusLoaded: false,
    srscStatusPromise: null,
    currentSearchQuery: '',
    currentSelectedNode: null,
    searchMode: false,
  };

  const el = {
    tree: document.getElementById('treeContainer'),
    connection: document.getElementById('connectionStatus'),
    count: document.getElementById('nodeCount'),
    search: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    searchInfo: document.getElementById('searchInfo'),
    expandAll: document.getElementById('expandAllBtn'),
    collapseAll: document.getElementById('collapseAllBtn'),
  };

  function nodeId(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function parentId(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlight(value, query = state.currentSearchQuery) {
    const text = escapeHtml(value ?? '');
    if (!text) return '-';
    if (!query) return text;
    return text.replace(new RegExp(`(${escapeRegExp(query)})`, 'gi'), '<mark>$1</mark>');
  }

  function setConnection(connected, message) {
    el.connection.textContent = message || (connected ? 'Connected' : 'Connection Error');
    el.connection.className = `status ${connected ? 'connected' : 'disconnected'}`;
  }

  function updateCount() {
    el.count.textContent = `${state.nodeCache.size.toLocaleString('en-US')} loaded nodes`;
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function fetchChildren(parent) {
    const key = parent === null ? 'root' : String(parent);
    if (state.loadedParents.has(key)) {
      return [...state.nodeCache.values()]
        .filter(n => parentId(n.ParentID) === parent)
        .sort((a, b) => Number(a.NodeID) - Number(b.NodeID));
    }

    const url = parent === null ? `${API_URL}?parentId=` : `${API_URL}?parentId=${encodeURIComponent(parent)}`;
    const data = await fetchJson(url);
    for (const node of data) {
      const id = nodeId(node.NodeID);
      if (id !== null) state.nodeCache.set(id, node);
    }
    state.loadedParents.add(key);
    updateCount();
    return data;
  }

  function mergePdfRecords(records) {
    for (const pdf of records || []) {
      const id = nodeId(pdf.NodeID);
      if (id === null) continue;
      const list = state.pdfsByNodeId.get(id) || [];
      const pdfId = String(pdf.PDFID);
      if (!list.some(item => String(item.PDFID) === pdfId)) list.push(pdf);
      state.pdfsByNodeId.set(id, list);
    }
  }

  async function prefetchPdfForNodes(nodes) {
    const ids = [...new Set(nodes.map(n => nodeId(n.NodeID)).filter(Boolean))];
    if (!ids.length) return;
    try {
      const data = await fetchJson(`${API_PDF_URL}?nodeIds=${ids.join(',')}`);
      mergePdfRecords(data);
      ids.forEach(id => refreshNodeStatus(id));
    } catch (error) {
      console.error('PDF prefetch failed:', error);
    }
  }

  async function loadSrscStatus(force = false) {
    if (state.srscStatusLoaded && !force) return;
    if (state.srscStatusPromise && !force) return state.srscStatusPromise;

    state.srscStatusPromise = fetchJson(`${API_SRSC_STATUS_URL}${force ? '?refresh=1' : ''}`)
      .then(data => {
        if (Array.isArray(data.nodeIds)) {
          state.srscNodeIds = new Set(data.nodeIds.map(nodeId).filter(Boolean));
        }
        state.srscStatusLoaded = !data.pending;
        state.nodeElements.forEach((entry, id) => refreshNodeStatus(id));
        if (data.pending) {
          setTimeout(() => loadSrscStatus(false).catch(console.error), 1500);
        }
      })
      .catch(error => console.error('SRSC status load failed:', error))
      .finally(() => {
        state.srscStatusPromise = null;
      });

    return state.srscStatusPromise;
  }

  function refreshNodeStatus(id) {
    const entry = state.nodeElements.get(id);
    if (!entry) return;
    const hasPdf = state.pdfsByNodeId.has(id);
    const hasSrsc = state.srscNodeIds.has(id);
    entry.row.classList.toggle('has-pdf', hasPdf && !hasSrsc);
    entry.row.classList.toggle('has-srsc', hasSrsc);
    entry.row.classList.toggle('has-both', hasPdf && hasSrsc);
  }

  function makeNodeLabel(node) {
    const label = document.createElement('div');
    label.className = 'node-label';
    label.innerHTML = `
      <span class="code">${highlight(node.NodeCode || '')}</span>
      <span class="node-separator">—</span>
      <span class="desc">${highlight(node.NodeName || '(Unnamed)')}</span>`;
    return label;
  }

  function createNodeElement(node, options = {}) {
    const id = nodeId(node.NodeID);
    if (id === null) throw new Error('Node has an invalid NodeID.');

    const wrapper = document.createElement('div');
    wrapper.className = `tree-node${options.root ? ' root' : ''}`;
    wrapper.dataset.nodeId = String(id);

    const row = document.createElement('div');
    row.className = 'node-row';

    const expandButton = document.createElement('button');
    expandButton.type = 'button';
    expandButton.className = 'expand-btn';
    expandButton.setAttribute('aria-label', 'Expand Node');

    const icon = document.createElement('div');
    icon.className = 'node-icon';

    const content = document.createElement('div');
    content.className = 'node-content';
    content.appendChild(makeNodeLabel(node));

    row.append(expandButton, icon, content);
    wrapper.appendChild(row);

    let childrenContainer = null;
    let childrenLoaded = false;
    let expanded = false;
    let hasChildren = Number(node.HasChildren) === 1;

    function updateExpandUi() {
      if (!hasChildren) {
        expandButton.textContent = '';
        expandButton.classList.add('empty');
        expandButton.disabled = true;
        icon.textContent = '▪';
        return;
      }
      expandButton.disabled = false;
      expandButton.classList.remove('empty');
      expandButton.textContent = expanded ? '−' : '+';
      icon.textContent = expanded ? '▾' : '▰';
    }

    async function ensureChildren() {
      if (childrenLoaded || !hasChildren) return;
      expandButton.disabled = true;
      try {
        const children = await fetchChildren(id);
        childrenLoaded = true;
        hasChildren = children.length > 0;
        if (!hasChildren) {
          updateExpandUi();
          return;
        }

        childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        for (const child of children) {
          childrenContainer.appendChild(createNodeElement(child));
        }
        wrapper.appendChild(childrenContainer);
        await prefetchPdfForNodes(children);
        await loadSrscStatus(false);
      } finally {
        expandButton.disabled = false;
        updateExpandUi();
      }
    }

    async function setExpanded(value) {
      if (value) {
        await ensureChildren();
        if (!hasChildren || !childrenContainer) return;
        childrenContainer.classList.remove('collapsed');
        expanded = true;
      } else {
        if (childrenContainer) childrenContainer.classList.add('collapsed');
        expanded = false;
      }
      updateExpandUi();
    }

    expandButton.addEventListener('click', async event => {
      event.stopPropagation();
      try {
        await setExpanded(!expanded);
      } catch (error) {
        console.error('Expand failed:', error);
        alert(`Unable to load child Nodes: ${error.message}`);
      }
    });

    row.addEventListener('click', () => selectNode(node, row));

    const entry = { node, wrapper, row, setExpanded, get expanded() { return expanded; } };
    state.nodeElements.set(id, entry);
    updateExpandUi();
    refreshNodeStatus(id);
    return wrapper;
  }

  function selectNode(node, row) {
    document.querySelectorAll('.node-row.selected').forEach(item => item.classList.remove('selected'));
    row.classList.add('selected');
    state.currentSelectedNode = node;
    showNodeDetails(node);
  }

  function showNodeDetails(node) {
    document.getElementById('emptyDetails')?.classList.add('hidden');
    document.getElementById('nodeDetails')?.classList.remove('hidden');
    document.getElementById('detailName').textContent = node.NodeName || '-';
    document.getElementById('detailCode').textContent = node.NodeCode || '-';
    document.getElementById('detailNodeName').textContent = node.NodeName || '-';
    document.getElementById('detailJet').textContent = node.JET_Position ?? '-';
    document.getElementById('detailNorme').textContent = node.Norme ?? '-';
    document.getElementById('detailMass').textContent = node.Mass ?? '-';

    const status = document.getElementById('detailStatus');
    const active = node.IsActive === true || Number(node.IsActive) === 1;
    status.textContent = active ? 'Active' : 'Inactive';
    status.className = active ? 'node-status' : 'node-status inactive';

    renderPdfList(nodeId(node.NodeID));
    loadSrscFolders(nodeId(node.NodeID));
  }

  function renderPdfList(id) {
    const box = document.getElementById('pdfList');
    if (!box) return;
    const pdfs = state.pdfsByNodeId.get(id) || [];
    if (!pdfs.length) {
      box.innerHTML = '<div class="pdf-empty">No PDF files registered.</div>';
      return;
    }
    box.innerHTML = pdfs.map(pdf => `
      <div class="pdf-item" data-pdf-id="${escapeHtml(pdf.PDFID)}" title="Open with the system default application">
        <span class="pdf-icon">📄</span>
        <span class="pdf-name">${escapeHtml(pdf.PDFName || '(Unnamed)')}</span>
      </div>`).join('');
    box.querySelectorAll('.pdf-item').forEach(item => {
      item.addEventListener('click', () => openPdfInDefaultApp(item.dataset.pdfId));
    });
  }

  async function openPdfInDefaultApp(id) {
    try {
      const data = await fetchJson(`${API_PDF_OPEN_URL}/${encodeURIComponent(id)}`);
      if (!data.success) throw new Error('The server could not open the PDF.');
    } catch (error) {
      alert(`Unable to open PDF: ${error.message}`);
    }
  }

  async function loadSrscFolders(id) {
    const container = document.getElementById('srscContent');
    if (!container || !id) return;
    container.innerHTML = '<div class="srsc-loading">Loading company files...</div>';
    try {
      const data = await fetchJson(`${API_SRSC_FOLDERS_URL}/${encodeURIComponent(id)}`);
      if (!data.hasFolderPath) {
        container.innerHTML = '<div class="srsc-empty"><div class="srsc-empty-icon">▱</div><strong>No SRSC folder configured</strong><span>This Node does not have a FolderPath.</span></div>';
        return;
      }
      if (data.folderExists === false) {
        container.innerHTML = '<div class="srsc-empty srsc-warning"><div class="srsc-empty-icon">⚠</div><strong>SRSC folder not found</strong><span>The configured Node folder could not be found on the server.</span></div>';
        return;
      }
      const folders = SRSC_FOLDER_ORDER
        .map(name => (data.folders || []).find(folder => folder.name.toLowerCase() === name.toLowerCase()))
        .filter(Boolean);
      if (!folders.length) {
        container.innerHTML = '<div class="srsc-empty"><div class="srsc-empty-icon">▱</div><strong>No company folders found</strong><span>SLD, DOC, PIC and Catalog are the only folders exposed here.</span></div>';
        return;
      }
      renderSrscFolderCards(id, folders);
    } catch (error) {
      container.innerHTML = `<div class="error"><strong>Unable to load SRSC files</strong><br><br>${escapeHtml(error.message)}</div>`;
    }
  }

  function renderSrscFolderCards(id, folders) {
    const container = document.getElementById('srscContent');
    container.innerHTML = `<div class="srsc-folder-grid">${folders.map(folder => `
      <button type="button" class="srsc-folder-card" data-folder="${escapeHtml(folder.name)}">
        <span class="srsc-folder-icon">📁</span>
        <span class="srsc-folder-name">${escapeHtml(folder.name)}</span>
        <span class="srsc-folder-arrow">›</span>
      </button>`).join('')}</div>`;
    container.querySelectorAll('.srsc-folder-card').forEach(button => {
      button.addEventListener('click', () => openSrscFolder(id, button.dataset.folder));
    });
  }

  async function openSrscFolder(id, folder, subPath = '') {
    const container = document.getElementById('srscContent');
    container.innerHTML = '<div class="srsc-loading">Loading folder...</div>';
    try {
      let url = `${API_SRSC_FILES_URL}/${encodeURIComponent(id)}/${encodeURIComponent(folder)}`;
      if (subPath) url += `?subPath=${encodeURIComponent(subPath)}`;
      const data = await fetchJson(url);
      renderSrscFolderContents(id, folder, subPath, data.items || []);
    } catch (error) {
      container.innerHTML = `<div class="error"><strong>Unable to load folder</strong><br><br>${escapeHtml(error.message)}</div><button type="button" class="srsc-back-button" id="srscErrorBack">← Back to SRSC folders</button>`;
      document.getElementById('srscErrorBack')?.addEventListener('click', () => loadSrscFolders(id));
    }
  }

  function goBackSrsc(id, folder, subPath) {
    if (!subPath) {
      loadSrscFolders(id);
      return;
    }
    const parts = subPath.split('/');
    parts.pop();
    openSrscFolder(id, folder, parts.join('/'));
  }

  function formatFileSize(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
    return `${(n / 1073741824).toFixed(1)} GB`;
  }

  function fileIcon(item) {
    if (item.type === 'folder') return '📁';
    if (item.kind === 'pdf') return '📄';
    if (item.kind === 'image') return '🖼️';
    if (item.kind === 'cad') return '📐';
    if (item.kind === 'document') return '📝';
    return '📎';
  }

  function fileAction(item) {
    return item.type === 'folder' ? 'Open' : (item.kind === 'pdf' || item.kind === 'image' ? 'Open' : 'Download');
  }

  function renderSrscFolderContents(id, folder, subPath, items) {
    const container = document.getElementById('srscContent');
    const crumb = [folder, ...(subPath ? subPath.split('/') : [])].join(' / ');
    const header = `
      <div class="srsc-browser-header">
        <button type="button" class="srsc-back-button" id="srscBackButton">← Back</button>
        <div class="srsc-current-folder"><span>📁</span><strong>${escapeHtml(crumb)}</strong><small>${items.length} item${items.length === 1 ? '' : 's'}</small></div>
      </div>`;

    if (!items.length) {
      container.innerHTML = `${header}<div class="srsc-empty"><div class="srsc-empty-icon">∅</div><strong>This folder is empty</strong><span>No files are currently available in this folder.</span></div>`;
      document.getElementById('srscBackButton')?.addEventListener('click', () => goBackSrsc(id, folder, subPath));
      return;
    }

    container.innerHTML = `${header}<div class="srsc-file-list">${items.map(item => {
      if (item.type === 'folder') {
        return `<div class="srsc-file-row srsc-subfolder" data-subfolder="${escapeHtml(item.name)}"><span class="srsc-file-icon">📁</span><span class="srsc-file-main"><strong>${escapeHtml(item.name)}</strong><small>Folder</small></span><span class="srsc-file-action">Open ›</span></div>`;
      }
      return `<div class="srsc-file-row srsc-file" data-file="${escapeHtml(item.name)}" data-kind="${escapeHtml(item.kind || 'file')}" title="${escapeHtml(fileAction(item))}"><span class="srsc-file-icon">${fileIcon(item)}</span><span class="srsc-file-main"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.extension || '').replace('.', '').toUpperCase() || 'FILE'}${item.size !== undefined ? ` · ${formatFileSize(item.size)}` : ''}</small></span><span class="srsc-file-action">${fileAction(item)}</span></div>`;
    }).join('')}</div>`;

    document.getElementById('srscBackButton')?.addEventListener('click', () => goBackSrsc(id, folder, subPath));
    container.querySelectorAll('.srsc-file').forEach(row => row.addEventListener('click', () => openSrscFile(id, folder, subPath, row.dataset.file, row.dataset.kind)));
    container.querySelectorAll('.srsc-subfolder').forEach(row => row.addEventListener('click', () => openSrscFolder(id, folder, subPath ? `${subPath}/${row.dataset.subfolder}` : row.dataset.subfolder)));
  }

  function openSrscFile(id, folder, subPath, file, kind) {
    const relativeFile = subPath ? `${subPath}/${file}` : file;
    const url = `${API_SRSC_FILE_URL}?nodeId=${encodeURIComponent(id)}&folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(relativeFile)}`;
    if (kind === 'pdf' || kind === 'image') {
      window.open(url, '_blank', 'noopener');
      return;
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = file;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function loadRootNodes() {
    state.searchMode = false;
    state.currentSearchQuery = '';
    state.nodeElements.clear();
    state.nodeCache.clear();
    state.loadedParents.clear();
    state.pdfsByNodeId.clear();
    state.currentSelectedNode = null;
    el.tree.innerHTML = '<div class="loading">Loading equipment structure...</div>';

    try {
      const roots = await fetchChildren(null);
      el.tree.innerHTML = '';
      setConnection(true, 'Connected');
      if (!roots.length) {
        el.tree.innerHTML = '<div class="error">No root nodes were found.</div>';
        return;
      }

      roots.forEach(root => el.tree.appendChild(createNodeElement(root, { root: true })));
      await Promise.all([prefetchPdfForNodes(roots), loadSrscStatus(false)]);
    } catch (error) {
      console.error('Initial tree load failed:', error);
      setConnection(false, 'Connection Error');
      el.tree.innerHTML = `<div class="error"><strong>Unable to load equipment structure</strong><br><br>${escapeHtml(error.message)}</div>`;
    }
  }

  function buildSearchTree(nodes, matchIds) {
    const children = new Map();
    for (const node of nodes) {
      const p = parentId(node.ParentID);
      if (p !== null) {
        if (!children.has(p)) children.set(p, []);
        children.get(p).push(node);
      }
    }

    const matches = new Set(matchIds.map(Number));

    function buildNode(node, isRoot = false) {
      const id = nodeId(node.NodeID);
      const visibleChildren = (children.get(id) || []).sort((a, b) => Number(a.NodeID) - Number(b.NodeID));
      const searchNode = { ...node, HasChildren: visibleChildren.length ? 1 : 0 };
      const wrapper = createNodeElement(searchNode, { root: isRoot });
      const entry = state.nodeElements.get(id);
      if (matches.has(id)) entry.row.classList.add('search-match');

      if (visibleChildren.length) {
        const childContainer = document.createElement('div');
        childContainer.className = 'tree-children';
        visibleChildren.forEach(child => childContainer.appendChild(buildNode(child)));
        wrapper.appendChild(childContainer);
        const button = entry.row.querySelector('.expand-btn');
        const icon = entry.row.querySelector('.node-icon');
        button.textContent = '−';
        icon.textContent = '▾';
        button.classList.remove('empty');
        button.disabled = false;
      }
      return wrapper;
    }

    const roots = nodes.filter(node => parentId(node.ParentID) === null)
      .sort((a, b) => Number(a.NodeID) - Number(b.NodeID));
    roots.forEach(root => el.tree.appendChild(buildNode(root, true)));
  }

  async function searchTree() {
    const query = el.search.value.trim();
    state.currentSearchQuery = query;

    if (!query) {
      el.searchInfo.classList.add('hidden');
      await loadRootNodes();
      return;
    }

    el.searchInfo.textContent = 'Searching...';
    el.searchInfo.classList.remove('hidden');

    try {
      const data = await fetchJson(`${API_URL}/search?q=${encodeURIComponent(query)}`);
      const visible = data.visibleNodes || [];
      state.searchMode = true;
      state.nodeElements.clear();
      state.nodeCache.clear();
      state.loadedParents.clear();
      state.pdfsByNodeId.clear();
      visible.forEach(node => state.nodeCache.set(nodeId(node.NodeID), node));
      updateCount();
      el.tree.innerHTML = '';
      buildSearchTree(visible, data.matchIds || []);
      await Promise.all([prefetchPdfForNodes(visible), loadSrscStatus(false)]);
      state.nodeElements.forEach((entry, id) => refreshNodeStatus(id));

      const matchCount = (data.matches || []).length;
      el.searchInfo.textContent = `${matchCount.toLocaleString('en-US')} matching node${matchCount === 1 ? '' : 's'} found.`;
      const firstMatch = [...state.nodeElements.values()]
        .find(entry => (data.matchIds || []).includes(Number(entry.node.NodeID)));
      firstMatch?.row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (error) {
      console.error('Search failed:', error);
      el.searchInfo.textContent = `Search failed: ${error.message}`;
    }
  }

  async function expandAll() {
    if (state.searchMode) {
      for (const entry of state.nodeElements.values()) await entry.setExpanded(true);
      return;
    }

    let changed = true;
    while (changed) {
      changed = false;
      const entries = [...state.nodeElements.values()];
      for (const entry of entries) {
        if (!entry.expanded && Number(entry.node.HasChildren) === 1) {
          await entry.setExpanded(true);
          changed = true;
        }
      }
    }
  }

  function collapseAll() {
    state.nodeElements.forEach(entry => entry.setExpanded(false).catch(console.error));
  }

  el.searchBtn?.addEventListener('click', searchTree);
  el.search?.addEventListener('keydown', event => {
    if (event.key === 'Enter') searchTree();
  });
  el.expandAll?.addEventListener('click', () => expandAll().catch(console.error));
  el.collapseAll?.addEventListener('click', collapseAll);

  window.DMS = {
    apiUrl: API_URL,
    state,
    loadRootNodes,
    showNodeDetails,
    refreshNodeStatus,
  };

  loadRootNodes();
})();
