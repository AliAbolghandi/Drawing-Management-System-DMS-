(() => {
  'use strict';
  const API = `${window.DMS_API_BASE || ''}/api/auth/user-management`;
  const PERMISSION = 'DASHBOARD_USER_MANAGEMENT';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const date = v => { if(!v) return 'Never recorded'; const d=new Date(v); return Number.isNaN(d.getTime())?'—':d.toLocaleString('en-GB',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}); };
  const state = { users:[], selected:null, detail:null, tab:'overview', loading:false };
  let modal, body, trigger, returnFocus;
  async function request(url, options={}) {
    const res=await fetch(url,{credentials:'include',cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const data=await res.json().catch(()=>({}));
    if(res.status===401){window.location.replace('login.html');throw new Error('Authentication required.');}
    if(res.status===403) throw new Error('You do not have permission to manage users.');
    if(!res.ok) throw new Error(data.error||'Request failed.');
    return data;
  }
  function ensureModal(){
    if(modal)return;
    modal=document.createElement('div');modal.id='userManagementModal';modal.className='user-mgmt-modal';modal.hidden=true;
    modal.innerHTML=`<section class="user-mgmt-dialog" role="dialog" aria-modal="true" aria-labelledby="userMgmtTitle"><header class="user-mgmt-header"><div class="user-mgmt-heading"><div class="user-mgmt-heading-icon" aria-hidden="true">♙</div><div><h2 id="userMgmtTitle">User Management</h2><p>Accounts · roles · effective permissions · audit activity</p></div></div><button type="button" class="user-mgmt-close" aria-label="Close user management">×</button></header><div class="user-mgmt-body" id="userMgmtBody"></div></section>`;
    document.body.append(modal);body=$('userMgmtBody');
    modal.querySelector('.user-mgmt-close').addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    modal.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const els=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(x=>!x.hidden);if(!els.length)return;const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  }
  function open(){ensureModal();returnFocus=document.activeElement;modal.hidden=false;document.body.style.overflow='hidden';renderList();modal.querySelector('.user-mgmt-close').focus();}
  function close(){if(!modal||modal.hidden)return;modal.hidden=true;document.body.style.overflow='';if(returnFocus?.focus)returnFocus.focus();}
  function status(active){return Number(active)===1||active===true?'<span class="user-mgmt-status active">Active</span>':'<span class="user-mgmt-status inactive">Inactive</span>';}
  function fullName(u){return [u.Name,u.Family].filter(Boolean).join(' ')||u.Username||'Unnamed user';}
  function renderList(filter=''){
    state.selected=null;state.detail=null;
    const q=filter.trim().toLowerCase();
    const users=state.users.filter(u=>[u.Name,u.Family,u.Username,u.Roles,String(u.UserID)].some(v=>String(v||'').toLowerCase().includes(q)));
    body.innerHTML=`<div class="user-mgmt-toolbar"><input id="userMgmtSearch" class="user-mgmt-search" type="search" placeholder="Search name, username, role or ID…" aria-label="Search users" value="${esc(filter)}"><span class="user-mgmt-count">${users.length} of ${state.users.length} users</span></div><div class="user-mgmt-table-wrap"><table class="user-mgmt-table"><thead><tr><th>User</th><th>Username</th><th>Role</th><th>Status</th><th>Last login</th><th>Last logout</th></tr></thead><tbody>${users.map(u=>`<tr><td><button class="user-mgmt-user-link" type="button" data-user-id="${Number(u.UserID)}">${esc(fullName(u))}</button></td><td>${esc(u.Username)}</td><td>${esc(u.Roles||'No role assigned')}</td><td>${status(u.IsActive)}</td><td>${esc(date(u.LastLoginAt))}</td><td>${esc(date(u.LastLogoutAt))}</td></tr>`).join('')||'<tr><td colspan="6" class="user-mgmt-empty">No matching users.</td></tr>'}</tbody></table></div><p class="user-mgmt-note">Login/logout times are based on recorded DMS audit events. A missing event is shown as “Never recorded”.</p>`;
    $('userMgmtSearch').addEventListener('input',e=>{const pos=e.target.selectionStart;renderList(e.target.value);const n=$('userMgmtSearch');n.focus();n.setSelectionRange(pos,pos);});
    body.querySelectorAll('[data-user-id]').forEach(b=>b.addEventListener('click',()=>loadDetail(Number(b.dataset.userId))));
  }
  async function loadList(){
    body.innerHTML='<div class="user-mgmt-empty">Loading users…</div>';
    try{const data=await request(API+'/users');state.users=data.users||[];renderList();}
    catch(e){body.innerHTML=`<div class="user-mgmt-error">${esc(e.message)}</div>`;}
  }
  async function loadDetail(id){
    state.selected=id;state.tab='overview';body.innerHTML='<div class="user-mgmt-empty">Loading user details…</div>';
    try{state.detail=await request(API+'/users/'+encodeURIComponent(id));renderDetail();}
    catch(e){body.innerHTML=`<div class="user-mgmt-error">${esc(e.message)}</div><button class="user-mgmt-back" id="userMgmtBack">Back to users</button>`; $('userMgmtBack').addEventListener('click',loadList);}
  }
  function renderDetail(){
    const d=state.detail,u=d.user;if(!u)return;
    const tabs=[['overview','Overview'],['permissions','Permissions'],['activity','Activity log']];
    let content='';
    if(state.tab==='overview'){
      content=`<div class="user-mgmt-grid">${[['User ID',u.UserID],['Username',u.Username],['First name',u.Name||'—'],['Family name',u.Family||'—'],['Created',date(u.CreatedAt)],['Updated',date(u.UpdatedAt)],['Last successful login',date(u.LastLoginAt)],['Last recorded logout',date(u.LastLogoutAt)]].map(([k,v])=>`<div class="user-mgmt-field"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div><h3 class="user-mgmt-section-title">Assigned roles</h3><div class="user-mgmt-chips">${(d.roles||[]).map(r=>`<span class="user-mgmt-chip" title="${esc(r.RoleCode)}">${esc(r.RoleName)} · ${esc(r.RoleCode)}</span>`).join('')||'<span class="user-mgmt-note">No roles assigned.</span>'}</div><div class="user-mgmt-actions"><button class="user-mgmt-btn" id="userMgmtPasswordToggle">Reset password</button><button class="user-mgmt-btn ${Number(u.IsActive)===1?'danger':'primary'}" id="userMgmtStatus">${Number(u.IsActive)===1?'Deactivate account':'Activate account'}</button></div><div id="userMgmtPasswordPanel" hidden><form id="userMgmtPasswordForm" class="user-mgmt-password"><div><label for="userMgmtNewPassword">New password (minimum 12 characters)</label><input id="userMgmtNewPassword" type="password" minlength="12" maxlength="256" autocomplete="new-password" required></div><button class="user-mgmt-btn primary" type="submit">Set password</button></form><p class="user-mgmt-note">Resetting the password revokes the target user's active sessions. The password is never displayed or stored in plain text.</p></div>`;
    }else if(state.tab==='permissions'){
      content=`<p class="user-mgmt-note">Effective permissions are resolved through UserRoles → Roles → RolePermissions → Permissions. Direct user permissions are not inferred.</p><div class="user-mgmt-permission-list">${(d.permissions||[]).map(p=>`<div class="user-mgmt-permission"><strong>${esc(p.PermissionCode)}</strong><span>${esc(p.PermissionName||'')} · ${esc(p.GrantedByRole||'Role grant')} · ID ${esc(p.PermissionID)}</span></div>`).join('')||'<div class="user-mgmt-empty">No effective permissions found.</div>'}</div>`;
    }else{
      content=`<div class="user-mgmt-table-wrap"><table class="user-mgmt-table"><thead><tr><th>Time (UTC)</th><th>Event</th><th>IP address</th></tr></thead><tbody>${(d.activity||[]).map(a=>`<tr><td>${esc(date(a.CreatedAt))}</td><td>${esc(a.Action)}</td><td>${esc(a.IPAddress||'—')}</td></tr>`).join('')||'<tr><td colspan="3" class="user-mgmt-empty">No activity recorded.</td></tr>'}</tbody></table></div><p class="user-mgmt-note">Latest 100 audit records. Times are stored in UTC and localized by your browser.</p>`;
    }
    body.innerHTML=`<div class="user-mgmt-toolbar"><button class="user-mgmt-back" id="userMgmtBack">← All users</button><span class="user-mgmt-count">USER ID ${esc(u.UserID)}</span></div><div class="user-mgmt-detail-head"><div class="user-mgmt-avatar">${esc(fullName(u).slice(0,1).toUpperCase())}</div><div class="user-mgmt-user-title"><h3>${esc(fullName(u))}</h3><p>${esc(u.Username)}</p></div>${status(u.IsActive)}</div><div class="user-mgmt-tabs" role="tablist">${tabs.map(([key,label])=>`<button class="user-mgmt-tab ${state.tab===key?'active':''}" type="button" role="tab" aria-selected="${state.tab===key}" data-tab="${key}">${label}</button>`).join('')}</div><div>${content}</div><div id="userMgmtMessage" aria-live="polite"></div>`;
    $('userMgmtBack').addEventListener('click',loadList);
    body.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab;renderDetail();}));
    const toggle=$('userMgmtPasswordToggle');if(toggle)toggle.addEventListener('click',()=>{$('userMgmtPasswordPanel').hidden=!$('userMgmtPasswordPanel').hidden;if(!$('userMgmtPasswordPanel').hidden)$('userMgmtNewPassword').focus();});
    const form=$('userMgmtPasswordForm');if(form)form.addEventListener('submit',resetPassword);
    const statusBtn=$('userMgmtStatus');if(statusBtn)statusBtn.addEventListener('click',toggleStatus);
  }
  async function resetPassword(e){
    e.preventDefault();const password=$('userMgmtNewPassword').value;
    if(password.length<12){$('userMgmtMessage').innerHTML='<p class="user-mgmt-error">Password must contain at least 12 characters.</p>';return;}
    if(!window.confirm('Reset this user’s password and revoke their active sessions?'))return;
    const button=e.submitter;button.disabled=true;
    try{await request(API+'/users/'+state.selected+'/password',{method:'PUT',body:JSON.stringify({password})});$('userMgmtMessage').innerHTML='<p class="user-mgmt-note">Password reset completed; active sessions revoked.</p>'; $('userMgmtNewPassword').value='';}
    catch(err){$('userMgmtMessage').innerHTML=`<p class="user-mgmt-error">${esc(err.message)}</p>`;}
    finally{button.disabled=false;}
  }
  async function toggleStatus(){
    const active=!(Number(state.detail.user.IsActive)===1||state.detail.user.IsActive===true);
    const label=active?'activate':'deactivate';
    if(!window.confirm(`Are you sure you want to ${label} this account?`))return;
    const button=$('userMgmtStatus');button.disabled=true;
    try{await request(API+'/users/'+state.selected+'/status',{method:'PATCH',body:JSON.stringify({isActive:active})});await loadDetail(state.selected);await loadListAfterDetail(active);}
    catch(err){$('userMgmtMessage').innerHTML=`<p class="user-mgmt-error">${esc(err.message)}</p>`;button.disabled=false;}
  }
  async function loadListAfterDetail(active){
    try{const data=await request(API+'/users');state.users=data.users||[];if(!active){state.selected=null;state.detail=null;renderList();}else{renderDetail();}}
    catch(e){$('userMgmtMessage').innerHTML=`<p class="user-mgmt-error">${esc(e.message)}</p>`;}
  }
  function installNav(){
    const nav=document.querySelector('.dms-sidebar-nav[aria-label="Workspace"]');if(!nav||$('userManagementNav'))return;
    const button=document.createElement('button');button.type='button';button.id='userManagementNav';button.className='dms-nav-item';button.dataset.dmsNav='user-management';button.innerHTML='<span class="dms-nav-icon" aria-hidden="true">♙</span><span>User Management</span>';button.title='User Management';button.addEventListener('click',open);nav.append(button);
  }
  async function initialize(){
    try{const me=await fetch(`${window.DMS_API_BASE||''}/api/auth/me`,{credentials:'include',cache:'no-store'});if(!me.ok)return;const data=await me.json();if((data.permissions||[]).includes(PERMISSION)){installNav();}}
    catch(e){console.error('User Management permission check failed:',e);}
  }
  document.addEventListener('DOMContentLoaded',initialize);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal&&!modal.hidden)close();});
  window.DMSUserManagement={open,close,refresh:loadList};
})();