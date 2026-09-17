(() => {
  'use strict';

  const tree = document.getElementById('treeContainer');
  const toggleButton = document.getElementById('createNewNodeBtn');

  if (!tree) {
    console.warn('Tree container was not found.');
    return;
  }

  let editMode = false;

  function getState() {
    return window.DMS && window.DMS.state ? window.DMS.state : null;
  }

  function setEditMode(value) {
    editMode = Boolean(value);
    tree.classList.toggle('create-node-mode', editMode);
    toggleButton?.classList.toggle('active', editMode);
    if (toggleButton) toggleButton.textContent = editMode ? 'Done Editing' : 'Edit Node';
  }

  toggleButton?.addEventListener('click', () => setEditMode(!editMode));

  async function deleteNode(entry) {
    const state = getState();
    const node = entry?.node;
    const apiUrl = window.DMS && window.DMS.apiUrl;

    if (!node || !apiUrl) return;

    const confirmed = confirm(
      `Are you sure you want to delete this Node?\n\n` +
      `${node.NodeCode || ''} — ${node.NodeName || ''}\n\n` +
      'This action cannot be undone. Nodes with child Nodes or registered PDF records cannot be deleted.',
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `${apiUrl}/${encodeURIComponent(node.NodeID)}`,
        { method: 'DELETE' },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (state && Number(state.currentSelectedNode?.NodeID) === Number(node.NodeID)) {
        state.currentSelectedNode = null;
        document.getElementById('nodeDetails')?.classList.add('hidden');
        document.getElementById('emptyDetails')?.classList.remove('hidden');
      }

      if (typeof window.DMS.loadRootNodes === 'function') {
        await window.DMS.loadRootNodes();
      }
    } catch (error) {
      console.error('Delete Node failed:', error);
      alert(error instanceof Error ? error.message : 'Unable to delete the Node.');
    }
  }

  function attachActionButtons(entry) {
    if (!entry?.row || !entry.node) return;

    if (entry.row.querySelector(':scope > .node-edit-actions')) return;

    const wrap = document.createElement('div');
    wrap.className = 'node-edit-actions';

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'node-add-btn';
    addButton.textContent = '+';
    addButton.title = 'Add Child Node';
    addButton.setAttribute('aria-label', 'Add Child Node');
    addButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.DMS.openCreateChildModal?.(entry.node);
    });

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'node-edit-btn';
    editButton.textContent = '✎';
    editButton.title = 'Edit Node';
    editButton.setAttribute('aria-label', 'Edit Node');
    editButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.DMS.openEditFieldsModal?.(entry.node);
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'node-delete-btn';
    deleteButton.textContent = '×';
    deleteButton.title = 'Delete Node';
    deleteButton.setAttribute('aria-label', 'Delete Node');
    deleteButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteNode(entry);
    });

    wrap.append(addButton, editButton, deleteButton);
    entry.row.appendChild(wrap);
  }

  function refreshActionButtons() {
    const state = getState();
    if (!state?.nodeElements) return;

    state.nodeElements.forEach((entry) => {
      attachActionButtons(entry);
    });
  }

  const observer = new MutationObserver(() => {
    refreshActionButtons();
  });

  observer.observe(tree, {
    childList: true,
    subtree: true,
  });

  window.DMS = window.DMS || {};
  window.DMS.refreshActionButtons = refreshActionButtons;

  refreshActionButtons();
})();
