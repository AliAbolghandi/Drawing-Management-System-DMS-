(() => {
  'use strict';

  const host = window.location.hostname || 'localhost';
  const API = `http://${host}:3000/api`;
  let selectedNode = null;
  let allRequests = [];
  let pendingModalAction = null;

  const $ = id => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;')
      .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function formatDate(value) {
    return window.DMSDate ? window.DMSDate.format(value) : (value ? String(value) : '-');
  }

  function displayUserName(name, family, username) {
    const fullName = [name, family].map(value => String(value || '').trim()).filter(Boolean).join(' ');
    return fullName || username || '-';
  }

  function workflowActorName(item, request) {
    const actorFullName = displayUserName(item.ActionByName, item.ActionByFamily, '');
    if (actorFullName !== '-') return actorFullName;
    const code = String(item.ActionCode || '').toUpperCase();
    if (code === 'REQUEST_CREATED' || code === 'REQUEST_CANCELLED') {
      return displayUserName(request.RequesterName, request.RequesterFamily, item.ActionByUsername || request.RequesterUsername);
    }
    if (code.startsWith('MANAGER_')) {
      return displayUserName(request.ManagerName, request.ManagerFamily, item.ActionByUsername || request.ManagerUsername);
    }
    if (code.startsWith('EXPERT_') || code === 'WORK_COMPLETED') {
      return displayUserName(request.AssignedDrawingExpertName, request.AssignedDrawingExpertFamily, item.ActionByUsername || request.AssignedDrawingExpertUsername);
    }
    return item.ActionByUsername || '-';
  }

  function hasPermission(code) {
    return window.DMS?.permissions instanceof Set && window.DMS.permissions.has(code);
  }

  function setRequestButtonVisibility() {
    const btn = $('addRequestBtn');
    if (!btn) return;
    const allowed = hasPermission('REQUEST_DRAWING_CREATE');
    // Keep the requested control visible; effective RolePermission still decides
    // whether it can be used, and the API remains the final authorization check.
    btn.disabled = !allowed;
    btn.title = allowed ? '' : 'Your RolePermission does not include REQUEST_DRAWING_CREATE.';
    btn.setAttribute('aria-disabled', String(!allowed));
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, { credentials:'include', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function loadCurrentUser() {
    try {
      const data = await requestJson(`${API}/auth/me`);
      const u = data.user || {};
      $('rwUserName').textContent = [u.name, u.family].filter(Boolean).join(' ') || u.username || '-';
      $('rwUserUsername').textContent = u.username ? `Username: ${u.username}` : '';
      window.DMS = window.DMS || {};
      window.DMS.permissions = new Set(data.permissions || []);
      window.DMS.user = u;
      setRequestButtonVisibility();
      return data;
    } catch (e) {
      console.error('Worklist user load failed:', e);
      return null;
    }
  }

  function openSidebar() {
    $('rwSidebar')?.classList.add('open');
    $('rwOverlay')?.classList.add('open');
    $('rwSidebarToggle')?.setAttribute('aria-expanded','true');
    loadWorklist();
    loadNotifications();
  }

  function closeSidebar() {
    $('rwSidebar')?.classList.remove('open');
    $('rwOverlay')?.classList.remove('open');
    $('rwSidebarToggle')?.setAttribute('aria-expanded','false');
  }

  function getRequestActions(r) {
    const s = String(r.StatusCode || '');
    const userId = Number(window.DMS?.user?.userId || 0);
    const actions = [];
    const add = (action, label, permission) => actions.push({ action, label, permission, allowed: action === 'cancel' || hasPermission(permission) });
    if (Number(r.RequesterUserID) === userId && s === 'PENDING_MANAGER') add('cancel','Cancel Request','REQUEST_DRAWING_CANCEL');
    if (Number(r.ManagerUserID) === userId && s === 'PENDING_MANAGER') {
      add('approve','Approve','REQUEST_DRAWING_APPROVE');
      add('reject','Reject','REQUEST_DRAWING_REJECT');
    }
    if (['PENDING_DRAWING_APPROVAL','EXPERT_REJECTED','TRANSFERRED','RETURNED_FOR_CORRECTION'].includes(s)) {
      add('assign','Refer to Expert','REQUEST_DRAWING_ASSIGN');
      add('final-reject','Reject Request','REQUEST_DRAWING_FINAL_REJECT');
    }
    if (Number(r.AssignedDrawingExpertID) === userId) {
      if (['ASSIGNED','TRANSFERRED'].includes(s)) add('accept','Accept Work','REQUEST_DRAWING_ACCEPT');
      if (['ASSIGNED','IN_PROGRESS','RETURNED_FOR_CORRECTION'].includes(s)) {
        add('transfer','Refer to Another Expert','REQUEST_DRAWING_TRANSFER');
        add('expert-reject','Reject Work','REQUEST_DRAWING_EXPERT_REJECT');
      }
      if (['IN_PROGRESS','RETURNED_FOR_CORRECTION'].includes(s)) add('complete','Complete Work','REQUEST_DRAWING_COMPLETE');
    }
    if (['PENDING_FINAL_APPROVAL','FINAL_REJECTED'].includes(s)) add('return-correction','Return for Correction','REQUEST_DRAWING_RETURN_CORRECTION');
    if (s === 'PENDING_FINAL_APPROVAL') add('final-approve','Final Approve','REQUEST_DRAWING_FINAL_APPROVE');
    return actions;
  }

  function getRequestColorClass(r) {
    const status = String(r.StatusCode || '').toUpperCase();
    const userId = Number(window.DMS?.user?.userId || 0);
    const isRequester = Number(r.RequesterUserID) === userId;
    const isManager = Number(r.ManagerUserID) === userId;
    const isAssignedExpert = Number(r.AssignedDrawingExpertID) === userId;
    const wasReferringExpert = r.WasPreviouslyAssignedExpert === true || Number(r.WasPreviouslyAssignedExpert) === 1;
    const canAssign = hasPermission('REQUEST_DRAWING_ASSIGN');
    const canFinalApprove = hasPermission('REQUEST_DRAWING_FINAL_APPROVE');
    const canViewAll = hasPermission('REQUEST_DRAWING_VIEW_ALL');

    if (status === 'CANCELLED') return 'rw-status-gray';
    if (status === 'FINAL_APPROVED') return 'rw-status-green';
    if (['MANAGER_REJECTED','DRAWING_APPROVAL_REJECTED','EXPERT_REJECTED','FINAL_REJECTED'].includes(status)) return 'rw-status-red';

    if (status === 'PENDING_MANAGER') {
      return (isRequester || isManager) ? 'rw-status-yellow' : 'rw-status-orange';
    }
    if (status === 'PENDING_DRAWING_APPROVAL') {
      return canAssign ? 'rw-status-yellow' : 'rw-status-green';
    }
    if (status === 'ASSIGNED') {
      return isAssignedExpert ? 'rw-status-yellow' : 'rw-status-green';
    }
    if (status === 'TRANSFERRED') {
      if (wasReferringExpert && !isAssignedExpert) return 'rw-status-gray';
      return isAssignedExpert ? 'rw-status-yellow' : 'rw-status-green';
    }
    if (status === 'IN_PROGRESS') {
      return isAssignedExpert ? 'rw-status-blue' : 'rw-status-green';
    }
    if (status === 'PENDING_FINAL_APPROVAL') {
      if (isAssignedExpert) return 'rw-status-green';
      // VIEW_ALL users see yellow only while final approval is the pending action.
      return (canFinalApprove || canViewAll) ? 'rw-status-yellow' : 'rw-status-green';
    }
    if (status === 'RETURNED_FOR_CORRECTION') {
      return isAssignedExpert ? 'rw-status-yellow' : 'rw-status-green';
    }
    return 'rw-status-orange';
  }
  function renderWorklist(requests) {
    allRequests = Array.isArray(requests) ? requests : [];
    const box = $('rwContent');
    if (!box) return;
    const search = ($('rwRequestSearch')?.value || '').trim().toLowerCase();
    const filtered = allRequests.filter(r => String(r.StatusCode || '').toUpperCase() !== 'CANCELLED' && String(r.RequestNumber || '').toLowerCase().includes(search));
    box.innerHTML = search && filtered.length === 0
      ? '<div class="rw-empty">No request number matches your search.</div>'
      : filtered.length ? filtered.map(r => {
          const isFinalApproved = String(r.StatusCode || '').toUpperCase() === 'FINAL_APPROVED';
          return `<article class="rw-request-card rw-request-list-item ${isFinalApproved ? 'rw-request-final-approved' : ''}" role="button" tabindex="0" data-open-request-id="${Number(r.RequestID)}" aria-label="Open request ${escapeHtml(r.RequestNumber)}">
            <div class="rw-request-top"><span class="rw-request-number">${escapeHtml(r.RequestNumber)}</span><span class="rw-status">${escapeHtml(r.StatusName || r.StatusCode || '-')}</span></div>
            <div class="rw-request-node"><strong>${escapeHtml(r.NodeCode || '-')}</strong> — ${escapeHtml(r.NodeName || '-')}</div>
            <div class="rw-request-meta">Requester: ${escapeHtml(displayUserName(r.RequesterName, r.RequesterFamily, r.RequesterUsername))}<br>Manager: ${escapeHtml(displayUserName(r.ManagerName, r.ManagerFamily, r.ManagerUsername))}<br>Assigned expert: ${escapeHtml(displayUserName(r.AssignedDrawingExpertName, r.AssignedDrawingExpertFamily, r.AssignedDrawingExpertUsername))}<br>Created: ${escapeHtml(formatDate(r.CreatedAt))}</div>
          </article>`;
        }).join('')
      : '<div class="rw-empty">No drawing requests.</div>';
    box.querySelectorAll('.rw-request-list-item').forEach(card => {
      const request = allRequests.find(item => Number(item.RequestID) === Number(card.dataset.openRequestId));
      if (request) card.classList.add(getRequestColorClass(request));
    });
  }

  function workflowActionTitle(actionCode) {
    const labels = {
      REQUEST_CREATED: 'Request created',
      REQUEST_CANCELLED: 'Request cancelled',
      MANAGER_APPROVED: 'Approved',
      MANAGER_REJECTED: 'Rejected',
      ASSIGNED_TO_EXPERT: 'Referred to Drawing Expert',
      EXPERT_TRANSFERRED: 'Referred to another Expert',
      EXPERT_ACCEPTED: 'Accepted work',
      EXPERT_REJECTED: 'Rejected work',
      WORK_COMPLETED: 'Work completed',
      RETURN_FOR_CORRECTION: 'Returned for correction',
      FINAL_APPROVED: 'Final approval',
      DRAWING_REJECTED: 'Drawing rejected'
    };
    return labels[String(actionCode || '').toUpperCase()] || String(actionCode || 'Workflow action').replaceAll('_', ' ');
  }

  function workflowStageTitle(item, request) {
    const code = String(item.ActionCode || '').toUpperCase();
    if (code === 'REQUEST_CREATED' || code === 'REQUEST_CANCELLED') return 'Requester';
    if (code.startsWith('MANAGER_')) return 'Manager';
    if (['ASSIGNED_TO_EXPERT','RETURN_FOR_CORRECTION','FINAL_APPROVED','DRAWING_REJECTED'].includes(code)) return 'Drawing Supervisor / Admin';
    if (code.startsWith('EXPERT_') || code === 'WORK_COMPLETED') return 'Drawing Expert';
    return item.ActionByUsername || request.RequesterUsername || 'Workflow';
  }

  function buildWorkflowTimeline(request) {
    const history = Array.isArray(request.WorkflowHistory) ? request.WorkflowHistory : [];
    const events = history.length ? history : [{
      ActionCode: 'REQUEST_CREATED',
      ActionByUsername: request.RequesterUsername,
      ActionByName: request.RequesterName,
      ActionByFamily: request.RequesterFamily,
      Comment: request.Description,
      CreatedAt: request.CreatedAt
    }];
    return `<section class="rw-workflow-timeline">
      <div class="rw-workflow-timeline-header"><h4>Step-by-step workflow</h4><span class="rw-workflow-step-count">${events.length} ${events.length === 1 ? 'step' : 'steps'}</span></div>
      <div class="rw-timeline-list">${events.map((item, index) => {
        const code = String(item.ActionCode || '').toUpperCase();
        const title = workflowStageTitle(item, request);
        const actorName = workflowActorName(item, request);
        const comment = String(item.Comment || '').trim();
        const isRejected = code.includes('REJECT');
        const isApproved = code.includes('APPROVED') || code === 'WORK_COMPLETED' || code === 'ASSIGNED_TO_EXPERT';
        const stateClass = isRejected ? 'is-rejected' : (isApproved ? 'is-approved' : '');
        return `<article class="rw-timeline-step ${stateClass}">
          <div class="rw-timeline-heading"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(workflowActionTitle(code))}</span></div>
          <div class="rw-timeline-actor">${escapeHtml(actorName)}</div>
          <time>${escapeHtml(formatDate(item.CreatedAt))}</time>
          ${comment ? `<p class="rw-timeline-comment">${escapeHtml(comment)}</p>` : '<p class="rw-timeline-no-comment">No comment provided</p>'}
        </article>${index < events.length - 1 ? '<div class="rw-timeline-arrow" aria-hidden="true">↓</div>' : ''}`;
      }).join('')}</div>
    </section>`;
  }

  function openRequestDetailsModal(requestId) {
    const r = allRequests.find(item => Number(item.RequestID) === Number(requestId));
    if (!r) return;
    const box = $('rwDetailsBody');
    if (!box) return;
    const actions = getRequestActions(r);
    const comments = Array.isArray(r.Comments) ? r.Comments : [];
    const actionsHtml = actions.length
      ? `<section class="rw-details-actions"><h4>Available Actions</h4><div class="rw-action-row">${actions.map(a => `<button type="button" class="rw-action-btn" data-details-action="${a.action}" data-request-id="${Number(r.RequestID)}" data-required-permission="${escapeHtml(a.permission)}"${a.allowed ? '' : ' disabled aria-disabled="true"'}${a.allowed ? '' : ` title="Permission required: ${escapeHtml(a.permission)}"`}>${escapeHtml(a.label)}</button>`).join('')}</div></section>`
      : '<div class="rw-details-no-actions">No actions are available for your account at this workflow stage.</div>';


    box.innerHTML = `
      <div class="rw-details-request-number">${escapeHtml(r.RequestNumber || '-')}</div>
      <div class="rw-details-status-row"><span class="rw-details-status-label">STATUS</span><span class="rw-details-status">${escapeHtml(r.StatusName || r.StatusCode || '-')}</span></div>
      <section class="rw-details-location-section">
        <div class="rw-details-location"><button type="button" class="rw-submit" id="rwShowNodeLocation" data-node-id="${Number(r.NodeID)}" data-node-code="${escapeHtml(r.NodeCode || '')}">Show location in tree</button><span id="rwNodeLocationMessage" role="status"></span></div>
        <div class="rw-node-path" id="rwRequestNodePath"><div class="rw-node-path-loading">Loading node path…</div></div>
      </section>
      ${actionsHtml}
      ${buildWorkflowTimeline(r)}`;
    $('rwDetailsTitle').textContent = 'Drawing Request Details';
    $('rwDetailsModal')?.classList.remove('hidden');

    requestJson(`${API}/node-hierarchy/${Number(r.NodeID)}/full`)
      .then(data => {
        const pathBox = $('rwRequestNodePath');
        if (!pathBox || !data || !Array.isArray(data.hierarchy)) return;
        pathBox.innerHTML = data.hierarchy.length
          ? `<div class="rw-node-path-title">Node path</div><div class="rw-node-path-tree">${data.hierarchy.map((node, index) => `<div class="rw-node-path-item ${index === data.hierarchy.length - 1 ? 'is-current' : ''}" style="--node-depth:${index}"><span class="rw-node-path-branch" aria-hidden="true">${index === data.hierarchy.length - 1 ? '└' : '├'}</span><span class="rw-node-path-label"><strong>${escapeHtml(node.nodeCode || '-')}</strong><span>${escapeHtml(node.nodeName || '-')}</span></span></div>`).join('')}</div>`
          : '<div class="rw-node-path-loading">Node path is unavailable.</div>';
      })
      .catch(() => {
        const pathBox = $('rwRequestNodePath');
        if (pathBox) pathBox.innerHTML = `<div class="rw-node-path-title">Node path</div><div class="rw-node-path-item is-current"><span class="rw-node-path-label"><strong>${escapeHtml(r.NodeCode || '-')}</strong><span>${escapeHtml(r.NodeName || '-')}</span></span></div>`;
      });
  }

  function closeRequestDetailsModal() {
    $('rwDetailsModal')?.classList.add('hidden');
  }

  const actionLabels = {
    cancel: 'Cancel Drawing Request', approve: 'Approve Drawing Request', reject: 'Reject Drawing Request',
    assign: 'Refer Request to Drawing Expert', transfer: 'Transfer to Another Expert',
    accept: 'Accept Drawing Work', 'expert-reject': 'Reject Drawing Work', complete: 'Complete Drawing Work',
    'return-correction': 'Return for Correction', 'final-approve': 'Final Approval', 'final-reject': 'Reject Drawing Request'
  };

  function openActionModal(action, requestId) {
    const request = allRequests.find(r => Number(r.RequestID) === Number(requestId));
    if (!request) return;
    pendingModalAction = { action, requestId: Number(requestId), requestNumber: request.RequestNumber };
    $('rwActionTitle').textContent = actionLabels[action] || 'Drawing Request Action';
    $('rwActionPrompt').textContent = `Request ${request.RequestNumber}. Review the action, add a comment if needed, then continue.`;
    $('rwActionComment').value = '';
    $('rwActionError').textContent = '';
    const expertField = $('rwActionExpertField');
    if (expertField) expertField.classList.toggle('hidden', !['assign', 'transfer'].includes(action));
    if ($('rwActionExpertUsername')) $('rwActionExpertUsername').value = '';
    $('rwActionContinue').textContent = action === 'cancel' ? 'Confirm Cancel' : 'Continue';
    $('rwActionModal').classList.remove('hidden');
  }

  function closeActionModal() {
    $('rwActionModal')?.classList.add('hidden');
    $('rwConfirmModal')?.classList.add('hidden');
    pendingModalAction = null;
  }

  function openConfirmationModal() {
    if (!pendingModalAction) return;
    const action = pendingModalAction.action;
    $('rwConfirmTitle').textContent = `Confirm: ${actionLabels[action] || 'Drawing Request Action'}`;
    $('rwConfirmPrompt').textContent = `Are you sure you want to ${(actionLabels[action] || 'process this request').toLowerCase()} for request ${pendingModalAction.requestNumber}?`;
    $('rwConfirmYes').textContent = action === 'cancel' ? 'Confirm Cancel' : 'Confirm Action';
    $('rwConfirmError').textContent = '';
    $('rwConfirmModal').classList.remove('hidden');
  }

  async function executePendingAction() {
    if (!pendingModalAction) return;
    const { action, requestId } = pendingModalAction;
    const comment = $('rwActionComment')?.value.trim() || '';
    const expertUsername = $('rwActionExpertUsername')?.value.trim() || '';
    const isCancel = action === 'cancel';
    const yes = isCancel ? $('rwActionContinue') : $('rwConfirmYes');
    const errorBox = isCancel ? $('rwActionError') : $('rwConfirmError');
    yes.disabled = true;
    errorBox.textContent = '';
    try {
      await requestJson(`${API}/drawing-requests/${requestId}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment, expertUsername })
      });
      closeActionModal();
      await loadWorklist();
      await loadNotifications();
      if ($('rwDetailsModal') && !$('rwDetailsModal').classList.contains('hidden')) openRequestDetailsModal(requestId);
    } catch (e) {
      errorBox.textContent = e.message;
    } finally {
      yes.disabled = false;
    }
  }

  async function loadWorklist() {
    const box = $('rwContent');
    if (!box) return;
    box.innerHTML = '<div class="rw-loading">Loading worklist...</div>';
    try {
      const data = await requestJson(`${API}/drawing-requests`);
      renderWorklist(data.requests || []);
    } catch (e) {
      box.innerHTML = `<div class="rw-empty">${escapeHtml(e.message)}</div>`;
    }
  }

  async function loadNotifications() {
    try {
      const data = await requestJson(`${API}/drawing-requests/notifications`);
      const badge = $('rwNotificationBadge');
      if (badge) {
        const count = Number(data.unreadCount || 0);
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.hidden = count === 0;
      }
    } catch (e) {
      console.error('Notification load failed:', e);
    }
  }

  function openRequestModal(node) {
    if (!node) return;
    selectedNode = node;
    $('rwNodeCode').textContent = node.NodeCode || '-';
    $('rwNodeName').textContent = node.NodeName || '-';
    $('rwRequestDescription').value = '';
    $('rwRequestError').textContent = '';
    $('rwRequestModal')?.classList.remove('hidden');
    setTimeout(() => $('rwRequestDescription')?.focus(), 50);
  }

  function closeRequestModal() {
    $('rwRequestModal')?.classList.add('hidden');
    selectedNode = null;
  }

  async function submitRequest() {
    if (!selectedNode) return;
    const button = $('rwRequestSubmit');
    const description = $('rwRequestDescription')?.value.trim() || '';
    button.disabled = true;
    button.textContent = 'Submitting...';
    $('rwRequestError').textContent = '';

    try {
      const data = await requestJson(`${API}/drawing-requests`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ nodeId:Number(selectedNode.NodeID), description })
      });
      closeRequestModal();
      openSidebar();
      await loadWorklist();
      alert(`Request ${data.request?.RequestNumber || ''} was submitted successfully.`);
    } catch (e) {
      $('rwRequestError').textContent = e.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Submit Request';
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadCurrentUser();
    setRequestButtonVisibility();

    $('rwSidebarToggle')?.addEventListener('click', () => {
      if ($('rwSidebar')?.classList.contains('open')) closeSidebar(); else openSidebar();
    });
    $('rwClose')?.addEventListener('click', closeSidebar);
    $('rwOverlay')?.addEventListener('click', closeSidebar);
    $('rwWorklistButton')?.addEventListener('click', loadWorklist);
    $('rwRequestSearch')?.addEventListener('input', () => renderWorklist(allRequests));
    $('rwContent')?.addEventListener('click', event => {
      const item = event.target.closest('[data-open-request-id]');
      if (item) openRequestDetailsModal(Number(item.dataset.openRequestId));
    });
    $('rwContent')?.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const item = event.target.closest('[data-open-request-id]');
      if (!item) return;
      event.preventDefault();
      openRequestDetailsModal(Number(item.dataset.openRequestId));
    });
    $('rwDetailsClose')?.addEventListener('click', closeRequestDetailsModal);
    $('rwDetailsDone')?.addEventListener('click', closeRequestDetailsModal);
    $('rwDetailsModal')?.addEventListener('click', async event => {
      if (event.target === $('rwDetailsModal')) closeRequestDetailsModal();
      const locationButton = event.target.closest('#rwShowNodeLocation');
      if (locationButton) {
        const message = $('rwNodeLocationMessage');
        if (message) message.textContent = 'Opening node in tree...';
        try {
          if (typeof window.DMS?.revealNodeLocation !== 'function') throw new Error('Tree navigation is unavailable.');
          await window.DMS.revealNodeLocation(Number(locationButton.dataset.nodeId), locationButton.dataset.nodeCode || '');
          closeRequestDetailsModal();
        } catch (e) { if (message) message.textContent = e.message; }
        return;
      }
      const actionButton = event.target.closest('[data-details-action]');
      if (actionButton) {
        const action = actionButton.dataset.detailsAction;
        const permission = actionButton.dataset.requiredPermission;
        if (actionButton.disabled || (action !== 'cancel' && !hasPermission(permission))) {
          alert(`Permission denied: ${permission || 'required workflow permission'}.`);
          return;
        }
        openActionModal(action, Number(actionButton.dataset.requestId));
      }
    });
    $('rwContent')?.addEventListener('click', async event => {
      const b = event.target.closest('[data-request-action]');
      if (!b) return;
      if (b.disabled || (b.dataset.requestAction !== 'cancel' && !hasPermission(b.dataset.requiredPermission))) {
        alert(`Permission denied: ${b.dataset.requiredPermission || 'required workflow permission'}.`);
        return;
      }
      const action = b.dataset.requestAction;
      const requestId = Number(b.dataset.requestId);
      openActionModal(action, requestId);
    });
    $('rwActionClose')?.addEventListener('click', closeActionModal);
    $('rwActionBack')?.addEventListener('click', closeActionModal);
    $('rwActionContinue')?.addEventListener('click', () => {
      if (!pendingModalAction) return;
      if (['assign','transfer'].includes(pendingModalAction.action) && !$('rwActionExpertUsername')?.value.trim()) {
        $('rwActionError').textContent = 'Enter the active DrawingExpert username.';
        return;
      }
      if (pendingModalAction.action === 'cancel') executePendingAction();
      else openConfirmationModal();
    });
    $('rwConfirmNo')?.addEventListener('click', () => $('rwConfirmModal')?.classList.add('hidden'));
    $('rwConfirmClose')?.addEventListener('click', () => $('rwConfirmModal')?.classList.add('hidden'));
    $('rwConfirmYes')?.addEventListener('click', executePendingAction);
    $('rwLogout')?.addEventListener('click', async () => {
      $('rwLogout').disabled = true;
      try { await fetch(`${API}/auth/logout`, {method:'POST',credentials:'include'}); } catch (_) {}
      window.location.replace('login.html');
    });
    $('addRequestBtn')?.addEventListener('click', () => openRequestModal(window.DMS?.state?.currentSelectedNode));
    $('rwRequestCancel')?.addEventListener('click', closeRequestModal);
    $('rwRequestClose')?.addEventListener('click', closeRequestModal);
    $('rwRequestSubmit')?.addEventListener('click', submitRequest);
  });

  window.DMS = window.DMS || {};
  window.DMS.openDrawingRequestModal = openRequestModal;
  window.DMS.loadDrawingWorklist = loadWorklist;

  const observer = new MutationObserver(setRequestButtonVisibility);
  observer.observe(document.documentElement, {subtree:true, childList:true});
})();
