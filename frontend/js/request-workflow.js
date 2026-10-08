(() => {
  'use strict';

  const host = window.location.hostname || 'localhost';
  const API = `http://${host}:3000/api`;
  let selectedNode = null;

  const $ = id => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;')
      .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }

  function hasPermission(code) {
    return window.DMS?.permissions instanceof Set && window.DMS.permissions.has(code);
  }

  function setRequestButtonVisibility() {
    const btn = $('addRequestBtn');
    if (!btn) return;
    btn.classList.toggle('hidden', !hasPermission('REQUEST_DRAWING_CREATE'));
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

  function renderWorklist(requests) {
    const box = $('rwContent');
    if (!box) return;
    if (!requests.length) {
      box.innerHTML = '<div class="rw-empty">No requests are currently visible in your worklist.</div>';
      return;
    }
    box.innerHTML = requests.map(r => `
      <article class="rw-request-card">
        <div class="rw-request-top">
          <span class="rw-request-number">${escapeHtml(r.RequestNumber)}</span>
          <span class="rw-status">${escapeHtml(r.StatusName || r.StatusCode || '-')}</span>
        </div>
        <div class="rw-request-node"><strong>${escapeHtml(r.NodeCode || '-')}</strong> — ${escapeHtml(r.NodeName || '-')}</div>
        <div class="rw-request-meta">
          Requester: ${escapeHtml(r.RequesterUsername || '-')}<br>
          Manager: ${escapeHtml(r.ManagerUsername || '-')}<br>
          Created: ${escapeHtml(formatDate(r.CreatedAt))}
        </div>
        ${r.Description ? `<div class="rw-request-description">${escapeHtml(r.Description)}</div>` : ''}
      </article>
    `).join('');
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
      renderWorklist([data.request, ...((await requestJson(`${API}/drawing-requests`)).requests || [])]);
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
