(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const modal = $('createNodeModal');
  const form = $('createNodeForm');
  const codeInput = $('createNodeCode');
  const nameInput = $('createNodeName');
  const jetInput = $('editJet');
  const normeInput = $('editNorme');
  const massInput = $('editMass');
  const activeInput = $('editIsActive');
  const errorBox = $('createNodeError');
  const cancelButton = $('createNodeCancel');
  const closeButton = $('createNodeClose');
  const submitButton = $('createNodeSubmit');
  const titleEl = $('createNodeTitle');
  const descEl = $('createNodeDesc');
  const parentField = $('createNodeParentField');
  const parentBox = $('createNodeParent');

  if (!modal || !form) {
    console.warn('Node modal UI was not found.');
    return;
  }

  let mode = 'edit'; // 'edit' updates the fields of an existing Node, 'create' adds a child Node.
  let parentNode = null;

  function getState() {
    return window.DMS && window.DMS.state ? window.DMS.state : null;
  }

  function showError(message) {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  }

  function clearError() {
    if (errorBox) errorBox.classList.add('hidden');
  }

  function closeModal() {
    modal.classList.add('hidden');
    clearError();
    form.reset();
    delete form.dataset.nodeId;
    parentNode = null;
  }

  function openEditModal(node) {
    if (!node) {
      alert('Select a Node from the tree first.');
      return;
    }

    mode = 'edit';
    parentNode = null;
    form.dataset.nodeId = String(node.NodeID);
    if (titleEl) titleEl.textContent = 'Edit Node';
    if (descEl) descEl.textContent = 'Edit the selected Node information.';
    parentField?.classList.add('hidden');
    if (codeInput) codeInput.value = node.NodeCode || '';
    if (nameInput) nameInput.value = node.NodeName || '';
    if (jetInput) jetInput.value = node.JET_Position ?? '';
    if (normeInput) normeInput.value = node.Norme ?? '';
    if (massInput) massInput.value = node.Mass ?? '';
    if (activeInput) activeInput.checked = node.IsActive === true || Number(node.IsActive) === 1;
    if (submitButton) submitButton.textContent = 'Save Changes';

    clearError();
    modal.classList.remove('hidden');
    setTimeout(() => codeInput?.focus(), 50);
  }

  function openCreateModal(parent) {
    if (!parent) return;

    mode = 'create';
    parentNode = parent;
    delete form.dataset.nodeId;
    if (titleEl) titleEl.textContent = 'Add Child Node';
    if (descEl) descEl.textContent = 'Create a new Node under the selected parent.';
    if (parentBox) parentBox.textContent = `${parent.NodeCode || ''} — ${parent.NodeName || '(Unnamed)'}`;
    parentField?.classList.remove('hidden');
    if (codeInput) codeInput.value = '';
    if (nameInput) nameInput.value = '';
    if (jetInput) jetInput.value = '';
    if (normeInput) normeInput.value = '';
    if (massInput) massInput.value = '';
    if (activeInput) activeInput.checked = true;
    if (submitButton) submitButton.textContent = 'Add Node';

    clearError();
    modal.classList.remove('hidden');
    setTimeout(() => codeInput?.focus(), 50);
  }

  cancelButton?.addEventListener('click', closeModal);
  closeButton?.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const state = getState();
    const apiUrl = window.DMS?.apiUrl;

    if (!state || !apiUrl) {
      showError('Application is not ready.');
      return;
    }

    const code = codeInput?.value.trim() || '';
    const name = nameInput?.value.trim() || '';

    if (!code || !name) {
      showError('Node Code and Node Name are required.');
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = mode === 'create' ? 'Adding...' : 'Saving...';
    }
    clearError();

    try {
      if (mode === 'create') {
        if (!parentNode) throw new Error('No parent Node was selected.');

        const body = {
          NodeCode: code,
          NodeName: name,
          ParentID: Number(parentNode.NodeID),
          JET_Position: jetInput?.value.trim() || '',
          Norme: normeInput?.value.trim() || '',
          Mass: massInput?.value.trim() || '',
          IsActive: activeInput?.checked ?? true,
        };

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

        closeModal();
        if (typeof window.DMS.loadRootNodes === 'function') {
          await window.DMS.loadRootNodes();
        }
      } else {
        const id = Number(form.dataset.nodeId);
        if (!Number.isInteger(id) || id <= 0) {
          showError('No valid Node is selected.');
          return;
        }

        const body = {
          NodeCode: code,
          NodeName: name,
          JET_Position: jetInput?.value.trim() || '',
          Norme: normeInput?.value.trim() || '',
          Mass: massInput?.value.trim() || '',
          IsActive: activeInput?.checked ?? true,
        };

        const response = await fetch(`${apiUrl}/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (!data.node) throw new Error('The server returned no updated Node.');

        const updated = data.node;
        state.nodeCache?.set(id, updated);
        const entry = state.nodeElements?.get(id);
        if (entry) {
          entry.node = updated;
          const codeEl = entry.row?.querySelector('.code');
          const nameEl = entry.row?.querySelector('.desc');
          if (codeEl) codeEl.textContent = updated.NodeCode || '';
          if (nameEl) nameEl.textContent = updated.NodeName || '(Unnamed)';
        }
        state.currentSelectedNode = updated;
        closeModal();
        document.querySelectorAll('.node-row.selected').forEach((row) => row.classList.remove('selected'));
        const selectedRow = document.querySelector(`.tree-node[data-node-id="${CSS.escape(String(id))}"] .node-row`);
        selectedRow?.classList.add('selected');
        window.DMS.showNodeDetails?.(updated);
      }
    } catch (error) {
      console.error('Node save failed:', error);
      showError(error instanceof Error ? error.message : 'Unable to save the Node.');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = mode === 'create' ? 'Add Node' : 'Save Changes';
      }
    }
  });

  window.DMS = window.DMS || {};
  window.DMS.openEditFieldsModal = openEditModal;
  window.DMS.openCreateChildModal = openCreateModal;
})();
