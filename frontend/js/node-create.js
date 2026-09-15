(() => {
  'use strict';

  const button = document.getElementById('createNewNodeBtn');
  const modal = document.getElementById('createNodeModal');
  const form = document.getElementById('createNodeForm');
  const codeInput = document.getElementById('createNodeCode');
  const nameInput = document.getElementById('createNodeName');
  const jetInput = document.getElementById('editJet');
  const normeInput = document.getElementById('editNorme');
  const massInput = document.getElementById('editMass');
  const nvInput = document.getElementById('editNv');
  const activeInput = document.getElementById('editIsActive');
  const errorBox = document.getElementById('createNodeError');
  const cancelButton = document.getElementById('createNodeCancel');
  const closeButton = document.getElementById('createNodeClose');
  const submitButton = document.getElementById('createNodeSubmit');

  function dms() {
    return window.DMS?.state;
  }

  function closeModal() {
    modal?.classList.add('hidden');
    errorBox?.classList.add('hidden');
    form?.reset();
    if (form) form.dataset.nodeId = '';
  }

  function openModal(node) {
    if (!node) {
      alert('Select a Node from the tree first.');
      return;
    }

    form.dataset.nodeId = String(node.NodeID);
    codeInput.value = node.NodeCode || '';
    nameInput.value = node.NodeName || '';
    jetInput.value = node.JET_Position ?? '';
    normeInput.value = node.Norme ?? '';
    massInput.value = node.Mass ?? '';
    nvInput.value = node.nv ?? '';
    activeInput.checked = node.IsActive === true || Number(node.IsActive) === 1;
    errorBox.classList.add('hidden');
    modal.classList.remove('hidden');
    setTimeout(() => codeInput.focus(), 50);
  }

  button?.addEventListener('click', () => {
    const state = dms();
    if (!state?.currentSelectedNode) {
      alert('Select a Node from the tree first.');
      return;
    }
    openModal(state.currentSelectedNode);
  });

  cancelButton?.addEventListener('click', closeModal);
  closeButton?.addEventListener('click', closeModal);
  modal?.addEventListener('click', event => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal?.classList.contains('hidden')) closeModal();
  });

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const state = dms();
    const id = Number(form.dataset.nodeId);
    if (!state || !Number.isInteger(id) || id <= 0) {
      errorBox.textContent = 'No valid Node is selected.';
      errorBox.classList.remove('hidden');
      return;
    }

    const body = {
      NodeCode: codeInput.value.trim(),
      NodeName: nameInput.value.trim(),
      JET_Position: jetInput.value.trim(),
      Norme: normeInput.value.trim(),
      Mass: massInput.value.trim(),
      nv: nvInput.value.trim(),
      IsActive: activeInput.checked,
    };

    if (!body.NodeCode || !body.NodeName) {
      errorBox.textContent = 'Node Code and Node Name are required.';
      errorBox.classList.remove('hidden');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';
    errorBox.classList.add('hidden');

    try {
      const response = await fetch(`${window.DMS.apiUrl}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      const updated = data.node;
      if (!updated) throw new Error('The server returned no updated Node.');

      state.nodeCache.set(id, updated);
      const entry = state.nodeElements.get(id);
      if (entry) {
        entry.node = updated;
        const code = entry.row.querySelector('.code');
        const name = entry.row.querySelector('.desc');
        if (code) code.textContent = updated.NodeCode || '';
        if (name) name.textContent = updated.NodeName || '(Unnamed)';
      }
      state.currentSelectedNode = updated;

      closeModal();
      const selected = document.querySelector(`.tree-node[data-node-id="${CSS.escape(String(id))}"] .node-row`);
      if (selected) {
        document.querySelectorAll('.node-row.selected').forEach(row => row.classList.remove('selected'));
        selected.classList.add('selected');
      }
      window.DMS.showNodeDetails?.(updated);
    } catch (error) {
      console.error('Edit Node failed:', error);
      errorBox.textContent = error.message || 'Unable to save the Node.';
      errorBox.classList.remove('hidden');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Save Changes';
    }
  });
})();
