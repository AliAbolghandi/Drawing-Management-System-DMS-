(() => {
  'use strict';

  const API = `${window.DMS_API_BASE || ''}/api`;
  const CROP_SIZE = 280;
  const OUTPUT_SIZE = 512;
  let pendingPhotoBlob = null, pendingPhotoRemoval = false, stagedPhotoUrl = null;
  let cropObjectUrl = null, cropImage = null, cropBaseScale = 1, cropZoom = 1, cropX = 0, cropY = 0;
  let cropDragging = false, cropDragStartX = 0, cropDragStartY = 0, cropStartX = 0, cropStartY = 0;

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function injectStyles() {
    if (document.getElementById('dms-profile-style')) return;
    const style = document.createElement('style');
    style.id = 'dms-profile-style';
    style.textContent = `
      .user-menu-panel .profile-menu-button{display:block;width:100%;padding:9px 12px;margin:4px 0;border:1px solid rgba(111,227,255,.14);background:rgba(111,227,255,.05);color:inherit;border-radius:6px;text-align:left;cursor:pointer;font:inherit}.user-menu-panel .profile-menu-button:hover{background:rgba(111,227,255,.1)}
      .dms-profile-modal{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(5,10,15,.76)}.dms-profile-modal.hidden{display:none}.dms-profile-dialog{width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;background:var(--panel,#101820);border:1px solid rgba(111,227,255,.18);box-shadow:0 20px 60px rgba(0,0,0,.45);border-radius:10px;color:var(--text,#eef4f7)}.dms-profile-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid rgba(255,255,255,.08)}.dms-profile-head h2{margin:0;font-size:20px}.dms-profile-close{border:0;background:transparent;color:inherit;font-size:26px;cursor:pointer}.dms-profile-body{padding:22px}.dms-profile-hero{display:grid;grid-template-columns:150px 1fr;gap:24px;align-items:center;padding-bottom:22px;border-bottom:1px solid rgba(255,255,255,.08)}.dms-profile-photo-wrap{text-align:center}.dms-profile-photo{width:126px;height:126px;border-radius:50%;object-fit:cover;border:3px solid rgba(111,227,255,.35);background:#18242d;display:block;margin:0 auto 10px}.dms-profile-photo-fallback{display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:700;color:#dff8ff}.dms-profile-photo>img{width:100%;height:100%;display:block;object-fit:cover;border-radius:50%}.dms-profile-photo-actions{display:flex;gap:10px;align-items:center;justify-content:center}.dms-profile-photo-actions button{display:inline-flex;align-items:center;justify-content:center;gap:5px;font:inherit;font-size:12px;cursor:pointer}.dms-profile-photo-edit{width:32px;height:30px;padding:0;border:1px solid rgba(111,227,255,.3);border-radius:6px;background:rgba(111,227,255,.08);color:inherit}.dms-profile-photo-remove{padding:5px 7px;border:1px solid rgba(239,107,107,.28);border-radius:6px;background:rgba(239,107,107,.07);color:#ffb1b1}.dms-profile-photo-actions svg,.dms-password-toggle svg{width:17px;height:17px;display:block;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.dms-password-row{position:relative;display:block}.dms-password-row input{padding-right:42px!important}.dms-password-toggle{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--muted,#9aaab5);border-radius:5px;padding:0;cursor:pointer}.dms-password-toggle:hover{color:var(--text,#eef4f7);background:rgba(255,255,255,.06)}.dms-password-toggle:focus-visible,.dms-profile-photo-actions button:focus-visible{outline:2px solid rgba(111,227,255,.65);outline-offset:2px}.dms-profile-identity h3{margin:0 0 6px;font-size:24px}.dms-profile-identity p{margin:4px 0;color:var(--muted,#9aaab5)}.dms-profile-section{margin-top:22px}.dms-profile-section h3{font-size:14px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 14px;color:var(--muted,#9aaab5)}.dms-profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.dms-profile-field{display:flex;flex-direction:column;gap:6px}.dms-profile-field.full{grid-column:1/-1}.dms-profile-field label{font-size:12px;color:var(--muted,#9aaab5)}.dms-profile-field input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(0,0,0,.16);color:inherit;font:inherit}.dms-profile-field input:focus{outline:2px solid rgba(111,227,255,.28);border-color:rgba(111,227,255,.55)}.dms-profile-field input[readonly]{opacity:.7}.dms-password-row{display:grid;grid-template-columns:1fr auto;gap:8px}.dms-password-toggle{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:inherit;border-radius:6px;padding:0 12px;cursor:pointer}.dms-password-note{font-size:11px;color:var(--muted,#9aaab5)}.dms-password-strength{height:5px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:5px}.dms-password-strength span{display:block;height:100%;width:0;background:var(--ok,#6fe39b);transition:width .15s ease}.dms-profile-error,.dms-profile-success{padding:9px 11px;border-radius:6px;margin-top:14px;font-size:13px}.dms-profile-error{background:rgba(239,107,107,.1);color:#ffb1b1}.dms-profile-success{background:rgba(111,227,155,.1);color:#9ff0ba}.dms-profile-footer{display:flex;justify-content:flex-end;gap:9px;margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08)}.dms-profile-footer button{padding:9px 16px;border-radius:6px;font:inherit;cursor:pointer}.dms-profile-cancel{background:transparent;color:inherit;border:1px solid rgba(255,255,255,.12)}.dms-profile-save{background:rgba(111,227,255,.14);color:#dff8ff;border:1px solid rgba(111,227,255,.35)}
      @media(max-width:650px){.dms-profile-hero,.dms-profile-grid{grid-template-columns:1fr}.dms-profile-photo-wrap{text-align:left}.dms-profile-photo{margin-left:0}.dms-profile-photo-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
    style.textContent += '\n#dmsProfilePasswordConfirmModal{z-index:3010}.dms-profile-password-open{padding:9px 14px;border:1px solid var(--cyan-dim);background:rgba(111,227,255,.08);color:inherit;border-radius:6px;font:inherit;cursor:pointer}.dms-profile-password-open:hover{background:rgba(111,227,255,.14)}.dms-profile-hint{font-size:12px;color:var(--muted,#9aaab5);margin:9px 0 0}.dms-profile-password-dialog{max-height:calc(100vh - 48px);overflow:auto}.dms-profile-password-dialog .dms-profile-grid{margin-top:18px}.dms-password-row{display:block!important}.dms-password-toggle{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:32px;height:32px;padding:0;border:0;background:transparent;display:flex;align-items:center;justify-content:center}.dms-profile-avatar{overflow:hidden;flex:none}.dms-profile-avatar img{width:100%;height:100%;min-width:0;min-height:0;display:block;object-fit:cover;border-radius:50%}.dms-profile-crop-dialog,.dms-profile-confirm-dialog{width:min(460px,calc(100vw - 32px));padding:20px;background:var(--panel,#122a47);border:1px solid var(--line-strong);border-radius:10px;color:var(--text);box-shadow:0 20px 60px rgba(0,0,0,.45)}.dms-profile-crop-viewport{position:relative;width:min(280px,calc(100vw - 80px));height:min(280px,calc(100vw - 80px));margin:18px auto;overflow:hidden;border-radius:50%;background:#081523;border:2px solid var(--cyan-dim);touch-action:none;cursor:grab}.dms-profile-crop-viewport.dragging{cursor:grabbing}.dms-profile-crop-image{position:absolute;left:50%;top:50%;max-width:none;max-height:none;user-select:none;-webkit-user-drag:none;pointer-events:none}.dms-profile-crop-hint,.dms-profile-confirm-dialog p{color:var(--muted,#9aaab5);font-size:12px;line-height:1.5}.dms-profile-zoom{display:flex;align-items:center;gap:12px;margin:12px 0}.dms-profile-zoom input{width:100%;accent-color:var(--cyan)}.dms-profile-crop-actions,.dms-profile-confirm-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.dms-profile-crop-actions button,.dms-profile-confirm-actions button{padding:9px 14px;border-radius:6px;font:inherit;cursor:pointer}.dms-profile-crop-cancel,.dms-profile-confirm-cancel{background:transparent;color:inherit;border:1px solid var(--line-strong)}.dms-profile-crop-apply,.dms-profile-confirm-yes{background:rgba(111,227,255,.14);color:#dff8ff;border:1px solid var(--cyan-dim)}.dms-profile-confirm-dialog{width:min(430px,calc(100vw - 32px));padding:22px}.dms-profile-confirm-dialog h3{margin:0 0 10px}.dms-profile-confirm-dialog p{font-size:14px}.dms-profile-confirm-yes:disabled{opacity:.6;cursor:wait}';
  }

  function buildModal() {
    if (document.getElementById('dmsProfileModal')) return;
    const modal = document.createElement('div');
    modal.id = 'dmsProfileModal';
    modal.className = 'dms-profile-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'dmsProfileTitle');
    modal.innerHTML = `
      <div class="dms-profile-dialog">
        <div class="dms-profile-head"><h2 id="dmsProfileTitle">Profile</h2><button type="button" class="dms-profile-close" id="dmsProfileClose" aria-label="Close">×</button></div>
        <form id="dmsProfileForm" class="dms-profile-body">
          <div class="dms-profile-hero">
            <div class="dms-profile-photo-wrap"><div id="dmsProfilePhoto" class="dms-profile-photo dms-profile-photo-fallback">U</div><div class="dms-profile-photo-actions"><button type="button" class="dms-profile-photo-edit" id="dmsProfileChoosePhoto" aria-label="Edit profile photo" title="Edit profile photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button type="button" class="dms-profile-photo-remove" id="dmsProfileRemovePhoto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg><span>Remove</span></button></div><input id="dmsProfilePhotoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden></div>
            <div class="dms-profile-identity"><h3 id="dmsProfileFullName">User</h3><p>Username: <strong id="dmsProfileUsername">-</strong></p><p>Role: <strong id="dmsProfileRoleValue">-</strong></p><p>Last Visit: <strong id="dmsProfileLastVisit">-</strong></p></div>
          </div>
          <section class="dms-profile-section"><h3>Personal Information</h3><div class="dms-profile-grid"><div class="dms-profile-field"><label for="dmsProfileNameInput">Name</label><input id="dmsProfileNameInput" maxlength="100" autocomplete="given-name"></div><div class="dms-profile-field"><label for="dmsProfileFamilyInput">Family</label><input id="dmsProfileFamilyInput" maxlength="100" autocomplete="family-name"></div><div class="dms-profile-field"><label>Username</label><input id="dmsProfileUsernameInput" readonly></div><div class="dms-profile-field"><label>Role</label><input id="dmsProfileRoleInput" readonly></div></div></section>
          <section class="dms-profile-section"><h3>Security</h3><button type="button" class="dms-profile-password-open" id="dmsProfileChangePassword">Change Password</button></section>
          <div id="dmsProfileMessage" hidden></div><div class="dms-profile-footer"><button type="button" class="dms-profile-cancel" id="dmsProfileCancel">Cancel</button><button type="submit" class="dms-profile-save" id="dmsProfileSave">Save Changes</button></div>
        </form>
      </div>`;
    document.body.appendChild(modal);
    buildCropAndConfirmModals();
  }

  function buildCropAndConfirmModals() {
    const crop = document.createElement('div');
    crop.id = 'dmsProfileCropModal'; crop.className = 'dms-profile-modal hidden';
    crop.setAttribute('role','dialog'); crop.setAttribute('aria-modal','true'); crop.setAttribute('aria-labelledby','dmsProfileCropTitle');
    crop.innerHTML = '<div class="dms-profile-crop-dialog"><div class="dms-profile-head" style="padding:0 0 14px"><h2 id="dmsProfileCropTitle">Crop profile photo</h2><button type="button" class="dms-profile-close" id="dmsProfileCropClose" aria-label="Close">×</button></div><div id="dmsProfileCropViewport" class="dms-profile-crop-viewport"><img id="dmsProfileCropImage" class="dms-profile-crop-image" alt="Image crop preview"></div><p class="dms-profile-crop-hint">Drag the image to reposition it. Use the zoom control to choose the framing.</p><label class="dms-profile-zoom" for="dmsProfileZoom"><span>Zoom</span><input id="dmsProfileZoom" type="range" min="1" max="4" step="0.01" value="1"></label><div id="dmsProfileCropError" class="dms-profile-error" hidden></div><div class="dms-profile-crop-actions"><button type="button" class="dms-profile-crop-cancel" id="dmsProfileCropCancel">Cancel</button><button type="button" class="dms-profile-crop-apply" id="dmsProfileCropApply">Use Photo</button></div></div>';
    document.body.appendChild(crop);
    const confirm = document.createElement('div');
    confirm.id = 'dmsProfileConfirmModal'; confirm.className = 'dms-profile-modal hidden';
    confirm.setAttribute('role','dialog'); confirm.setAttribute('aria-modal','true'); confirm.setAttribute('aria-labelledby','dmsProfileConfirmTitle');
    confirm.innerHTML = '<div class="dms-profile-confirm-dialog"><h3 id="dmsProfileConfirmTitle">Confirm Changes</h3><p>Are you sure you want to apply these profile changes?</p><div class="dms-profile-confirm-actions"><button type="button" class="dms-profile-confirm-cancel" id="dmsProfileConfirmCancel">Cancel</button><button type="button" class="dms-profile-confirm-yes" id="dmsProfileConfirmYes">Yes, Save Changes</button></div></div>';
    document.body.appendChild(confirm);
    const passwordConfirm = document.createElement('div');
    passwordConfirm.id = 'dmsProfilePasswordConfirmModal'; passwordConfirm.className = 'dms-profile-modal hidden';
    passwordConfirm.setAttribute('role','dialog'); passwordConfirm.setAttribute('aria-modal','true'); passwordConfirm.setAttribute('aria-labelledby','dmsProfilePasswordConfirmTitle');
    passwordConfirm.innerHTML = '<div class="dms-profile-confirm-dialog"><h3 id="dmsProfilePasswordConfirmTitle">Confirm Password Change</h3><p>Are you sure you want to change your password?</p><div class="dms-profile-confirm-actions"><button type="button" class="dms-profile-confirm-cancel" id="dmsProfilePasswordConfirmCancel">Cancel</button><button type="button" class="dms-profile-confirm-yes" id="dmsProfilePasswordConfirmYes">Yes, Change Password</button></div></div>';
    document.body.appendChild(passwordConfirm);
    const password = document.createElement('div');
    password.id = 'dmsProfilePasswordModal'; password.className = 'dms-profile-modal hidden';
    password.setAttribute('role','dialog'); password.setAttribute('aria-modal','true'); password.setAttribute('aria-labelledby','dmsProfilePasswordTitle');
    password.innerHTML = '<div class="dms-profile-confirm-dialog dms-profile-password-dialog"><div class="dms-profile-head" style="padding:0 0 14px"><h2 id="dmsProfilePasswordTitle">Change Password</h2><button type="button" class="dms-profile-close" id="dmsProfilePasswordClose" aria-label="Close">×</button></div><div class="dms-profile-grid"><div class="dms-profile-field full"><label for="dmsCurrentPassword">Current Password</label><div class="dms-password-row"><input id="dmsCurrentPassword" type="password" autocomplete="current-password"><button type="button" class="dms-password-toggle" data-target="dmsCurrentPassword" aria-label="Show password" title="Show password"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div><div class="dms-profile-field"><label for="dmsNewPassword">New Password</label><div class="dms-password-row"><input id="dmsNewPassword" type="password" minlength="8" maxlength="256" autocomplete="new-password"><button type="button" class="dms-password-toggle" data-target="dmsNewPassword" aria-label="Show password" title="Show password"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10 7-10 7Z"/><circle cx="12" cy="12" r="3"/></svg></button></div><div class="dms-password-strength"><span id="dmsPasswordStrength"></span></div><span class="dms-password-note">Minimum 8 characters. No other composition restriction.</span></div><div class="dms-profile-field"><label for="dmsConfirmPassword">Confirm New Password</label><div class="dms-password-row"><input id="dmsConfirmPassword" type="password" minlength="8" maxlength="256" autocomplete="new-password"><button type="button" class="dms-password-toggle" data-target="dmsConfirmPassword" aria-label="Show password" title="Show password"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10 7-10 7Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div></div><div id="dmsProfilePasswordError" class="dms-profile-error" hidden></div><div class="dms-profile-confirm-actions"><button type="button" class="dms-profile-confirm-cancel" id="dmsProfilePasswordCancel">Cancel</button><button type="button" class="dms-profile-confirm-yes" id="dmsProfilePasswordDone">Done</button></div></div>';
    document.body.appendChild(password);
  }

  function formatLastVisit(value) {
    if (!value) return '-';
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
        year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
      }).formatToParts(date).reduce((o,p) => { if (p.type !== 'literal') o[p.type]=p.value; return o; }, {});
      return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
    } catch (_) { return String(value); }
  }

  async function openProfile() {
    resetStagedPhoto();
    const modal = document.getElementById('dmsProfileModal');
    if (!modal) return;
    const message = document.getElementById('dmsProfileMessage');
    message.hidden = true;
    try {
      const response = await fetch(`${API}/auth/me/profile`, { credentials: 'include', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load profile.');
      const user = data.user || {};
      document.getElementById('dmsProfileNameInput').value = user.name || '';
      document.getElementById('dmsProfileFamilyInput').value = user.family || '';
      document.getElementById('dmsProfileUsernameInput').value = user.username || '';
      document.getElementById('dmsProfileRoleInput').value = user.role || 'Signed in';
      document.getElementById('dmsProfileUsername').textContent = user.username || '-';
      document.getElementById('dmsProfileRoleValue').textContent = user.role || 'Signed in';
      document.getElementById('dmsProfileFullName').textContent = [user.name, user.family].filter(Boolean).join(' ') || user.username || 'User';
      document.getElementById('dmsProfileLastVisit').textContent = formatLastVisit(user.lastLoginAt);
      const photo = document.getElementById('dmsProfilePhoto');
      if (user.hasProfileImage) { photo.classList.remove('dms-profile-photo-fallback'); photo.innerHTML = `<img src="${API}/auth/me/profile-image?t=${Date.now()}" alt="Profile photo">`; }
      else { photo.classList.add('dms-profile-photo-fallback'); photo.textContent = (user.name || user.username || 'U').slice(0,1).toUpperCase(); }
      modal.classList.remove('hidden');
      document.getElementById('dmsProfileNameInput').focus();
    } catch (error) { alert(error.message); }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const message = document.getElementById('dmsProfileMessage');
    message.hidden = true;
    const name = document.getElementById('dmsProfileNameInput').value.trim();
    const family = document.getElementById('dmsProfileFamilyInput').value.trim();
    if (name.length > 100 || family.length > 100) return showMessage('Name and family must be 100 characters or fewer.', true);
    document.getElementById('dmsProfileConfirmModal').classList.remove('hidden');
    document.getElementById('dmsProfileConfirmYes').focus();
  }

  async function commitChanges() {
    const confirmButton = document.getElementById('dmsProfileConfirmYes');
    const saveButton = document.getElementById('dmsProfileSave');
    confirmButton.disabled = true; saveButton.disabled = true;
    document.getElementById('dmsProfileConfirmModal').classList.add('hidden');
    const name = document.getElementById('dmsProfileNameInput').value.trim();
    const family = document.getElementById('dmsProfileFamilyInput').value.trim();
    try {
      const profileResponse = await fetch(API + '/auth/me/profile', { method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,family}) });
      const profileData = await profileResponse.json().catch(() => ({}));
      if (!profileResponse.ok) throw new Error(profileData.error || 'Could not save profile.');
      if (pendingPhotoBlob) {
        const formData = new FormData(); formData.append('photo', pendingPhotoBlob, 'profile.jpg');
        const photoResponse = await fetch(API + '/auth/me/profile-image', { method:'PUT', credentials:'include', body:formData });
        const photoData = await photoResponse.json().catch(() => ({}));
        if (!photoResponse.ok) throw new Error(photoData.error || 'Could not save profile photo.');
      } else if (pendingPhotoRemoval) {
        const photoResponse = await fetch(API + '/auth/me/profile-image', { method:'DELETE', credentials:'include' });
        const photoData = await photoResponse.json().catch(() => ({}));
        if (!photoResponse.ok) throw new Error(photoData.error || 'Could not remove profile photo.');
      }
      document.getElementById('dmsProfileFullName').textContent = [name,family].filter(Boolean).join(' ') || document.getElementById('dmsProfileUsername').textContent || 'User';
      document.getElementById('dmsProfileName').textContent = [name,family].filter(Boolean).join(' ') || document.getElementById('dmsProfileUsername').textContent || 'User';
      resetStagedPhoto();
      document.getElementById('dmsProfileModal').classList.add('hidden');
      const refreshed = await fetch(API + '/auth/me/profile', { credentials:'include', cache:'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (refreshed && refreshed.user && refreshed.user.hasProfileImage) {
        setPhotoPreview(API + '/auth/me/profile-image?t=' + Date.now());
      } else {
        const photo = document.getElementById('dmsProfilePhoto');
        photo.classList.add('dms-profile-photo-fallback');
        photo.textContent = (name || document.getElementById('dmsProfileUsername').textContent || 'U').slice(0,1).toUpperCase();
        avatarFallback(name || document.getElementById('dmsProfileUsername').textContent || 'U');
      }
    } catch (error) { showMessage(error.message, true); }
    finally { confirmButton.disabled = false; saveButton.disabled = false; }
  }

  function resetStagedPhoto() {
    pendingPhotoBlob = null; pendingPhotoRemoval = false;
    if (stagedPhotoUrl) URL.revokeObjectURL(stagedPhotoUrl);
    stagedPhotoUrl = null;
  }

  function avatarFallback(value) {
    const avatar = document.getElementById('dmsProfileAvatar');
    if (avatar) avatar.textContent = (String(value || 'U').trim().slice(0,1) || 'U').toUpperCase();
  }

  function setDialogPhotoPreview(src) {
    const photo = document.getElementById('dmsProfilePhoto');
    photo.classList.remove('dms-profile-photo-fallback');
    photo.replaceChildren();
    const image = document.createElement('img'); image.alt = 'Profile photo'; image.src = src; photo.appendChild(image);
  }

  function setPhotoPreview(src) {
    setDialogPhotoPreview(src);
    const avatar = document.getElementById('dmsProfileAvatar');
    if (avatar) { avatar.replaceChildren(); const avatarImage = document.createElement('img'); avatarImage.alt = 'Profile photo'; avatarImage.src = src; avatar.appendChild(avatarImage); }
  }

  function closeCrop() {
    document.getElementById('dmsProfileCropModal').classList.add('hidden');
    cropDragging = false;
    if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
    cropObjectUrl = null; cropImage = null;
  }

  function closeProfile() {
    closeCrop();
    document.getElementById('dmsProfileConfirmModal').classList.add('hidden');
    document.getElementById('dmsProfilePasswordConfirmModal').classList.add('hidden');
    document.getElementById('dmsProfilePasswordModal').classList.add('hidden');
    document.getElementById('dmsProfileModal').classList.add('hidden');
    resetStagedPhoto();
  }

  function openCrop(file) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return showMessage('Only JPG, PNG, and WebP images are allowed.', true);
    document.getElementById('dmsProfileCropError').hidden = true;
    if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
    cropObjectUrl = URL.createObjectURL(file);
    cropImage = document.getElementById('dmsProfileCropImage');
    cropImage.onload = () => {
      document.getElementById('dmsProfileCropModal').classList.remove('hidden');
      const size = cropViewportSize();
      cropBaseScale = Math.max(size / cropImage.naturalWidth, size / cropImage.naturalHeight);
      cropZoom = 1; cropX = 0; cropY = 0; renderCrop();
    };
    cropImage.onerror = () => showMessage('The selected file is not a readable image.', true);
    cropImage.src = cropObjectUrl;
  }

  function cropViewportSize() { return Math.min(CROP_SIZE, Math.max(180, window.innerWidth - 80)); }
  function renderCrop() {
    if (!cropImage) return;
    const scale = cropBaseScale * cropZoom;
    cropImage.style.width = `${cropImage.naturalWidth * scale}px`;
    cropImage.style.height = `${cropImage.naturalHeight * scale}px`;
    cropImage.style.transform = `translate(-50%, -50%) translate(${cropX}px, ${cropY}px)`;
  }
  function applyCrop() {
    if (!cropImage) return;
    const size = cropViewportSize();
    const canvas = document.createElement('canvas'); canvas.width = OUTPUT_SIZE; canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    const scale = cropBaseScale * cropZoom;
    const drawW = cropImage.naturalWidth * scale, drawH = cropImage.naturalHeight * scale;
    const sourceX = (size / 2 - cropX - drawW / 2) / scale;
    const sourceY = (size / 2 - cropY - drawH / 2) / scale;
    const sourceSize = size / scale;
    ctx.drawImage(cropImage, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    canvas.toBlob(blob => {
      if (!blob) return showMessage('Could not create the cropped image.', true);
      pendingPhotoBlob = blob; pendingPhotoRemoval = false;
      if (stagedPhotoUrl) URL.revokeObjectURL(stagedPhotoUrl);
      stagedPhotoUrl = URL.createObjectURL(blob); setDialogPhotoPreview(stagedPhotoUrl); closeCrop();
    }, 'image/jpeg', .92);
  }
  function savePhoto(file) { if (file) openCrop(file); }
  function removePhoto() {
    pendingPhotoBlob = null; pendingPhotoRemoval = true;
    if (stagedPhotoUrl) URL.revokeObjectURL(stagedPhotoUrl); stagedPhotoUrl = null;
    const photo = document.getElementById('dmsProfilePhoto'); photo.classList.add('dms-profile-photo-fallback'); photo.textContent = (document.getElementById('dmsProfileNameInput').value || document.getElementById('dmsProfileUsername').textContent || 'U').slice(0,1).toUpperCase();
  }

  function showMessage(text, isError) {
    const message = document.getElementById('dmsProfileMessage'); message.textContent = text; message.hidden = false; message.className = isError ? 'dms-profile-error' : 'dms-profile-success';
  }

  function init() {
    injectStyles(); buildModal();
    const trigger = document.getElementById('dmsProfileMenu');
    const menu = trigger?.parentElement?.querySelector('.user-menu-panel');
    if (!trigger || !menu) return;
    fetch(`${API}/auth/me/profile`, { credentials:'include', cache:'no-store' }).then(r=>r.json()).then(data=>{
      const user=data.user||{}; const avatar=document.getElementById('dmsProfileAvatar');
      if (avatar && user.hasProfileImage) avatar.innerHTML=`<img src="${API}/auth/me/profile-image?t=${Date.now()}" alt="Profile photo">`;
    }).catch(()=>{});
    const profileButton=document.createElement('button'); profileButton.type='button'; profileButton.id='dmsProfileButton'; profileButton.className='profile-menu-button'; profileButton.textContent='Profile';
    menu.insertBefore(profileButton,document.getElementById('logoutButton'));
    profileButton.addEventListener('click',()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');openProfile();});
    document.getElementById('dmsProfileClose').addEventListener('click',closeProfile); document.getElementById('dmsProfileCancel').addEventListener('click',closeProfile);
    document.getElementById('dmsProfileModal').addEventListener('click',e=>{if(e.target.id==='dmsProfileModal')closeProfile();});
    document.getElementById('dmsProfileForm').addEventListener('submit',saveProfile);
    const passwordModal = document.getElementById('dmsProfilePasswordModal');
    const closePasswordModal = () => passwordModal.classList.add('hidden');
    document.getElementById('dmsProfileChangePassword').addEventListener('click',()=>{passwordModal.classList.remove('hidden');document.getElementById('dmsCurrentPassword').focus();});
    document.getElementById('dmsProfilePasswordClose').addEventListener('click',closePasswordModal);
    document.getElementById('dmsProfilePasswordCancel').addEventListener('click',closePasswordModal);
    passwordModal.addEventListener('click',e=>{if(e.target===passwordModal)closePasswordModal();});
    document.getElementById('dmsProfilePasswordDone').addEventListener('click',()=>{
      const current=document.getElementById('dmsCurrentPassword').value;
      const next=document.getElementById('dmsNewPassword').value;
      const confirm=document.getElementById('dmsConfirmPassword').value;
      const error=document.getElementById('dmsProfilePasswordError'); error.hidden=true;
      if(!current){error.textContent='Current password is required to change the password.';error.hidden=false;return;}
      if(next.length<8){error.textContent='New password must be at least 8 characters.';error.hidden=false;return;}
      if(next.length>256){error.textContent='New password is too long.';error.hidden=false;return;}
      if(next!==confirm){error.textContent='New password and confirmation do not match.';error.hidden=false;return;}
      document.getElementById('dmsProfilePasswordConfirmModal').classList.remove('hidden');
      document.getElementById('dmsProfilePasswordConfirmYes').focus();
    });
    document.getElementById('dmsProfilePasswordConfirmCancel').addEventListener('click',()=>document.getElementById('dmsProfilePasswordConfirmModal').classList.add('hidden'));
    document.getElementById('dmsProfilePasswordConfirmYes').addEventListener('click',async()=>{
      const button=document.getElementById('dmsProfilePasswordConfirmYes');
      const current=document.getElementById('dmsCurrentPassword').value;
      const next=document.getElementById('dmsNewPassword').value;
      button.disabled=true;
      try{
        const response=await fetch(API + '/auth/me/profile-password',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:current,newPassword:next})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error || 'Could not change password.');
        document.getElementById('dmsCurrentPassword').value='';
        document.getElementById('dmsNewPassword').value='';
        document.getElementById('dmsConfirmPassword').value='';
        document.getElementById('dmsPasswordStrength').style.width='0';
        document.getElementById('dmsProfilePasswordConfirmModal').classList.add('hidden');
        closePasswordModal();
        showMessage('Password changed successfully.', false);
      }catch(error){
        document.getElementById('dmsProfilePasswordConfirmModal').classList.add('hidden');
        const errorBox=document.getElementById('dmsProfilePasswordError'); errorBox.textContent=error.message; errorBox.hidden=false;
      }finally{button.disabled=false;}
    });
    document.getElementById('dmsProfileChoosePhoto').addEventListener('click',()=>document.getElementById('dmsProfilePhotoInput').click());
    document.getElementById('dmsProfilePhotoInput').addEventListener('change',e=>{ const file=e.target.files?.[0]; e.target.value=''; savePhoto(file); });
    document.getElementById('dmsProfileRemovePhoto').addEventListener('click',removePhoto);
    document.getElementById('dmsProfileCropClose').addEventListener('click',closeCrop);
    document.getElementById('dmsProfileCropCancel').addEventListener('click',closeCrop);
    document.getElementById('dmsProfileCropModal').addEventListener('click',e=>{if(e.target.id==='dmsProfileCropModal')closeCrop();});
    document.getElementById('dmsProfileCropApply').addEventListener('click',applyCrop);
    document.getElementById('dmsProfileZoom').addEventListener('input',e=>{cropZoom=Number(e.target.value)||1;renderCrop();});
    const cropViewport=document.getElementById('dmsProfileCropViewport');
    cropViewport.addEventListener('pointerdown',e=>{if(!cropImage)return;cropDragging=true;cropDragStartX=e.clientX;cropDragStartY=e.clientY;cropStartX=cropX;cropStartY=cropY;cropViewport.classList.add('dragging');cropViewport.setPointerCapture?.(e.pointerId);e.preventDefault();});
    cropViewport.addEventListener('pointermove',e=>{if(!cropDragging)return;cropX=cropStartX+e.clientX-cropDragStartX;cropY=cropStartY+e.clientY-cropDragStartY;renderCrop();});
    cropViewport.addEventListener('pointerup',e=>{cropDragging=false;cropViewport.classList.remove('dragging');try{cropViewport.releasePointerCapture?.(e.pointerId);}catch(_){} });
    document.getElementById('dmsProfileConfirmCancel').addEventListener('click',()=>document.getElementById('dmsProfileConfirmModal').classList.add('hidden'));
    document.getElementById('dmsProfileConfirmYes').addEventListener('click',commitChanges);
    document.querySelectorAll('.dms-password-toggle').forEach(button=>button.addEventListener('click',()=>{const input=document.getElementById(button.dataset.target);const visible=input.type==='text';input.type=visible?'password':'text';button.setAttribute('aria-label',visible?'Show password':'Hide password');button.setAttribute('title',visible?'Show password':'Hide password');}));
    document.getElementById('dmsNewPassword').addEventListener('input',e=>{const value=e.target.value;const strength=Math.min(100,Math.max(0,value.length*8 + (/[A-Z]/.test(value)?12:0)+(/[0-9]/.test(value)?12:0)+(/[^A-Za-z0-9]/.test(value)?12:0)));document.getElementById('dmsPasswordStrength').style.width=`${strength}%`;});
    document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!document.getElementById('dmsProfilePasswordConfirmModal').classList.contains('hidden'))document.getElementById('dmsProfilePasswordConfirmModal').classList.add('hidden');else if(!document.getElementById('dmsProfilePasswordModal').classList.contains('hidden'))document.getElementById('dmsProfilePasswordModal').classList.add('hidden');else if(!document.getElementById('dmsProfileCropModal').classList.contains('hidden'))closeCrop();else if(!document.getElementById('dmsProfileConfirmModal').classList.contains('hidden'))document.getElementById('dmsProfileConfirmModal').classList.add('hidden');else if(!document.getElementById('dmsProfileModal').classList.contains('hidden'))closeProfile();});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
