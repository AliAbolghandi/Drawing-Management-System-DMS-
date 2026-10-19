(() => {
  'use strict';
  const API = `${window.DMS_API_BASE || ''}/api`;
  const $ = id => document.getElementById(id);
  let activeRequestId = null;
  let activeAction = null;

  function esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
  async function json(url, options = {}) {
    const r = await fetch(url, { credentials:'include', ...options });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  }
  function ensureModal() {
    if ($('expertWorkModal')) return;
    const el = document.createElement('div');
    el.id = 'expertWorkModal';
    el.className = 'rw-action-modal hidden';
    el.innerHTML = `<div class="rw-action-dialog expert-work-dialog" role="dialog" aria-modal="true" aria-labelledby="expertWorkTitle">
      <div class="rw-action-header"><div><h2 id="expertWorkTitle">Expert Drawing Work</h2><p id="expertWorkSubtitle"></p></div><button type="button" id="expertWorkClose" class="rw-action-close">×</button></div>
      <div id="expertWorkError" class="rw-action-error"></div>
      <div id="expertWorkBody" class="expert-work-body"></div>
      <div class="rw-action-footer"><button type="button" id="expertWorkCancel" class="rw-action-back">Cancel</button><button type="button" id="expertWorkSave" class="rw-action-continue">Save Progress</button><button type="button" id="expertWorkComplete" class="rw-action-continue">Complete Work</button></div>
    </div>`;
    document.body.appendChild(el);
    $('expertWorkClose').addEventListener('click', close);
    $('expertWorkCancel').addEventListener('click', close);
    $('expertWorkSave').addEventListener('click', () => save(false));
    $('expertWorkComplete').addEventListener('click', () => save(true));
  }
  function close() { $('expertWorkModal')?.classList.add('hidden'); activeRequestId = null; activeAction = null; }
  function field(label, id, type='number', attrs='') { return `<label class="expert-work-field"><span>${label}</span><input id="${id}" type="${type}" ${attrs}></label>`; }
  function renderPrediction(data) {
    const v = data.currentAssignment?.PredictedPartCount ?? '';
    return `<section class="expert-work-section"><div class="expert-work-section-head"><strong>1. Predicted Parts</strong><small>Required before Accept Work</small></div>${field('Predicted part count','ewPredicted','number',`min="1" step="1" value="${esc(v)}" required`)}</section>`;
  }
  function renderStages(data) {
    const c=data.currentAssignment||{};
    const t=data.totals||{};
    return `<div class="expert-work-summary"><div>Existing Croquis <b>${Number(t.CroquisTotal||0)}</b></div><div>Existing Modeling <b>${Number(t.ModelingTotal||0)}</b></div><div>Existing Drawing <b>${Number(t.StandardTotal||0)+Number(t.DrawnTotal||0)}</b></div></div>
      <section class="expert-work-section"><div class="expert-work-section-head"><strong>2. Croquis / Vector Sketch</strong><small>Your contribution only</small></div><div class="expert-work-grid">${field('Start date','ewCroquisStart','date',`value="${esc(String(c.CroquisStartDate||'').slice(0,10))}"`)}${field('End date','ewCroquisEnd','date',`value="${esc(String(c.CroquisEndDate||'').slice(0,10))}"`)}${field('Parts sketched','ewCroquisParts','number',`min="1" step="1" value="${esc(c.CroquisPartCount??'')}"`)}</div></section>
      <section class="expert-work-section"><div class="expert-work-section-head"><strong>3. Modeling</strong><small>Your contribution only</small></div><div class="expert-work-grid">${field('Start date','ewModelStart','date',`value="${esc(String(c.ModelingStartDate||'').slice(0,10))}"`)}${field('End date','ewModelEnd','date',`value="${esc(String(c.ModelingEndDate||'').slice(0,10))}"`)}${field('Parts modeled','ewModelParts','number',`min="1" step="1" value="${esc(c.ModelingPartCount??'')}"`)}</div></section>
      <section class="expert-work-section"><div class="expert-work-section-head"><strong>4. Final Drawing</strong><small>Standard + drawn parts are separate</small></div><div class="expert-work-grid">${field('Start date','ewDrawStart','date',`value="${esc(String(c.DrawingStartDate||'').slice(0,10))}"`)}${field('End date','ewDrawEnd','date',`value="${esc(String(c.DrawingEndDate||'').slice(0,10))}"`)}${field('Standard parts','ewStandard','number',`min="0" step="1" value="${esc(c.StandardPartCount??'')}"`)}${field('Drawn parts','ewDrawn','number',`min="0" step="1" value="${esc(c.DrawnPartCount??'')}"`)}</div></section>`;
  }
  function values() {
    const val=id=>$(id)?.value.trim()||'';
    return { predicted:val('ewPredicted'), cs:val('ewCroquisStart'), ce:val('ewCroquisEnd'), cp:val('ewCroquisParts'), ms:val('ewModelStart'), me:val('ewModelEnd'), mp:val('ewModelParts'), ds:val('ewDrawStart'), de:val('ewDrawEnd'), sp:val('ewStandard'), dp:val('ewDrawn') };
  }
  function validate(v, complete) {
    if (activeAction === 'accept' && (!/^\d+$/.test(v.predicted) || Number(v.predicted)<=0)) return 'Predicted part count is required.';
    if (activeAction === 'accept') return '';
    if (complete) {
      if (!v.cs || !v.ce || !v.cp || Number(v.cp)<=0) return 'Croquis start, end and part count are required.';
      if (!v.ms || !v.me || !v.mp || Number(v.mp)<=0) return 'Modeling start, end and part count are required.';
      if (!v.ds || !v.de || !/^\d+$/.test(v.sp) || !/^\d+$/.test(v.dp) || Number(v.sp)+Number(v.dp)<=0) return 'Final Drawing dates and Standard/Drawn counts are required.';
      if (v.ce<v.cs || v.me<v.ms || v.de<v.ds) return 'An end date cannot be before its start date.';
    }
    return '';
  }
  async function save(complete) {
    if (!activeRequestId) return;
    const v=values(); const error=validate(v,complete); if(error){$('expertWorkError').textContent=error;return;}
    const buttons=[$('expertWorkSave'),$('expertWorkComplete')]; buttons.forEach(b=>b.disabled=true); $('expertWorkError').textContent='';
    try {
      if (activeAction==='accept') {
        await json(`${API}/auth/expert-work/${activeRequestId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stage:'PREDICTION',partCount:Number(v.predicted)})});
        await json(`${API}/drawing-requests/${activeRequestId}/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'accept',comment:''})});
      } else {
        const rows=[
          ['CROQUIS',{startDate:v.cs,endDate:v.ce,partCount:Number(v.cp)}],
          ['MODELING',{startDate:v.ms,endDate:v.me,partCount:Number(v.mp)}],
          ['DRAWING',{startDate:v.ds,endDate:v.de,standardPartCount:Number(v.sp),drawnPartCount:Number(v.dp)}]
        ];
        for(const [stage,payload] of rows){ if(payload.startDate||payload.endDate||payload.partCount!==undefined&&payload.partCount!==null||stage==='DRAWING'&&(v.sp!==''||v.dp!=='')){ await json(`${API}/auth/expert-work/${activeRequestId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stage,...payload})}); } }
        if(complete) await json(`${API}/drawing-requests/${activeRequestId}/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'complete',comment:''})});
      }
      close();
      if(window.DMS?.loadDrawingWorklist) await window.DMS.loadDrawingWorklist();
      if(window.DMS?.refreshPendingRequestBadge) window.DMS.refreshPendingRequestBadge();
    } catch(e) { $('expertWorkError').textContent=e.message; }
    finally { buttons.forEach(b=>b.disabled=false); }
  }
  async function open(action, requestId) {
    ensureModal(); activeAction=action; activeRequestId=Number(requestId); $('expertWorkTitle').textContent=action==='accept'?'Accept Drawing Work':'Complete Drawing Work'; $('expertWorkSubtitle').textContent=`Request ${requestId}`; $('expertWorkError').textContent=''; $('expertWorkBody').innerHTML='<div class="rw-loading">Loading expert work data...</div>'; $('expertWorkSave').hidden=action==='accept'; $('expertWorkComplete').textContent=action==='accept'?'Accept Work':'Complete Work'; $('expertWorkModal').classList.remove('hidden');
    try { const data=await json(`${API}/auth/expert-work/${activeRequestId}`); $('expertWorkBody').innerHTML=action==='accept'?renderPrediction(data):renderStages(data); }
    catch(e){$('expertWorkError').textContent=e.message;}
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-details-action],[data-request-action]'); if(!b)return;
    const action=b.dataset.detailsAction||b.dataset.requestAction;
    if(action!=='accept'&&action!=='complete')return;
    event.preventDefault(); event.stopImmediatePropagation();
    open(action,Number(b.dataset.requestId));
  },true);
  document.addEventListener('DOMContentLoaded',ensureModal);
})();
