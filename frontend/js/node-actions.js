(() => {
  'use strict';

  const tree = document.getElementById('treeContainer');

  if (!tree) {
    console.warn('Tree container was not found.');
    return;
  }

  function getState() {
    return window.DMS && window.DMS.state ? window.DMS.state : null;
  }

  async function deleteNode(entry) {
    const state = getState();
    const node = entry?.node;
    const apiUrl = window.DMS && window.DMS.apiUrl;

    if (!node || !apiUrl) return;

    const confirmed = confirm(
      `Are you sure you want to delete this Node?\n\n` +
      `${node.NodeCode || ''} — ${node.NodeName || ''}\n\n` +
      'Child Nodes or registered PDF records will prevent deletion.',
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

  function attachDeleteButton(entry) {
    if (!entry?.row || !entry.node) return;
    if (entry.row.querySelector(':scope > .node-delete-btn')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'node-delete-btn';
    button.textContent = '×';
    button.title = 'Delete Node';
    button.setAttribute('aria-label', 'Delete Node');

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteNode(entry);
    });

    entry.row.appendChild(button);
  }

  function refreshDeleteButtons() {
    const state = getState();
    if (!state?.nodeElements) return;

    state.nodeElements.forEach((entry) => {
      attachDeleteButton(entry);
    });
  }

  const observer = new MutationObserver(() => {
    refreshDeleteButtons();
  });

  observer.observe(tree, {
    childList: true,
    subtree: true,
  });

  window.DMS = window.DMS || {};
  window.DMS.refreshDeleteButtons = refreshDeleteButtons;

  refreshDeleteButtons();
})();
