(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const button = $('createNewNodeBtn');
  const modal = $('createNodeModal');
  const form = $('createNodeForm');
  const codeInput = $('createNodeCode');
  const nameInput = $('createNodeName');
  const jetInput = $('editJet');
  const normeInput = $('editNorme');
  const massInput = $('editMass');
  const nvInput = $('editNv');
  const activeInput = $('editIsActive');
  const errorBox = $('createNodeError');
  const cancelButton = $('createNodeCancel');
  const closeButton = $('createNodeClose');
  const submitButton = $('createNodeSubmit');

  if (!button || !modal || !form) {
    console.warn('Edit Node UI was not found.');
    return;
  }

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
  }

  function openModal(node) {
    if (!node) {
      alert('Select a Node from the tree first.');
      return;
    }

    form.dataset.nodeId = String(node.NodeID);

    if (codeInput) codeInput.value = node.NodeCode || '';
    if (nameInput) nameInput.value = node.NodeName || '';
    if (jetInput) jetInput.value = node.JET_Position ?? '';
    if (normeInput) normeInput.value = node.Norme ?? '';
    if (massInput) massInput.value = node.Mass ?? '';
    if (nvInput) nvInput.value = node.nv ?? '';
    if (activeInput) {
      activeInput.checked = node.IsActive === true || Number(node.IsActive) === 1;
    }

    clearError();
    modal.classList.remove('hidden');

    setTimeout(() => {
      if (codeInput) codeInput.focus();
    }, 50);
  }

  button.addEventListener('click', () => {
    const state = getState();
    openModal(state ? state.currentSelectedNode : null);
  });

  cancelButton?.addEventListener('click', closeModal);
  closeButton?.addEventListener('click', closeModal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const state = getState();
    const id = Number(form.dataset.nodeId);
    const apiUrl = window.DMS && window.DMS.apiUrl;

    if (!state || !apiUrl || !Number.isInteger(id) || id <= 0) {
      showError('No valid Node is selected.');
      return;
    }

    const body = {
      NodeCode: codeInput ? codeInput.value.trim() : '',
      NodeName: nameInput ? nameInput.value.trim() : '',
      JET_Position: jetInput ? jetInput.value.trim() : '',
      Norme: normeInput ? normeInput.value.trim() : '',
      Mass: massInput ? massInput.value.trim() : '',
      nv: nvInput ? nvInput.value.trim() : '',
      IsActive: activeInput ? activeInput.checked : true,
    };

    if (!body.NodeCode || !body.NodeName) {
      showError('Node Code and Node Name are required.');
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Saving...';
    }
    clearError();

    try {
      const response = await fetch(`${apiUrl}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const updated = data.node;
      if (!updated) {
        throw new Error('The server returned no updated Node.');
      }

      if (state.nodeCache && typeof state.nodeCache.set === 'function') {
        state.nodeCache.set(id, updated);
      }

      const entry = state.nodeElements?.get(id);
      if (entry) {
        entry.node = updated;

        const code = entry.row?.querySelector('.code');
        const name = entry.row?.querySelector('.desc');

        if (code) code.textContent = updated.NodeCode || '';
        if (name) name.textContent = updated.NodeName || '(Unnamed)';
      }

      state.currentSelectedNode = updated;

      closeModal();

      document.querySelectorAll('.node-row.selected').forEach((row) => {
        row.classList.remove('selected');
      });

      const selectedRow = document.querySelector(
        `.tree-node[data-node-id="${CSS.escape(String(id))}"] .node-row`,
      );

      selectedRow?.classList.add('selected');
      window.DMS.showNodeDetails?.(updated);
    } catch (error) {
      console.error('Edit Node failed:', error);
      showError(error instanceof Error ? error.message : 'Unable to save the Node.');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Save Changes';
      }
    }
  });
})();
