(() => {
  'use strict';

  const API = `${window.DMS_API_BASE || ''}/api`;
  const MAX_IMAGE_BYTES = 750 * 1024;

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function injectStyles() {
    if (document.getElementById('dms-profile-style')) return;
    const style = document.createElement('style');
    style.id = 'dms-profile-style';
    style.textContent = `
      .dms-profile-menu-panel .profile-menu-button{display:block;width:100%;padding:9px 12px;margin:4px 0;border:1px solid rgba(111,227,255,.14);background:rgba(111,227,255,.05);color:inherit;border-radius:6px;text-align:left;cursor:pointer;font:inherit}.dms-profile-menu-panel .profile-menu-button:hover{background:rgba(111,227,255,.1)}
      .dms-profile-modal{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(5,10,15,.76)}.dms-profile-modal.hidden{display:none}.dms-profile-dialog{width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;background:var(--panel,#101820);border:1px solid rgba(111,227,255,.18);box-shadow:0 20px 60px rgba(0,0,0,.45);border-radius:10px;color:var(--text,#eef4f7)}.dms-profile-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid rgba(255,255,255,.08)}.dms-profile-head h2{margin:0;font-size:20px}.dms-profile-close{border:0;background:transparent;color:inherit;font-size:26px;cursor:pointer}.dms-profile-body{padding:22px}.dms-profile-hero{display:grid;grid-template-columns:150px 1fr;gap:24px;align-items:center;padding-bottom:22px;border-bottom:1px solid rgba(255,255,255,.08)}.dms-profile-photo-wrap{text-align:center}.dms-profile-photo{width:126px;height:126px;border-radius:50%;object-fit:cover;border:3px solid rgba(111,227,255,.35);background:#18242d;display:block;margin:0 auto 10px}.dms-profile-photo-fallback{display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:700;color:#dff8ff}.dms-profile-photo-actions{display:flex;gap:7px;justify-content:center}.dms-profile-photo-actions button{font:inherit;font-size:12px}.dms-profile-identity h3{margin:0 0 6px;font-size:24px}.dms-profile-identity p{margin:4px 0;color:var(--muted,#9aaab5)}.dms-profile-section{margin-top:22px}.dms-profile-section h3{font-size:14px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 14px;color:var(--muted,#9aaab5)}.dms-profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.dms-profile-field{display:flex;flex-direction:column;gap:6px}.dms-profile-field.full{grid-column:1/-1}.dms-profile-field label{font-size:12px;color:var(--muted,#9aaab5)}.dms-profile-field input{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(0,0,0,.16);color:inherit;font:inherit}.dms-profile-field input:focus{outline:2px solid rgba(111,227,255,.28);border-color:rgba(111,227,255,.55)}.dms-profile-field input[readonly]{opacity:.7}.dms-password-row{display:grid;grid-template-columns:1fr auto;gap:8px}.dms-password-toggle{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:inherit;border-radius:6px;padding:0 12px;cursor:pointer}.dms-password-note{font-size:11px;color:var(--muted,#9aaab5)}.dms-password-strength{height:5px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:5px}.dms-password-strength span{display:block;height:100%;width:0;background:var(--ok,#6fe39b);transition:width .15s ease}.dms-profile-error,.dms-profile-success{padding:9px 11px;border-radius:6px;margin-top:14px;font-size:13px}.dms-profile-error{background:rgba(239,107,107,.1);color:#ffb1b1}.dms-profile-success{background:rgba(111,227,155,.1);color:#9ff0ba}.dms-profile-footer{display:flex;justify-content:flex-end;gap:9px;margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08)}.dms-profile-footer button{padding:9px 16px;border-radius:6px;font:inherit;cursor:pointer}.dms-profile-cancel{background:transparent;color:inherit;border:1px solid rgba(255,255,255,.12)}.dms-profile-save{background:rgba(111,227,255,.14);color:#dff8ff;border:1px solid rgba(111,227,255,.35)}
      @media(max-width:650px){.dms-profile-hero,.dms-profile-grid{grid-template-columns:1fr}.dms-profile-photo-wrap{text-align:left}.dms-profile-photo{margin-left:0}.dms-profile-photo-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
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
            <div class="dms-profile-photo-wrap"><div id="dmsProfilePhoto" class="dms-profile-photo dms-profile-photo-fallback">U</div><div class="dms-profile-photo-actions"><button type="button" id="dmsProfileChoosePhoto">Change Photo</button><button type="button" id="dmsProfileRemovePhoto">Remove</button></div><input id="dmsProfilePhotoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden></div>
            <div class="dms-profile-identity"><h3 id="dmsProfileFullName">User</h3><p>Username: <strong id="dmsProfileUsername">-</strong></p><p>Role: <strong id="dmsProfileRoleValue">-</strong></p><p>Last Visit: <strong id="dmsProfileLastVisit">-</strong></p></div>
          </div>
          <section class="dms-profile-section"><h3>Personal Information</h3><div class="dms-profile-grid"><div class="dms-profile-field"><label for="dmsProfileNameInput">Name</label><input id="dmsProfileNameInput" maxlength="100" autocomplete="given-name"></div><div class="dms-profile-field"><label for="dmsProfileFamilyInput">Family</label><input id="dmsProfileFamilyInput" maxlength="100" autocomplete="family-name"></div><div class="dms-profile-field"><label>Username</label><input id="dmsProfileUsernameInput" readonly></div><div class="dms-profile-field"><label>Role</label><input id="dmsProfileRoleInput" readonly></div></div></section>
          <section class="dms-profile-section"><h3>Change Password</h3><div class="dms-profile-grid"><div class="dms-profile-field full"><label for="dmsCurrentPassword">Current Password</label><div class="dms-password-row"><input id="dmsCurrentPassword" type="password" autocomplete="current-password"><button type="button" class="dms-password-toggle" data-target="dmsCurrentPassword">Show</button></div></div><div class="dms-profile-field"><label for="dmsNewPassword">New Password</label><div class="dms-password-row"><input id="dmsNewPassword" type="password" minlength="8" maxlength="256" autocomplete="new-password"><button type="button" class="dms-password-toggle" data-target="dmsNewPassword">Show</button></div><div class="dms-password-strength"><span id="dmsPasswordStrength"></span></div><span class="dms-password-note">Minimum 8 characters. No other composition restriction.</span></div><div class="dms-profile-field"><label for="dmsConfirmPassword">Confirm New Password</label><div class="dms-password-row"><input id="dmsConfirmPassword" type="password" minlength="8" maxlength="256" autocomplete="new-password"><button type="button" class="dms-password-toggle" data-target="dmsConfirmPassword">Show</button></div></div></div></section>
          <div id="dmsProfileMessage" hidden></div><div class="dms-profile-footer"><button type="button" class="dms-profile-cancel" id="dmsProfileCancel">Cancel</button><button type="submit" class="dms-profile-save" id="dmsProfileSave">Save Changes</button></div>
        </form>
      </div>`;
    document.body.appendChild(modal);
  }

  function formatLastVisit(value) {
    if (!value) return '-';
    try { return window.DMSDate?.toJalaliInput(value) || String(value); } catch (_) { return String(value); }
  }

  async function openProfile() {
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

  function closeProfile() { document.getElementById('dmsProfileModal')?.classList.add('hidden'); }

  async function saveProfile(event) {
    event.preventDefault();
    const message = document.getElementById('dmsProfileMessage');
    message.hidden = true;
    const name = document.getElementById('dmsProfileNameInput').value.trim();
    const family = document.getElementById('dmsProfileFamilyInput').value.trim();
    const currentPassword = document.getElementById('dmsCurrentPassword').value;
    const newPassword = document.getElementById('dmsNewPassword').value;
    const confirmPassword = document.getElementById('dmsConfirmPassword').value;
    if (name.length > 100 || family.length > 100) return showMessage('Name and family must be 100 characters or fewer.', true);
    if (newPassword || confirmPassword || currentPassword) {
      if (newPassword.length < 8) return showMessage('New password must be at least 8 characters.', true);
      if (newPassword.length > 256) return showMessage('New password is too long.', true);
      if (newPassword !== confirmPassword) return showMessage('New password and confirmation do not match.', true);
      if (!currentPassword) return showMessage('Current password is required to change the password.', true);
    }
    const save = document.getElementById('dmsProfileSave'); save.disabled = true;
    try {
      const profileResponse = await fetch(`${API}/auth/me/profile`, { method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,family}) });
      const profileData = await profileResponse.json().catch(() => ({}));
      if (!profileResponse.ok) throw new Error(profileData.error || 'Could not save profile.');
      if (newPassword) {
        const passwordResponse = await fetch(`${API}/auth/me/password`, { method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({currentPassword,newPassword}) });
        const passwordData = await passwordResponse.json().catch(() => ({}));
        if (!passwordResponse.ok) throw new Error(passwordData.error || 'Could not change password.');
      }
      showMessage('Profile updated successfully.', false);
      document.getElementById('dmsProfileFullName').textContent = [name,family].filter(Boolean).join(' ') || document.getElementById('dmsProfileUsername').textContent || 'User';
      document.getElementById('dmsProfileName').textContent = [name,family].filter(Boolean).join(' ') || document.getElementById('dmsProfileUsername').textContent || 'User';
      document.getElementById('dmsProfileAvatar').textContent = (name || document.getElementById('dmsProfileUsername').textContent || 'U').slice(0,1).toUpperCase();
      document.getElementById('dmsCurrentPassword').value=''; document.getElementById('dmsNewPassword').value=''; document.getElementById('dmsConfirmPassword').value='';
    } catch (error) { showMessage(error.message, true); }
    finally { save.disabled = false; }
  }

  function showMessage(text, error) { const box=document.getElementById('dmsProfileMessage'); box.textContent=text; box.className=error?'dms-profile-error':'dms-profile-success'; box.hidden=false; }

  async function savePhoto(file) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return showMessage('Only JPG, PNG, and WebP images are allowed.', true);
    if (file.size > MAX_IMAGE_BYTES) return showMessage('Profile image must be 750 KB or smaller.', true);
    const fd = new FormData(); fd.append('photo', file);
    try {
      const response = await fetch(`${API}/auth/me/profile-image`, { method:'PUT', credentials:'include', body:fd });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save profile image.');
      const photo=document.getElementById('dmsProfilePhoto'); photo.classList.remove('dms-profile-photo-fallback'); photo.innerHTML=`<img src="${API}/auth/me/profile-image?t=${Date.now()}" alt="Profile photo">`;
      document.getElementById('dmsProfileAvatar').innerHTML=`<img src="${API}/auth/me/profile-image?t=${Date.now()}" alt="Profile photo">`;
      showMessage('Profile photo updated successfully.', false);
    } catch (error) { showMessage(error.message, true); }
  }

  async function removePhoto() {
    try {
      const response=await fetch(`${API}/auth/me/profile-image`,{method:'DELETE',credentials:'include'}); const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||'Could not remove profile image.');
      const name=document.getElementById('dmsProfileNameInput').value||document.getElementById('dmsProfileUsername').textContent||'U'; const photo=document.getElementById('dmsProfilePhoto'); photo.classList.add('dms-profile-photo-fallback'); photo.textContent=name.slice(0,1).toUpperCase(); document.getElementById('dmsProfileAvatar').textContent=name.slice(0,1).toUpperCase(); showMessage('Profile photo removed.',false);
    }catch(error){showMessage(error.message,true);}
  }

  function init() {
    const menu=document.getElementById('userMenuPanel'); const trigger=document.getElementById('dmsProfileMenu');
    if(!menu||!trigger) return;
    injectStyles(); buildModal();
    const profileButton=document.createElement('button'); profileButton.type='button'; profileButton.id='dmsProfileButton'; profileButton.className='profile-menu-button'; profileButton.textContent='Profile';
    menu.insertBefore(profileButton,document.getElementById('logoutButton'));
    profileButton.addEventListener('click',()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');openProfile();});
    document.getElementById('dmsProfileClose').addEventListener('click',closeProfile); document.getElementById('dmsProfileCancel').addEventListener('click',closeProfile);
    document.getElementById('dmsProfileModal').addEventListener('click',e=>{if(e.target.id==='dmsProfileModal')closeProfile();});
    document.getElementById('dmsProfileForm').addEventListener('submit',saveProfile);
    document.getElementById('dmsProfileChoosePhoto').addEventListener('click',()=>document.getElementById('dmsProfilePhotoInput').click());
    document.getElementById('dmsProfilePhotoInput').addEventListener('change',e=>savePhoto(e.target.files?.[0]));
    document.getElementById('dmsProfileRemovePhoto').addEventListener('click',removePhoto);
    document.querySelectorAll('.dms-password-toggle').forEach(button=>button.addEventListener('click',()=>{const input=document.getElementById(button.dataset.target);const visible=input.type==='text';input.type=visible?'password':'text';button.textContent=visible?'Show':'Hide';}));
    document.getElementById('dmsNewPassword').addEventListener('input',e=>{const value=e.target.value;const strength=Math.min(100,Math.max(0,value.length*8 + (/[A-Z]/.test(value)?12:0)+(/[0-9]/.test(value)?12:0)+(/[^A-Za-z0-9]/.test(value)?12:0)));document.getElementById('dmsPasswordStrength').style.width=`${strength}%`;});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('dmsProfileModal').classList.contains('hidden'))closeProfile();});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();