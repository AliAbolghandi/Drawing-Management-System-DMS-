(() => {
  'use strict';

  const tree = document.getElementById('treeContainer');

  function getState() {
    return window.DMS?.state;
  }

  function attachDeleteButton(entry) {
    if (!entry?.row || entry.row.querySelector(':scope > .node-delete-btn')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'node-delete-btn';
    button.textContent = '×';
    button.title = 'Delete Node';
    button.setAttribute('aria-label', 'Delete Node');

    button.addEventListener('click', async event => {
      event.stopPropagation();
      const node = entry.node;
      if (!node) return;

      const confirmed = confirm(
        `Are you sure you want to delete this Node?\n\n${node.NodeCode || ''} — ${node.NodeName || ''}\n\nChild Nodes or registered PDF records will prevent deletion.`
      );
      if (!confirmed) return;

      button.disabled = true;
      try {
        const response = await fetch(`${window.DMS.apiUrl}/${encodeURIComponent(node.NodeID)}`, {
          method: 'DELETE',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

        const state = getState();
        if (state && Number(state.currentSelectedNode?.NodeID) === Number(node.NodeID)) {
          state.currentSelectedNode = null;
          document.getElementById('nodeDetails')?.classList.add('hidden');
          document.getElementById('emptyDetails')?.classList.remove('hidden');
        }

        await window.DMS.loadRootNodes();
      } catch (error) {
        console.error('Delete Node failed:', error);
        alert(error.message || 'Unable to delete the Node.');
      } finally {
        button.disabled = false;
      }
    });

    entry.row.appendChild(button);
  }

  function refreshDeleteButtons() {
    const state = getState();
    if (!state) return;
    state.nodeElements.forEach(attachDeleteButton);
  }

  if (tree) {
    const observer = new MutationObserver(() => refreshDeleteButtons());
    observer.observe(tree, { childList: true, subtree: true });
  }

  window.DMS = window.DMS || {};
  window.DMS.refreshDeleteButtons = refreshDeleteButtons;
  setTimeout(refreshDeleteButtons, 0);
})();
