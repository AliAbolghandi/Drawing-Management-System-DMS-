(() => {
  'use strict';

  const host = window.location.hostname || 'localhost';
  const API = `http://${host}:3000/api`;
  let selectedNode = null;
  let allRequests = [];
  let pendingModalAction = null;
  let selectedWorkflowRequestId = null;
  let activeRequestCategory = 'current';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const dateText = value => window.DMSDate ? window.DMSDate.format(value) : (value ? String(value) : '-');
  const userText = (name,family,username) => [name,family].filter(x=>String(x||'').trim()).join(' ') || username || '-';
  const hasPermission = code => window.DMS?.permissions instanceof Set && window.DMS.permissions.has(code);

  async function requestJson(url, options={}) {
    const response = await fetch(url,{credentials:'include',cache:'no-store',...options});
    const data = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function injectExpertWorkStyles() {
    if($('rwExpertWorkStyles')) return;
    const style=document.createElement('style'); style.id='rwExpertWorkStyles';
    style.textContent=`
      .rw-expert-work-box{margin:16px 0;padding:16px;border:1px solid #334155;border-radius:12px;background:#0b1424;color:#e2e8f0}
      .rw-expert-work-box h4{margin:0 0 12px;font-size:15px;color:#f8fafc}.rw-ew-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:14px}
      .rw-ew-stat{padding:10px;border-radius:9px;background:#111c2f;border:1px solid #334155;color:#e2e8f0}.rw-ew-stat small{display:block;color:#94a3b8;font-size:11px}.rw-ew-stat strong{font-size:18px;color:#f8fafc}
      .rw-ew-contribution{padding:10px 0;border-top:1px solid #334155}.rw-ew-contribution:first-of-type{border-top:0}.rw-ew-contribution strong{display:block;margin-bottom:5px;color:#f1f5f9}
      .rw-ew-modal{margin:14px 0;padding:14px;border:1px solid #334155;border-radius:10px;background:#0b1424;color:#e2e8f0}.rw-ew-modal h4{margin:0 0 12px;color:#f8fafc}.rw-ew-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.rw-ew-stage{border:1px solid #334155;background:#111c2f;color:#e2e8f0;border-radius:10px;padding:12px}.rw-ew-stage h5{margin:0 0 10px;color:#f8fafc}.rw-ew-stage label{display:block;font-size:12px;margin:7px 0 4px;color:#cbd5e1}.rw-ew-stage input{width:100%;box-sizing:border-box;padding:7px;border:1px solid #475569;border-radius:6px;background:#0b1424;color:#f8fafc}.rw-ew-note{font-size:12px;color:#94a3b8;margin:8px 0}.rw-ew-error{color:#fca5a5;font-size:12px;margin-top:8px}.rw-ew-success{color:#86efac;font-size:12px;margin-top:8px}
      .rw-ew-save-progress{margin-right:8px}
      .expert-work-dialog{background:#0f172a!important;color:#e2e8f0;border:1px solid #334155}.expert-work-dialog .rw-action-header{background:#111c2f;border-bottom:1px solid #334155}.expert-work-dialog .rw-action-header h2{color:#f8fafc}.expert-work-dialog .rw-action-header p{color:#94a3b8}.expert-work-dialog .expert-work-section{background:#111c2f;border:1px solid #334155;border-radius:10px;padding:14px;margin:12px 0}.expert-work-dialog .expert-work-section-head strong{color:#f8fafc}.expert-work-dialog .expert-work-section-head small{color:#94a3b8}.expert-work-dialog .expert-work-field{color:#cbd5e1}.expert-work-dialog .expert-work-field input{background:#0b1424;color:#f8fafc;border-color:#475569}.expert-work-dialog .expert-work-summary>div{background:#111c2f;color:#cbd5e1;border:1px solid #334155}.expert-work-dialog .expert-work-summary b{color:#6fe3ff}
      @media(max-width:900px){.rw-ew-summary,.rw-ew-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.rw-ew-summary,.rw-ew-grid{grid-template-columns:1fr}}
    `;; document.head.appendChild(style);
  }

  function setBadge(count){
    const badge=$('rwNotificationBadge'); if(!badge)return;
    const n=Math.max(0,Number(count)||0); badge.textContent=n>99?'99+':String(n); badge.hidden=n===0;
  }

  async function loadPendingCount(){
    try{const data=await requestJson(`${API}/auth/pending-drawing-count`);setBadge(data.pendingCount);}catch(e){console.error('Pending count failed:',e);}
  }

  async function loadCurrentUser(){
    try{const data=await requestJson(`${API}/auth/me`);window.DMS=window.DMS||{};window.DMS.permissions=new Set(data.permissions||[]);window.DMS.user=data.user||{};const btn=$('addRequestBtn');if(btn){const ok=hasPermission('REQUEST_DRAWING_CREATE');btn.disabled=!ok;btn.title=ok?'':'Your RolePermission does not include REQUEST_DRAWING_CREATE.';}return data;}catch(e){console.error('Workflow user load failed:',e);return null;}
  }

  function requestCategory(status){const s=String(status||'').toUpperCase();if(s==='FINAL_APPROVED')return'final';if(['MANAGER_REJECTED','DRAWING_APPROVAL_REJECTED','EXPERT_REJECTED','FINAL_REJECTED'].includes(s))return'rejected';if(s==='CANCELLED')return'excluded';return'current';}
  function colorClass(r){const s=String(r.StatusCode||'').toUpperCase(),uid=Number(window.DMS?.user?.userId||0);const assigned=Number(r.AssignedDrawingExpertID)===uid;const prior=r.WasPreviouslyAssignedExpert===true||Number(r.WasPreviouslyAssignedExpert)===1;if(s==='CANCELLED')return'rw-status-gray';if(s==='FINAL_APPROVED')return'rw-status-green';if(['MANAGER_REJECTED','DRAWING_APPROVAL_REJECTED','EXPERT_REJECTED','FINAL_REJECTED'].includes(s))return'rw-status-red';if(s==='IN_PROGRESS')return assigned?'rw-status-blue':'rw-status-green';if(s==='ASSIGNED'||s==='RETURNED_FOR_CORRECTION')return assigned?'rw-status-yellow':'rw-status-green';if(s==='TRANSFERRED')return prior&&!assigned?'rw-status-gray':assigned?'rw-status-yellow':'rw-status-green';if(s==='PENDING_FINAL_APPROVAL')return hasPermission('REQUEST_DRAWING_FINAL_APPROVE')||hasPermission('REQUEST_DRAWING_VIEW_ALL')?'rw-status-yellow':'rw-status-green';return'rw-status-orange';}

  function getRequestActions(r){
    const s=String(r.StatusCode||''),uid=Number(window.DMS?.user?.userId||0),actions=[];const add=(action,label,permission)=>actions.push({action,label,permission,allowed:action==='cancel'||hasPermission(permission)});
    if(Number(r.RequesterUserID)===uid&&s==='PENDING_MANAGER')add('cancel','Cancel Request','REQUEST_DRAWING_CANCEL');
    if(Number(r.ManagerUserID)===uid&&s==='PENDING_MANAGER'){add('approve','Approve','REQUEST_DRAWING_APPROVE');add('reject','Reject','REQUEST_DRAWING_REJECT');}
    if(['PENDING_DRAWING_APPROVAL','EXPERT_REJECTED','TRANSFERRED','RETURNED_FOR_CORRECTION'].includes(s)){add('assign','Refer to Expert','REQUEST_DRAWING_ASSIGN');add('final-reject','Reject Request','REQUEST_DRAWING_FINAL_REJECT');}
    if(Number(r.AssignedDrawingExpertID)===uid){if(['ASSIGNED','TRANSFERRED'].includes(s))add('accept','Accept Work','REQUEST_DRAWING_ACCEPT');if(['ASSIGNED','IN_PROGRESS','RETURNED_FOR_CORRECTION'].includes(s)){add('transfer','Refer to Another Expert','REQUEST_DRAWING_TRANSFER');add('expert-reject','Reject Work','REQUEST_DRAWING_EXPERT_REJECT');}if(['IN_PROGRESS','RETURNED_FOR_CORRECTION'].includes(s))add('complete','Complete Work','REQUEST_DRAWING_COMPLETE');}
    if(['PENDING_FINAL_APPROVAL','FINAL_REJECTED'].includes(s))add('return-correction','Return for Correction','REQUEST_DRAWING_RETURN_CORRECTION');
    if(s==='PENDING_FINAL_APPROVAL')add('final-approve','Final Approval','REQUEST_DRAWING_FINAL_APPROVE');
    return actions;
  }

  function updateCategoryCounts(){const counts={current:0,final:0,rejected:0};allRequests.forEach(r=>{const c=requestCategory(r.StatusCode);if(counts[c]!==undefined)counts[c]++;});[['rwCurrentCount',counts.current],['rwFinalCount',counts.final],['rwRejectedCount',counts.rejected]].forEach(([id,n])=>{if($(id))$(id).textContent=String(n);});}

  function renderWorklist(requests){
    allRequests=Array.isArray(requests)?requests:[];updateCategoryCounts();const box=$('rwContent');if(!box)return;const search=($('rwRequestSearch')?.value||'').trim().toLowerCase();
    const items=allRequests.filter(r=>(search||requestCategory(r.StatusCode)===activeRequestCategory)&&(!search||String(r.RequestNumber||'').toLowerCase().includes(search))&&requestCategory(r.StatusCode)!=='excluded');
    box.innerHTML=items.length?items.map(r=>{const selected=Number(r.RequestID)===Number(selectedWorkflowRequestId);return `<button type="button" class="rw-request-card rw-request-list-item ${selected?'rw-request-selected':''} ${colorClass(r)} ${String(r.StatusCode||'').toUpperCase()==='FINAL_APPROVED'?'rw-request-final-approved':''}" data-open-request-id="${Number(r.RequestID)}"><div class="rw-request-top"><span class="rw-request-number">${esc(r.RequestNumber)}</span><span class="rw-status">${esc(r.StatusName||r.StatusCode||'-')}</span></div><div class="rw-request-node"><strong>${esc(r.NodeCode||'-')}</strong> — ${esc(r.NodeName||'-')}</div><div class="rw-request-meta">Requester: ${esc(userText(r.RequesterName,r.RequesterFamily,r.RequesterUsername))}<br>Created: ${esc(dateText(r.CreatedAt))}</div></button>`;}).join(''):'<div class="rw-empty">No matching requests.</div>';
    if(selectedWorkflowRequestId){const r=allRequests.find(x=>Number(x.RequestID)===Number(selectedWorkflowRequestId));if(r)openRequestDetailsModal(Number(r.RequestID));}
  }

  const actionLabels={cancel:'Cancel Drawing Request',approve:'Approve Drawing Request',reject:'Reject Drawing Request',assign:'Refer Request to Drawing Expert',transfer:'Transfer to Another Expert',accept:'Accept Drawing Work','expert-reject':'Reject Drawing Work',complete:'Complete Drawing Work','return-correction':'Return for Correction','final-approve':'Final Approval','final-reject':'Reject Drawing Request'};

  async function loadExpertWork(requestId){return requestJson(`${API}/auth/expert-work/${requestId}`);}

  function buildExpertWorkView(data){
    const rows=data?.contributions||[],t=data?.totals||{};
    return `<section class="rw-expert-work-box"><h4>Expert Work Contributions</h4><div class="rw-ew-summary"><div class="rw-ew-stat"><small>Predicted</small><strong>${Number(t.predictedPartCount||0)}</strong></div><div class="rw-ew-stat"><small>Croquis</small><strong>${Number(t.croquisPartCount||0)}</strong></div><div class="rw-ew-stat"><small>Modeling</small><strong>${Number(t.modelingPartCount||0)}</strong></div><div class="rw-ew-stat"><small>Standard</small><strong>${Number(t.standardPartCount||0)}</strong></div><div class="rw-ew-stat"><small>Drawn</small><strong>${Number(t.drawnPartCount||0)}</strong></div></div>${rows.map(x=>`<div class="rw-ew-contribution"><strong>${esc(userText(x.ExpertName,x.ExpertFamily,x.DrawingExpertUsername))}${Number(x.IsCurrent)===1?' — Current Expert':''}</strong><div class="rw-ew-note">Prediction: ${x.PredictedPartCount??'-'} | Croquis: ${x.CroquisPartCount??'-'} | Modeling: ${x.ModelingPartCount??'-'} | Drawing: Standard ${x.StandardPartCount??'-'} / Drawn ${x.DrawnPartCount??'-'}</div></div>`).join('')}</section>`;
  }

  function renderStepByStepWorkflow(request) {
    const history = Array.isArray(request.WorkflowHistory) ? request.WorkflowHistory : [];
    const actionNames = {
      REQUEST_CREATED: 'Request Created', MANAGER_APPROVED: 'Manager Approved',
      MANAGER_REJECTED: 'Manager Rejected', DRAWING_APPROVED: 'Drawing Approved',
      DRAWING_REJECTED: 'Drawing Rejected', ASSIGNED_TO_EXPERT: 'Assigned to Expert',
      EXPERT_ACCEPTED: 'Expert Accepted Work', EXPERT_TRANSFERRED: 'Transferred to Another Expert',
      EXPERT_REJECTED: 'Expert Rejected Work', RETURN_FOR_CORRECTION: 'Returned for Correction',
      WORK_COMPLETED: 'Work Completed', FINAL_APPROVED: 'Final Approved',
      FINAL_REJECTED: 'Final Rejected', REQUEST_CANCELLED: 'Request Cancelled'
    };
    const steps = history.map((item, index) => {
      const action = String(item.ActionCode || '').toUpperCase();
      const rejected = /REJECT|CANCEL/.test(action) || /REJECT|CANCEL/i.test(item.ToStatusName || '');
      const approved = /APPROV|ACCEPT|COMPLETE|CREATED|ASSIGNED|TRANSFERRED/i.test(action);
      const actor = userText(item.ActionByName, item.ActionByFamily, item.ActionByUsername);
      const when = dateText(item.CreatedAt);
      return `<article class="rw-timeline-step ${rejected ? 'is-rejected' : approved ? 'is-approved' : ''}">
        <div class="rw-timeline-heading"><strong>${esc(actionNames[action] || String(item.ToStatusName || action || 'Workflow Update').replaceAll('_',' '))}</strong><span>${esc(item.ToStatusName || 'Recorded')}</span></div>
        <div class="rw-timeline-actor">${esc(actor)}</div><time>${esc(when)}</time>
        ${item.Comment ? `<p class="rw-timeline-comment">${esc(item.Comment)}</p>` : '<p class="rw-timeline-no-comment">No comment recorded</p>'}
      </article>${index < history.length - 1 ? '<div class="rw-timeline-arrow" aria-hidden="true">↓</div>' : ''}`;
    }).join('');
    return `<section class="rw-workflow-timeline"><div class="rw-workflow-timeline-header"><h4>Step-by-step workflow</h4><span class="rw-workflow-step-count">${history.length} ${history.length === 1 ? 'step' : 'steps'}</span></div><div class="rw-timeline-list">${steps || '<div class="rw-workflow-placeholder"><span>◷</span><strong>Workflow history is not available yet</strong><p>Recorded actions will appear here as the request moves through approval and drawing.</p></div>'}</div></section>`;
  }

  function openRequestDetailsModal(requestId){
    const r=allRequests.find(x=>Number(x.RequestID)===Number(requestId));if(!r)return;selectedWorkflowRequestId=Number(requestId);const box=$('rwDetailsBody');if(!box)return;
    const actions=getRequestActions(r);const actionsHtml=actions.length?`<section class="rw-details-actions"><h4>Available Actions</h4><div class="rw-action-row">${actions.map(a=>`<button type="button" class="rw-action-btn" data-details-action="${a.action}" data-request-id="${Number(r.RequestID)}" data-required-permission="${esc(a.permission)}"${a.allowed?'':' disabled aria-disabled="true"'}>${esc(a.label)}</button>`).join('')}</div></section>`:'<div class="rw-details-no-actions">No actions are available for your account at this workflow stage.</div>';


    box.innerHTML=
    `<div class="rw-details-request-number">${esc(r.RequestNumber||'-')}</div>
    <div class="rw-details-status-row"><span class="rw-details-status-label">STATUS</span><span class="rw-details-status">${esc(r.StatusName||r.StatusCode||'-')}</span></div>
    <section class="rw-details-location-section">
    <div class="rw-details-location"><button type="button" class="rw-submit" id="rwShowNodeLocation" data-node-id="${Number(r.NodeID)}" data-node-code="${esc(r.NodeCode||'')}">Show location in tree</button><span id="rwNodeLocationMessage"></span></div>
    <div class="rw-node-path" id="rwRequestNodePath"></div>
    <div id="rwExpertWorkDetails"><div class="rw-loading">Loading expert work…</div>
    </section>${actionsHtml}${renderStepByStepWorkflow(r)}
  
    </div>`;
   
   
    if($('rwDetailsTitle'))$('rwDetailsTitle').textContent=r.RequestNumber||'Request Workflow';if($('rwSelectedStatus'))$('rwSelectedStatus').textContent=r.StatusName||r.StatusCode||'-';
    loadExpertWork(requestId).then(data=>{const el=$('rwExpertWorkDetails');if(el)el.innerHTML=buildExpertWorkView(data);}).catch(e=>{const el=$('rwExpertWorkDetails');if(el)el.innerHTML=`<div class="rw-empty">${esc(e.message)}</div>`;});
    requestJson(`${API}/node-hierarchy/${Number(r.NodeID)}/full`).then(data=>{const p=$('rwRequestNodePath');if(p&&Array.isArray(data.hierarchy))p.innerHTML=data.hierarchy.map((n,i)=>`<div class="rw-node-path-item ${i===data.hierarchy.length-1?'is-current':''}"><span class="rw-node-path-label"><strong>${esc(n.nodeCode||'-')}</strong><span>${esc(n.nodeName||'-')}</span></span></div>`).join('');}).catch(()=>{});
  }

  function openActionModal(action,requestId){
    const request=allRequests.find(x=>Number(x.RequestID)===Number(requestId));if(!request)return;pendingModalAction={action,requestId:Number(requestId),requestNumber:request.RequestNumber};injectExpertWorkStyles();
    $('rwActionTitle').textContent=actionLabels[action]||'Drawing Request Action';$('rwActionPrompt').textContent=`Request ${request.RequestNumber}. Complete the required information, then continue.`;$('rwActionComment').value='';$('rwActionError').textContent='';
    const expertField=$('rwActionExpertField');if(expertField)expertField.classList.toggle('hidden',!['assign','transfer'].includes(action));
    if($('rwActionExpertUsername')){$('rwActionExpertUsername').innerHTML='<option value="">Select an expert…</option>';if(['assign','transfer'].includes(action)){requestJson(`${API}/drawing-experts`).then(data=>{const experts=data.experts||[];$('rwActionExpertUsername').innerHTML='<option value="">Select an expert…</option>'+experts.map(x=>`<option value="${esc(x.Username)}">${esc(userText(x.Name,x.Family,x.Username))}</option>`).join('');}).catch(e=>$('rwActionError').textContent=e.message);}}
    const body=$('rwActionModal')?.querySelector('.rw-dialog-body');let ew=$('rwActionExpertWorkFields');if(ew)ew.remove();
    if(action==='accept'){
      ew=document.createElement('section');ew.id='rwActionExpertWorkFields';ew.className='rw-ew-modal';ew.innerHTML=`<h4>1. Predicted Part Count *</h4><label for="rwPredictedPartCount">Predicted number of Parts</label><input id="rwPredictedPartCount" type="number" min="0" step="1" required><p class="rw-ew-note">This value is required before the request can be accepted.</p><div id="rwExpertWorkInlineError" class="rw-ew-error"></div>`;body?.insertBefore(ew,body.querySelector('.rw-dialog-actions'));
    }
    if(action==='complete'){
      ew=document.createElement('section');ew.id='rwActionExpertWorkFields';ew.className='rw-ew-modal';ew.innerHTML=`<h4>Expert Work</h4><p class="rw-ew-note">Enter only the contribution made by you. Previous experts' contributions remain unchanged. A stage may be left blank when that stage was already completed by a previous expert.</p><div class="rw-ew-grid"><div class="rw-ew-stage"><h5>2. Croquis / Vector Sketch</h5><label>Start date</label><input id="rwCroquisStart" type="date"><label>End date</label><input id="rwCroquisEnd" type="date"><label>Parts added by you</label><input id="rwCroquisCount" type="number" min="0" step="1"></div><div class="rw-ew-stage"><h5>3. Modeling</h5><label>Start date</label><input id="rwModelingStart" type="date"><label>End date</label><input id="rwModelingEnd" type="date"><label>Parts added by you</label><input id="rwModelingCount" type="number" min="0" step="1"></div><div class="rw-ew-stage"><h5>4. Final Drawing</h5><label>Start date</label><input id="rwDrawingStart" type="date"><label>End date</label><input id="rwDrawingEnd" type="date"><label>Standard parts</label><input id="rwStandardCount" type="number" min="0" step="1"><label>Drawn parts</label><input id="rwDrawnCount" type="number" min="0" step="1"></div></div><div id="rwExpertWorkInlineError" class="rw-ew-error"></div><div id="rwExpertWorkInlineSuccess" class="rw-ew-success"></div>`;body?.insertBefore(ew,body.querySelector('.rw-dialog-actions'));loadExpertWork(requestId).then(data=>{const totals=data.totals||{};const note=document.createElement('p');note.className='rw-ew-note';note.textContent=`Current totals — Croquis: ${totals.croquisPartCount||0}, Modeling: ${totals.modelingPartCount||0}, Standard: ${totals.standardPartCount||0}, Drawn: ${totals.drawnPartCount||0}`;ew.prepend(note);}).catch(()=>{});
      const actions=body?.querySelector('.rw-dialog-actions');
      if(actions&&!$('rwSaveExpertWorkProgress')){const save=document.createElement('button');save.type='button';save.id='rwSaveExpertWorkProgress';save.className='rw-submit rw-ew-save-progress';save.textContent='Save Progress';actions.insertBefore(save,actions.firstChild);}
    }
    $('rwActionContinue').textContent=action==='cancel'?'Confirm Cancel':(action==='complete'?'Complete Work':'Continue');$('rwActionModal').classList.remove('hidden');
  }

  function closeActionModal(){$('rwActionModal')?.classList.add('hidden');$('rwConfirmModal')?.classList.add('hidden');pendingModalAction=null;}

  function readExpertWorkFields(){
    return {
      croquisStartDate:$('rwCroquisStart')?.value||null,
      croquisEndDate:$('rwCroquisEnd')?.value||null,
      croquisPartCount:$('rwCroquisCount')?.value===''?null:Number($('rwCroquisCount')?.value),
      modelingStartDate:$('rwModelingStart')?.value||null,
      modelingEndDate:$('rwModelingEnd')?.value||null,
      modelingPartCount:$('rwModelingCount')?.value===''?null:Number($('rwModelingCount')?.value),
      drawingStartDate:$('rwDrawingStart')?.value||null,
      drawingEndDate:$('rwDrawingEnd')?.value||null,
      standardPartCount:$('rwStandardCount')?.value===''?null:Number($('rwStandardCount')?.value),
      drawnPartCount:$('rwDrawnCount')?.value===''?null:Number($('rwDrawnCount')?.value)
    };
  }

  function validateExpertWork(action,allowPartial=false){
    const err=$('rwExpertWorkInlineError');if(err)err.textContent='';
    if(action==='accept'){const v=$('rwPredictedPartCount')?.value;if(v===''||!Number.isInteger(Number(v))||Number(v)<0){if(err)err.textContent='Predicted Part Count is required and must be a non-negative integer.';return false;}return true;}
    if(action!=='complete')return true;
    const f=readExpertWorkFields();
    const groups=[
      {name:'Croquis',values:[f.croquisStartDate,f.croquisEndDate,f.croquisPartCount],dates:[f.croquisStartDate,f.croquisEndDate]},
      {name:'Modeling',values:[f.modelingStartDate,f.modelingEndDate,f.modelingPartCount],dates:[f.modelingStartDate,f.modelingEndDate]},
      {name:'Drawing',values:[f.drawingStartDate,f.drawingEndDate,f.standardPartCount,f.drawnPartCount],dates:[f.drawingStartDate,f.drawingEndDate]}
    ];
    for(const g of groups){
      const filled=g.values.filter(v=>v!==null&&v!=='').length;
      if(!allowPartial && filled===0){continue;}
      if(filled!==0&&filled!==g.values.length){if(err)err.textContent=`${g.name} fields must be completed together.`;return false;}
      if(filled===0)continue;
      if(g.dates[1]<g.dates[0]){if(err)err.textContent=`${g.name} end date cannot precede start date.`;return false;}
      for(const v of g.values.slice(2))if(!Number.isInteger(Number(v))||Number(v)<0){if(err)err.textContent='Part counts must be non-negative integers.';return false;}
    }
    return true;
  }

  async function saveExpertWork(action,requestId){
    if(action==='accept')return requestJson(`${API}/auth/expert-work/${requestId}/prediction`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({predictedPartCount:Number($('rwPredictedPartCount').value)})});
    if(action!=='complete')return null;
    return requestJson(`${API}/auth/expert-work/${requestId}/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(readExpertWorkFields())});
  }

  async function saveProgress(){
    if(!pendingModalAction||pendingModalAction.action!=='complete')return;
    if(!validateExpertWork('complete',true))return;
    const button=$('rwSaveExpertWorkProgress'),err=$('rwExpertWorkInlineError'),ok=$('rwExpertWorkInlineSuccess');
    if(button)button.disabled=true;if(err)err.textContent='';if(ok)ok.textContent='';
    try{await saveExpertWork('complete',pendingModalAction.requestId);if(ok)ok.textContent='Progress saved successfully.';await loadWorklist();await loadPendingCount();if(selectedWorkflowRequestId===pendingModalAction.requestId)openRequestDetailsModal(pendingModalAction.requestId);}catch(e){if(err)err.textContent=e.message;}finally{if(button)button.disabled=false;}
  }

  function openConfirmationModal(){if(!pendingModalAction)return;const a=pendingModalAction.action;$('rwConfirmTitle').textContent=`Confirm: ${actionLabels[a]||'Drawing Request Action'}`;$('rwConfirmPrompt').textContent=`Are you sure you want to ${(actionLabels[a]||'process this request').toLowerCase()} for request ${pendingModalAction.requestNumber}?`;$('rwConfirmYes').textContent='Confirm Action';$('rwConfirmError').textContent='';$('rwConfirmModal').classList.remove('hidden');}

  async function executePendingAction(){
    if(!pendingModalAction)return;const {action,requestId}=pendingModalAction;const comment=$('rwActionComment')?.value.trim()||'';const expertUsername=$('rwActionExpertUsername')?.value.trim()||'';const isCancel=action==='cancel';const button=isCancel?$('rwActionContinue'):$('rwConfirmYes');const errorBox=isCancel?$('rwActionError'):$('rwConfirmError');button.disabled=true;errorBox.textContent='';
    try{if(['accept','complete'].includes(action))await saveExpertWork(action,requestId);await requestJson(`${API}/drawing-requests/${requestId}/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,comment,expertUsername})});closeActionModal();await loadWorklist();await loadPendingCount();if(selectedWorkflowRequestId===Number(requestId))openRequestDetailsModal(requestId);}catch(e){errorBox.textContent=e.message;}finally{button.disabled=false;}
  }

  function openSidebar(){$('rwWorklistModal')?.classList.remove('hidden');document.body.classList.add('rw-worklist-open');loadWorklist();loadPendingCount();}
  function closeSidebar(){$('rwWorklistModal')?.classList.add('hidden');document.body.classList.remove('rw-worklist-open');}
  function setCategory(category){activeRequestCategory=category;document.querySelectorAll('[data-request-category]').forEach(b=>b.classList.toggle('active',b.dataset.requestCategory===category));renderWorklist(allRequests);}
  async function loadWorklist(){const box=$('rwContent');if(!box)return;box.innerHTML='<div class="rw-loading">Loading worklist...</div>';try{const data=await requestJson(`${API}/drawing-requests`);renderWorklist(data.requests||[]);}catch(e){box.innerHTML=`<div class="rw-empty">${esc(e.message)}</div>`;}}

  function openRequestModal(node){if(!node)return;selectedNode=node;$('rwNodeCode').textContent=node.NodeCode||'-';$('rwNodeName').textContent=node.NodeName||'-';$('rwRequestDescription').value='';$('rwRequestError').textContent='';$('rwRequestModal')?.classList.remove('hidden');}
  function closeRequestModal(){$('rwRequestModal')?.classList.add('hidden');selectedNode=null;}
  async function submitRequest(){if(!selectedNode)return;const b=$('rwRequestSubmit');b.disabled=true;try{const data=await requestJson(`${API}/drawing-requests`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodeId:Number(selectedNode.NodeID),description:$('rwRequestDescription').value.trim()})});closeRequestModal();openSidebar();alert(`Request ${data.request?.RequestNumber||''} was submitted successfully.`);}catch(e){$('rwRequestError').textContent=e.message;}finally{b.disabled=false;}}

  document.addEventListener('DOMContentLoaded',async()=>{
    injectExpertWorkStyles();await loadCurrentUser();await loadPendingCount();
    $('rwWorklistClose')?.addEventListener('click',closeSidebar);$('rwWorklistModal')?.addEventListener('click',e=>{if(e.target===$('rwWorklistModal'))closeSidebar();});
    document.querySelectorAll('[data-request-category]').forEach(b=>b.addEventListener('click',()=>{if($('rwRequestSearch'))$('rwRequestSearch').value='';setCategory(b.dataset.requestCategory);}));
    $('rwSearchForm')?.addEventListener('submit',e=>{e.preventDefault();renderWorklist(allRequests);});$('rwRequestSearch')?.addEventListener('input',()=>renderWorklist(allRequests));
    $('rwContent')?.addEventListener('click',e=>{const item=e.target.closest('[data-open-request-id]');if(item)openRequestDetailsModal(Number(item.dataset.openRequestId));});
    $('rwWorklistModal')?.addEventListener('click',e=>{const actionButton=e.target.closest('[data-details-action]');if(actionButton){const action=actionButton.dataset.detailsAction;if(actionButton.disabled||(action!=='cancel'&&!hasPermission(actionButton.dataset.requiredPermission))){alert(`Permission denied: ${actionButton.dataset.requiredPermission||'required workflow permission'}.`);return;}openActionModal(action,Number(actionButton.dataset.requestId));return;}const location=e.target.closest('#rwShowNodeLocation');if(location){window.DMS?.revealNodeLocation?.(Number(location.dataset.nodeId),location.dataset.nodeCode||'');closeSidebar();}});
    $('rwActionClose')?.addEventListener('click',closeActionModal);$('rwActionBack')?.addEventListener('click',closeActionModal);
    $('rwActionContinue')?.addEventListener('click',()=>{if(!pendingModalAction)return;if(['assign','transfer'].includes(pendingModalAction.action)&&!$('rwActionExpertUsername')?.value.trim()){$('rwActionError').textContent='Select a Drawing Expert from the list.';return;}if(['accept','complete'].includes(pendingModalAction.action)&&!validateExpertWork(pendingModalAction.action,false))return;if(pendingModalAction.action==='cancel')executePendingAction();else openConfirmationModal();});
    document.addEventListener('click',e=>{if(e.target.closest('#rwSaveExpertWorkProgress'))saveProgress();});
    $('rwConfirmNo')?.addEventListener('click',()=>$('rwConfirmModal')?.classList.add('hidden'));$('rwConfirmClose')?.addEventListener('click',()=>$('rwConfirmModal')?.classList.add('hidden'));$('rwConfirmYes')?.addEventListener('click',executePendingAction);
    $('addRequestBtn')?.addEventListener('click',()=>openRequestModal(window.DMS?.state?.currentSelectedNode));$('rwRequestCancel')?.addEventListener('click',closeRequestModal);$('rwRequestClose')?.addEventListener('click',closeRequestModal);$('rwRequestSubmit')?.addEventListener('click',submitRequest);
    setInterval(loadPendingCount,30000);
  });

  window.DMS=window.DMS||{};window.DMS.openDrawingRequestModal=openRequestModal;window.DMS.loadDrawingWorklist=loadWorklist;window.DMS.openDrawingWorklistModal=openSidebar;
})();
