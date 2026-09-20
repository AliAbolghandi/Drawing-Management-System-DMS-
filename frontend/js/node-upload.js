(() => {
  'use strict';

  const SRSC_FOLDERS = ['SLD', 'DOC', 'PIC', 'Catalog'];
  const $ = (id) => document.getElementById(id);

  const openBtn = $('uploadFilesBtn');
  const modal = $('uploadModal');
  const closeBtn = $('uploadModalClose');
  const cancelBtn = $('uploadCancelBtn');
  const submitBtn = $('uploadSubmitBtn');
  const folderChoices = $('uploadFolderChoices');
  const subPathInput = $('uploadSubPath');
  const dropZone = $('uploadDropZone');
  const browseFilesBtn = $('uploadBrowseFilesBtn');
  const browseFolderBtn = $('uploadBrowseFolderBtn');
  const fileInput = $('uploadFileInput');
  const folderInput = $('uploadFolderInput');
  const fileListBox = $('uploadFileList');
  const errorBox = $('uploadError');
  const progressWrap = $('uploadProgressWrap');
  const progressFill = $('uploadProgressFill');
  const progressText = $('uploadProgressText');

  if (!openBtn || !modal) {
    console.warn('Upload UI was not found.');
    return;
  }

  let selectedFolder = null;
  let files = []; // { file, relativePath }
  let stripOuterFolder = false;

  function getState() { return window.DMS && window.DMS.state ? window.DMS.state : null; }
  function apiBase() { return (window.DMS?.apiUrl || '').replace(/\/nodes$/, ''); }

  // When every selected file shares the same first path segment (a single dropped/browsed
  // folder), returns that segment's name; otherwise null.
  function commonTopSegment() {
    if (!files.length) return null;
    const first = files[0].relativePath.split('/')[0];
    if (!first) return null;
    return files.every(f => f.relativePath.split('/')[0] === first) ? first : null;
  }

  // Auto-suggests stripping the outer folder when its name matches the chosen target
  // (e.g. dragging/browsing the "SLD" folder itself while "SLD" is the target — the
  // bug this avoids is ending up with SLD/SLD/...). The user can still override it.
  function autoDetectStrip() {
    const top = commonTopSegment();
    stripOuterFolder = Boolean(top && selectedFolder && top.toLowerCase() === selectedFolder.toLowerCase());
  }

  function effectiveRelativePath(entry) {
    if (!stripOuterFolder) return entry.relativePath;
    const parts = entry.relativePath.split('/');
    return parts.length > 1 ? parts.slice(1).join('/') : parts[0];
  }

  function escapeHtmlLocal(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showError(message) { errorBox.textContent = message; errorBox.classList.remove('hidden'); }
  function clearError() { errorBox.classList.add('hidden'); errorBox.textContent = ''; }

  function formatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function renderFolderChoices() {
    folderChoices.innerHTML = SRSC_FOLDERS.map(name =>
      `<button type="button" class="upload-folder-pill${selectedFolder === name ? ' active' : ''}" data-folder="${name}">${name}</button>`
    ).join('');
    folderChoices.querySelectorAll('.upload-folder-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedFolder = btn.dataset.folder;
        autoDetectStrip();
        renderFolderChoices();
        renderFileList();
        updateSubmitState();
      });
    });
  }

  function renderFileList() {
    if (!files.length) { fileListBox.classList.add('hidden'); fileListBox.innerHTML = ''; return; }
    fileListBox.classList.remove('hidden');
    const totalSize = files.reduce((sum, f) => sum + (f.file.size || 0), 0);
    const shown = files.slice(0, 200);
    const topSegment = commonTopSegment();
    const stripRow = topSegment
      ? `<label class="upload-strip-row"><input type="checkbox" id="uploadStripOuter"${stripOuterFolder ? ' checked' : ''}> These files are inside an outer "${escapeHtmlLocal(topSegment)}" folder — upload its contents directly, without nesting</label>`
      : '';
    fileListBox.innerHTML =
      `<div class="upload-file-summary">${files.length} file${files.length === 1 ? '' : 's'} selected · ${formatSize(totalSize)} <button type="button" id="uploadClearBtn" class="upload-clear-btn">Clear</button></div>` +
      stripRow +
      `<div class="upload-file-rows">${shown.map((f, i) =>
        `<div class="upload-file-row"><span class="upload-file-name">${escapeHtmlLocal(f.relativePath)}</span><span class="upload-file-size">${formatSize(f.file.size)}</span><button type="button" class="upload-file-remove" data-index="${i}" aria-label="Remove">×</button></div>`
      ).join('')}${files.length > shown.length ? `<div class="upload-file-more">+ ${files.length - shown.length} more</div>` : ''}</div>`;
    $('uploadClearBtn')?.addEventListener('click', () => { files = []; renderFileList(); updateSubmitState(); });
    $('uploadStripOuter')?.addEventListener('change', (event) => { stripOuterFolder = event.target.checked; });
    fileListBox.querySelectorAll('.upload-file-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        files.splice(Number(btn.dataset.index), 1);
        autoDetectStrip();
        renderFileList();
        updateSubmitState();
      });
    });
  }

  function updateSubmitState() {
    submitBtn.disabled = !selectedFolder || files.length === 0;
  }

  function addFiles(newFiles) {
    if (!newFiles || !newFiles.length) return;
    files = files.concat(newFiles);
    if (!selectedFolder) {
      const top = commonTopSegment();
      const match = top && SRSC_FOLDERS.find(name => name.toLowerCase() === top.toLowerCase());
      if (match) selectedFolder = match;
    }
    autoDetectStrip();
    renderFolderChoices();
    renderFileList();
    updateSubmitState();
  }

  function collectFromFileList(fileList) {
    return [...fileList].map(file => ({ file, relativePath: file.webkitRelativePath || file.name }));
  }

  // Recursively walks a dropped folder (FileSystem Entry API) so folder drag-and-drop
  // preserves its structure, same as picking a folder with the Browse Folder button.
  function readEntry(entry, basePath) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(
          (file) => resolve([{ file, relativePath: basePath ? `${basePath}/${entry.name}` : entry.name }]),
          () => resolve([]),
        );
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const collected = [];
        const readBatch = () => {
          reader.readEntries((entries) => {
            if (!entries.length) {
              const childBase = basePath ? `${basePath}/${entry.name}` : entry.name;
              Promise.all(collected.map(e => readEntry(e, childBase))).then(results => resolve(results.flat()));
            } else {
              collected.push(...entries);
              readBatch(); // directories may return entries in batches
            }
          }, () => resolve([]));
        };
        readBatch();
      } else {
        resolve([]);
      }
    });
  }

  async function collectFromDataTransfer(dataTransfer) {
    const items = dataTransfer.items;
    if (items && items.length && typeof items[0].webkitGetAsEntry === 'function') {
      const entries = [...items].map(i => i.webkitGetAsEntry()).filter(Boolean);
      if (entries.length) {
        const results = await Promise.all(entries.map(e => readEntry(e, '')));
        return results.flat();
      }
    }
    return [...(dataTransfer.files || [])].map(file => ({ file, relativePath: file.name }));
  }

  function resetModal() {
    selectedFolder = null;
    files = [];
    stripOuterFolder = false;
    subPathInput.value = '';
    clearError();
    progressWrap.classList.add('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = '';
    renderFolderChoices();
    renderFileList();
    updateSubmitState();
    submitBtn.textContent = 'Upload';
  }

  function openModal() {
    const node = getState()?.currentSelectedNode;
    if (!node) { alert('Select a Node from the tree first.'); return; }

    // If the user is currently browsing an SRSC folder, use that exact location
    // as the default upload destination.
    const currentView = window.DMS?.getCurrentSrscView?.();
    const currentFolder = currentView?.type === 'folder' ? currentView.folder : null;
    const currentSubPath = currentView?.type === 'folder' ? (currentView.subPath || '') : '';

    resetModal();

    if (currentFolder) {
      const match = SRSC_FOLDERS.find(
        name => name.toLowerCase() === String(currentFolder).toLowerCase()
      );
      if (match) {
        selectedFolder = match;
        subPathInput.value = currentSubPath;
        renderFolderChoices();
        renderFileList();
        updateSubmitState();
      }
    }

    modal.classList.remove('hidden');
  }

  function closeModal() { modal.classList.add('hidden'); }

  openBtn.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });

  browseFilesBtn?.addEventListener('click', () => fileInput.click());
  browseFolderBtn?.addEventListener('click', () => folderInput.click());
  fileInput?.addEventListener('change', () => { addFiles(collectFromFileList(fileInput.files)); fileInput.value = ''; });
  folderInput?.addEventListener('change', () => { addFiles(collectFromFileList(folderInput.files)); folderInput.value = ''; });

  ['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, (event) => {
    event.preventDefault(); event.stopPropagation(); dropZone.classList.add('drag-active');
  }));
  ['dragleave', 'dragend'].forEach(evt => dropZone.addEventListener(evt, (event) => {
    event.preventDefault(); event.stopPropagation(); dropZone.classList.remove('drag-active');
  }));
  dropZone.addEventListener('drop', async (event) => {
    event.preventDefault(); event.stopPropagation();
    dropZone.classList.remove('drag-active');
    try { addFiles(await collectFromDataTransfer(event.dataTransfer)); }
    catch (error) { console.error('Drop failed:', error); }
  });

  function uploadXhr(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      });
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Network error during upload.'));
      xhr.send(formData);
    });
  }

  submitBtn?.addEventListener('click', async () => {
    const node = getState()?.currentSelectedNode;
    if (!node) { showError('No Node is selected.'); return; }
    if (!selectedFolder) { showError('Choose a target folder (SLD, DOC, PIC or Catalog).'); return; }
    if (!files.length) { showError('Add at least one file.'); return; }

    clearError();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';
    progressWrap.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    const formData = new FormData();
    formData.append('folder', selectedFolder);
    formData.append('subPath', subPathInput.value.trim());
    files.forEach(f => formData.append('relativePaths', effectiveRelativePath(f)));
    files.forEach(f => formData.append('files', f.file, f.file.name));

    const nodeId = Number(node.NodeID);
    try {
      const data = await uploadXhr(`${apiBase()}/node-file-upload/${encodeURIComponent(nodeId)}`, formData, (ratio) => {
        const pct = Math.round(ratio * 100);
        progressFill.style.width = `${pct}%`;
        progressText.textContent = `${pct}%`;
      });
      progressFill.style.width = '100%';
      progressText.textContent = 'Done';
      const failed = (data.files || []).filter(f => f.error);
      closeModal();
      window.DMS.openSrscFolder?.(nodeId, data.folder, data.subPath || '');
      window.DMS.refreshSrscStatus?.(nodeId);
      if (failed.length) alert(`${data.uploaded} file(s) uploaded. ${failed.length} file(s) were skipped due to invalid paths.`);
    } catch (error) {
      console.error('Upload failed:', error);
      showError(error.message || 'Upload failed.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload';
    }
  });
})();