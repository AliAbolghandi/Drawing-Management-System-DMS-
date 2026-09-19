(() => {
  'use strict';

  const host = window.location.hostname || 'localhost';
  const API = `http://${host}:3000/api`;
  const SRSC_FOLDERS = ['SLD', 'DOC', 'PIC', 'Catalog'];

  const state = {
    nodeElements: new Map(),
    nodeCache: new Map(),
    loadedParents: new Set(),
    pdfsByNodeId: new Map(),
    srscNodeIds: new Set(),
    currentSelectedNode: null,
    currentSearchQuery: '',
    searchMode: false,
    srscEditMode: false,
  };

  const $ = id => document.getElementById(id);
  const tree = $('treeContainer');
  const searchInput = $('searchInput');
  const searchButton = $('searchBtn');
  const searchInfo = $('searchInfo');
  const nodeCount = $('nodeCount');
  const connection = $('connectionStatus');

  const toId = value => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  const toParentId = value => value === null || value === undefined || value === '' ? null : toId(value);

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

  function highlight(value) {
    const text = escapeHtml(value || '');
    if (!state.currentSearchQuery) return text || '-';
    return text.replace(new RegExp(`(${escapeRegExp(state.currentSearchQuery)})`, 'gi'), '<mark>$1</mark>');
  }

  function setConnection(ok, text) {
    connection.textContent = text || (ok ? 'Connected' : 'Connection Error');
    connection.className = `status ${ok ? 'connected' : 'disconnected'}`;
  }

  function updateCount() {
    nodeCount.textContent = `${state.nodeCache.size.toLocaleString('en-US')} loaded nodes`;
  }

  async function requestJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function getChildren(parent) {
    const key = parent === null ? 'root' : String(parent);
    if (state.loadedParents.has(key)) {
      return [...state.nodeCache.values()]
        .filter(n => toParentId(n.ParentID) === parent)
        .sort((a, b) => Number(a.NodeID) - Number(b.NodeID));
    }

    const url = parent === null ? `${API}/nodes?parentId=` : `${API}/nodes?parentId=${encodeURIComponent(parent)}`;
    const data = await requestJson(url);
    data.forEach(n => {
      const id = toId(n.NodeID);
      if (id !== null) state.nodeCache.set(id, n);
    });
    state.loadedParents.add(key);
    updateCount();
    return data;
  }

  function mergePdfs(records) {
    (records || []).forEach(pdf => {
      const id = toId(pdf.NodeID);
      if (id === null) return;
      const list = state.pdfsByNodeId.get(id) || [];
      if (!list.some(x => String(x.PDFID) === String(pdf.PDFID))) list.push(pdf);
      state.pdfsByNodeId.set(id, list);
    });
  }

  async function prefetchPdfs(nodes) {
    const ids = [...new Set(nodes.map(n => toId(n.NodeID)).filter(Boolean))];
    if (!ids.length) return;
    try {
      mergePdfs(await requestJson(`${API}/pdfs?nodeIds=${ids.join(',')}`));
      ids.forEach(refreshStatus);
    } catch (error) {
      console.error('PDF prefetch failed:', error);
    }
  }

  async function loadSrscStatus(nodes, { refresh = false } = {}) {
    const ids = [...new Set((nodes || []).map(n => toId(n.NodeID ?? n)).filter(Boolean))];
    if (!ids.length) return;
    try {
      const url = `${API}/srsc-status?nodeIds=${ids.join(',')}${refresh ? '&refresh=1' : ''}`;
      const data = await requestJson(url);
      if (refresh) ids.forEach(id => state.srscNodeIds.delete(id));
      (data.nodeIds || []).forEach(id => state.srscNodeIds.add(toId(id)));
      ids.forEach(refreshStatus);
    } catch (error) {
      console.error('SRSC status failed:', error);
    }
  }

  function refreshStatus(id) {
    const entry = state.nodeElements.get(id);
    if (!entry) return;
    const pdf = state.pdfsByNodeId.has(id);
    const srsc = state.srscNodeIds.has(id);
    entry.row.classList.toggle('has-pdf', pdf && !srsc);
    entry.row.classList.toggle('has-srsc', srsc);
    entry.row.classList.toggle('has-both', pdf && srsc);
  }

  function createLabel(node) {
    const label = document.createElement('div');
    label.className = 'node-label';
    const jet = node.JET_Position != null && String(node.JET_Position).trim() !== '' ? String(node.JET_Position).trim() : '';
    const jetHtml = jet ? `<span class="jet">${highlight(jet)}</span>` : '';
    label.innerHTML = `${jetHtml}<span class="code">${highlight(node.NodeCode)}</span><span class="node-separator">-</span><span class="desc">${highlight(node.NodeName || '(Unnamed)')}</span>`;
    return label;
  }

  function createNode(node, { root = false } = {}) {
    const id = toId(node.NodeID);
    if (id === null) throw new Error('Invalid NodeID returned by server.');

    const wrapper = document.createElement('div');
    wrapper.className = `tree-node${root ? ' root' : ''}`;
    wrapper.dataset.nodeId = String(id);

    const row = document.createElement('div');
    row.className = 'node-row';

    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'expand-btn';

    const icon = document.createElement('div');
    icon.className = 'node-icon';

    const content = document.createElement('div');
    content.className = 'node-content';
    content.appendChild(createLabel(node));
    row.append(expand, icon, content);
    wrapper.appendChild(row);

    let childrenBox = null;
    let childrenLoaded = false;
    let expanded = false;
    let hasChildren = Number(node.HasChildren) === 1;

    function updateExpand() {
      if (!hasChildren) {
        expand.textContent = '';
        expand.disabled = true;
        expand.classList.add('empty');
        icon.textContent = '▪';
        return;
      }
      expand.disabled = false;
      expand.classList.remove('empty');
      expand.textContent = expanded ? '−' : '+';
      icon.textContent = expanded ? '▾' : '▰';
    }

    async function ensureChildren() {
      if (childrenLoaded || !hasChildren) return;
      expand.disabled = true;
      try {
        const children = await getChildren(id);
        childrenLoaded = true;
        hasChildren = children.length > 0;
        if (!hasChildren) return;
        childrenBox = document.createElement('div');
        childrenBox.className = 'tree-children';
        children.forEach(child => childrenBox.appendChild(createNode(child)));
        wrapper.appendChild(childrenBox);
        await Promise.all([prefetchPdfs(children), loadSrscStatus(children)]);
      } finally {
        updateExpand();
      }
    }

    async function setExpanded(value) {
      if (value) {
        await ensureChildren();
        if (!hasChildren || !childrenBox) return;
        childrenBox.classList.remove('collapsed');
        expanded = true;
      } else {
        if (childrenBox) childrenBox.classList.add('collapsed');
        expanded = false;
      }
      updateExpand();
    }

    expand.addEventListener('click', async event => {
      event.stopPropagation();
      try { await setExpanded(!expanded); }
      catch (error) { console.error('Expand failed:', error); alert(`Unable to load child Nodes: ${error.message}`); }
    });

    row.addEventListener('click', () => {
      document.querySelectorAll('.node-row.selected').forEach(x => x.classList.remove('selected'));
      row.classList.add('selected');
      state.currentSelectedNode = node;
      showNodeDetails(node);
    });

    const entry = { node, row, wrapper, setExpanded, get expanded() { return expanded; } };
    state.nodeElements.set(id, entry);
    updateExpand();
    refreshStatus(id);
    return wrapper;
  }

  function showNodeDetails(node) {
    $('emptyDetails')?.classList.add('hidden');
    $('nodeDetails')?.classList.remove('hidden');
    $('detailName').textContent = node.NodeName || '-';
    $('detailCode').textContent = node.NodeCode || '-';
    $('detailNodeName').textContent = node.NodeName || '-';
    $('detailJet').textContent = node.JET_Position ?? '-';
    $('detailNorme').textContent = node.Norme ?? '-';
    $('detailMass').textContent = node.Mass ?? '-';
    const active = node.IsActive === true || Number(node.IsActive) === 1;
    $('detailStatus').textContent = active ? 'Active' : 'Inactive';
    $('detailStatus').className = active ? 'node-status' : 'node-status inactive';
    renderPdfs(toId(node.NodeID));
    loadSrscFolders(toId(node.NodeID));
  }

  function renderPdfs(id) {
    const box = $('pdfList');
    const pdfs = state.pdfsByNodeId.get(id) || [];
    if (!pdfs.length) { box.innerHTML = '<div class="pdf-empty">No PDF files registered.</div>'; return; }
    box.innerHTML = pdfs.map(pdf => `<div class="pdf-item" data-pdf-id="${escapeHtml(pdf.PDFID)}"><span class="pdf-icon">📄</span><span class="pdf-name">${escapeHtml(pdf.PDFName || '(Unnamed)')}</span></div>`).join('');
    box.querySelectorAll('.pdf-item').forEach(item => item.addEventListener('click', () => openPdf(item.dataset.pdfId)));
  }

  async function openPdf(id) {
    try { await requestJson(`${API}/pdf-open/${encodeURIComponent(id)}`); }
    catch (error) { alert(`Unable to open PDF: ${error.message}`); }
  }

  let currentSrscNodeId = null;
  let currentSrscView = null; // { type: 'grid' } | { type: 'folder', folder, subPath }

  function rerenderSrscView() {
    if (!currentSrscNodeId || !currentSrscView) return;
    if (currentSrscView.type === 'folder') openFolder(currentSrscNodeId, currentSrscView.folder, currentSrscView.subPath);
    else loadSrscFolders(currentSrscNodeId);
  }

  async function loadSrscFolders(id) {
    const box = $('srscContent');
    if (!box || !id) return;
    currentSrscNodeId = id;
    currentSrscView = { type: 'grid' };
    box.innerHTML = '<div class="srsc-loading">Loading company files...</div>';
    try {
      const data = await requestJson(`${API}/node-folders/${encodeURIComponent(id)}`);
      if (!data.hasFolderPath) { box.innerHTML = '<div class="srsc-empty"><strong>No SRSC folder configured</strong></div>'; return; }
      if (data.folderExists === false) { box.innerHTML = '<div class="srsc-empty srsc-warning"><strong>SRSC folder not found</strong></div>'; return; }
      const folders = SRSC_FOLDERS.map(name => (data.folders || []).find(x => x.name.toLowerCase() === name.toLowerCase())).filter(Boolean);
      if (!folders.length) { box.innerHTML = '<div class="srsc-empty"><strong>No company folders found</strong></div>'; return; }
      box.innerHTML = `<div class="srsc-folder-grid">${folders.map(f => `<button type="button" class="srsc-folder-card" data-folder="${escapeHtml(f.name)}"><span class="srsc-folder-icon">📁</span><span class="srsc-folder-name">${escapeHtml(f.name)}</span><span class="srsc-folder-arrow">›</span></button>`).join('')}</div>`;
      box.querySelectorAll('.srsc-folder-card').forEach(b => b.addEventListener('click', () => openFolder(id, b.dataset.folder)));
    } catch (error) {
      box.innerHTML = `<div class="error"><strong>Unable to load SRSC files</strong><br><br>${escapeHtml(error.message)}</div>`;
    }
  }

  async function openFolder(id, folder, subPath = '') {
    const box = $('srscContent');
    currentSrscNodeId = id;
    currentSrscView = { type: 'folder', folder, subPath };
    box.innerHTML = '<div class="srsc-loading">Loading folder...</div>';
    try {
      let url = `${API}/node-folder-files/${encodeURIComponent(id)}/${encodeURIComponent(folder)}`;
      if (subPath) url += `?subPath=${encodeURIComponent(subPath)}`;
      const data = await requestJson(url);
      renderFolder(id, folder, subPath, data.items || []);
    } catch (error) {
      box.innerHTML = `<div class="error">${escapeHtml(error.message)}</div><button type="button" class="srsc-back-button" id="srscErrorBack">← Back</button>`;
      $('srscErrorBack')?.addEventListener('click', () => loadSrscFolders(id));
    }
  }

  function renderFolder(id, folder, subPath, items) {
    const box = $('srscContent');
    const editMode = state.srscEditMode;
    const crumb = [folder, ...(subPath ? subPath.split('/') : [])].join(' / ');
    const newFolderBtn = editMode ? `<button type="button" class="srsc-new-folder-btn" id="srscNewFolderBtn">+ New Folder</button>` : '';
    const header = `<div class="srsc-browser-header"><button type="button" class="srsc-back-button" id="srscBackButton">← Back</button><div class="srsc-current-folder"><span>📁</span><strong>${escapeHtml(crumb)}</strong><small>${items.length} item${items.length === 1 ? '' : 's'}</small></div>${newFolderBtn}</div>`;
    if (!items.length) {
      box.innerHTML = `${header}<div class="srsc-empty"><strong>This folder is empty</strong></div>`;
      $('srscBackButton')?.addEventListener('click', () => backFolder(id, folder, subPath));
      $('srscNewFolderBtn')?.addEventListener('click', () => createSrscFolder(id, folder, subPath));
      return;
    }

    const icon = item => item.type === 'folder' ? '📁' : item.kind === 'pdf' ? '📄' : item.kind === 'image' ? '🖼️' : item.kind === 'cad' ? '📐' : item.kind === 'document' ? '📝' : '📎';
    const action = item => item.type === 'folder' ? 'Open' : (item.kind === 'pdf' || item.kind === 'image' ? 'Open' : 'Download');
    const size = bytes => { const n = Number(bytes); if (!Number.isFinite(n)) return ''; if (n < 1024) return `${n} B`; if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`; if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`; return `${(n / 1073741824).toFixed(1)} GB`; };
    const deleteBtn = item => editMode ? `<button type="button" class="srsc-delete-btn" data-name="${escapeHtml(item.name)}" data-type="${item.type}" title="Delete" aria-label="Delete">×</button>` : '';

    box.innerHTML = `${header}<div class="srsc-file-list">${items.map(item => item.type === 'folder'
      ? `<div class="srsc-file-row srsc-subfolder" data-subfolder="${escapeHtml(item.name)}"><span class="srsc-file-icon">${icon(item)}</span><span class="srsc-file-main"><strong>${escapeHtml(item.name)}</strong><small>Folder</small></span><span class="srsc-file-action">Open ›</span>${deleteBtn(item)}</div>`
      : `<div class="srsc-file-row srsc-file" data-file="${escapeHtml(item.name)}" data-kind="${escapeHtml(item.kind || 'file')}"><span class="srsc-file-icon">${icon(item)}</span><span class="srsc-file-main"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.extension || '').replace('.', '').toUpperCase() || 'FILE'}${item.size !== undefined ? ` · ${size(item.size)}` : ''}</small></span><span class="srsc-file-action">${action(item)}</span>${deleteBtn(item)}</div>`
    ).join('')}</div>`;

    $('srscBackButton')?.addEventListener('click', () => backFolder(id, folder, subPath));
    $('srscNewFolderBtn')?.addEventListener('click', () => createSrscFolder(id, folder, subPath));
    box.querySelectorAll('.srsc-subfolder').forEach(row => row.addEventListener('click', () => openFolder(id, folder, subPath ? `${subPath}/${row.dataset.subfolder}` : row.dataset.subfolder)));
    box.querySelectorAll('.srsc-file').forEach(row => row.addEventListener('click', () => openFile(id, folder, subPath, row.dataset.file, row.dataset.kind)));
    box.querySelectorAll('.srsc-delete-btn').forEach(btn => btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteSrscItem(id, folder, subPath, btn.dataset.name, btn.dataset.type === 'folder');
    }));
  }

  async function createSrscFolder(id, folder, subPath) {
    const name = prompt('New folder name:');
    if (!name || !name.trim()) return;
    try {
      await requestJson(`${API}/node-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: id, folder, subPath, name: name.trim() }),
      });
      openFolder(id, folder, subPath);
    } catch (error) {
      alert(`Unable to create folder: ${error.message}`);
    }
  }

  async function deleteSrscItem(id, folder, subPath, name, isFolder) {
    const warning = isFolder
      ? `Delete the folder "${name}" and everything inside it? This cannot be undone.`
      : `Delete the file "${name}"? This cannot be undone.`;
    if (!confirm(warning)) return;
    try {
      const url = `${API}/node-file?nodeId=${encodeURIComponent(id)}&folder=${encodeURIComponent(folder)}${subPath ? `&subPath=${encodeURIComponent(subPath)}` : ''}&name=${encodeURIComponent(name)}`;
      await requestJson(url, { method: 'DELETE' });
      openFolder(id, folder, subPath);
    } catch (error) {
      alert(`Unable to delete: ${error.message}`);
    }
  }

  function backFolder(id, folder, subPath) {
    if (!subPath) loadSrscFolders(id);
    else { const parts = subPath.split('/'); parts.pop(); openFolder(id, folder, parts.join('/')); }
  }

  function openFile(id, folder, subPath, file, kind) {
    const relative = subPath ? `${subPath}/${file}` : file;
    const url = `${API}/node-file?nodeId=${encodeURIComponent(id)}&folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(relative)}`;
    if (kind === 'pdf' || kind === 'image') window.open(url, '_blank', 'noopener');
    else { const a = document.createElement('a'); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove(); }
  }

  async function loadRoots() {
    state.searchMode = false;
    state.currentSearchQuery = '';
    state.nodeElements.clear(); state.nodeCache.clear(); state.loadedParents.clear(); state.pdfsByNodeId.clear();
    state.currentSelectedNode = null;
    $('emptyDetails')?.classList.remove('hidden'); $('nodeDetails')?.classList.add('hidden');
    tree.innerHTML = '<div class="loading"><div class="dms-spinner"></div><div>Loading equipment structure...</div></div>';
    try {
      const roots = await getChildren(null);
      tree.innerHTML = '';
      setConnection(true, 'Connected');
      if (!roots.length) { tree.innerHTML = '<div class="error">No root nodes were found.</div>'; return; }
      roots.forEach(root => tree.appendChild(createNode(root, { root })));
      await Promise.all([prefetchPdfs(roots), loadSrscStatus(roots)]);
    } catch (error) {
      console.error('Tree load failed:', error);
      setConnection(false, 'Connection Error');
      tree.innerHTML = `<div class="error"><strong>Unable to load equipment structure</strong><br><br>${escapeHtml(error.message)}</div>`;
    }
  }

  function clearSearchHighlights() {
    state.nodeElements.forEach(entry => {
      if (entry.row.classList.contains('search-match')) {
        entry.row.classList.remove('search-match');
        refreshNodeLabel(entry, entry.node);
      }
    });
  }

  // Expands the real ancestor chain of each match (fetching each level's actual children,
  // exactly like a normal manual expand) so the full tree stays intact; only the matches
  // themselves get flagged, nothing is hidden or pruned.
  async function revealSearchMatches(visibleNodes, matchIds) {
    const byId = new Map(visibleNodes.map(n => [toId(n.NodeID), n]));
    const matches = new Set(matchIds.map(Number));

    const paths = [...matches].map(id => {
      const chain = [];
      let cur = byId.get(id);
      while (cur) {
        chain.unshift(toId(cur.NodeID));
        const pid = toParentId(cur.ParentID);
        cur = pid !== null ? byId.get(pid) : null;
      }
      return chain;
    });

    let firstMatchEntry = null;
    for (const chain of paths) {
      for (let i = 0; i < chain.length; i++) {
        const entry = state.nodeElements.get(chain[i]);
        if (!entry) break;
        if (i === chain.length - 1) {
          entry.row.classList.add('search-match');
          refreshNodeLabel(entry, entry.node);
          if (!firstMatchEntry) firstMatchEntry = entry;
        } else if (!entry.expanded) {
          try { await entry.setExpanded(true); }
          catch (error) { console.error('Expand failed while revealing search match:', error); break; }
        }
      }
    }
    return firstMatchEntry;
  }

  async function searchTree() {
    const query = searchInput.value.trim();
    state.currentSearchQuery = query;
    clearSearchHighlights();

    if (!query) {
      state.searchMode = false;
      searchInfo.classList.add('hidden');
      return;
    }

    state.searchMode = true;
    searchInfo.innerHTML = '<div class="dms-spinner dms-spinner-inline"></div>Searching...'; searchInfo.classList.remove('hidden');
    try {
      const data = await requestJson(`${API}/nodes/search?q=${encodeURIComponent(query)}`);
      const firstMatch = await revealSearchMatches(data.visibleNodes || [], data.matchIds || []);
      await Promise.all([prefetchPdfs(data.visibleNodes || []), loadSrscStatus(data.visibleNodes || [])]);
      searchInfo.textContent = `${(data.matches || []).length.toLocaleString('en-US')} matching node${(data.matches || []).length === 1 ? '' : 's'} found.`;
      firstMatch?.row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (error) {
      console.error('Search failed:', error);
      searchInfo.textContent = `Search failed: ${error.message}`;
    }
  }

  function collapseAll() { state.nodeElements.forEach(e => e.setExpanded(false).catch(console.error)); }

  searchButton?.addEventListener('click', () => searchTree().catch(console.error));
  searchInput?.addEventListener('keydown', event => { if (event.key === 'Enter') searchTree().catch(console.error); });
  $('collapseAllBtn')?.addEventListener('click', collapseAll);

  $('DeleteFilesBtn')?.addEventListener('click', () => {
    state.srscEditMode = !state.srscEditMode;
    const btn = $('DeleteFilesBtn');
    btn?.classList.toggle('active', state.srscEditMode);
    if (btn) btn.textContent = state.srscEditMode ? 'Done' : 'Delete Files';
    rerenderSrscView();
  });

  function refreshNodeLabel(entry, node) {
    if (!entry?.row) return;
    const content = entry.row.querySelector('.node-content');
    const oldLabel = content?.querySelector('.node-label');
    if (!content || !oldLabel) return;
    content.replaceChild(createLabel(node), oldLabel);
  }

  window.DMS = {
    apiUrl: `${API}/nodes`,
    state,
    loadRootNodes: loadRoots,
    showNodeDetails,
    refreshNodeStatus: refreshStatus,
    refreshNodeLabel,
    openSrscFolder: openFolder,
    reloadSrscRoot: loadSrscFolders,
    refreshSrscStatus: (id) => loadSrscStatus([{ NodeID: id }], { refresh: true }),
    getCurrentSrscView: () => currentSrscView ? { ...currentSrscView } : null,
  };

  loadRoots();
})();
