(() => {
'use strict';
const $=id=>document.getElementById(id);
const modal=$('dmsAuditModal'), open=$('dmsAuditOpen'), close=$('dmsAuditClose'), form=$('dmsAuditSearchForm');
const mode=$('dmsAuditMode'), nodeField=$('dmsAuditNodeField'), userField=$('dmsAuditUserField');
const results=$('dmsAuditResults'), status=$('dmsAuditStatus'), detail=$('dmsAuditDetail');
const prev=$('dmsAuditPrev'), next=$('dmsAuditNext'), pageLabel=$('dmsAuditPage');
const api=(window.DMS_API_BASE||'')+'/api/auth/audit';
const permissionCodes=['LOG_ACCESS_FILE','LOG_ACCESS_NODE','LOG_ACCESS_WORKFLOW','LOG_ACCESS_USER_RBAC','LOG_ACCESS_AUTHENTICATION'];
let page=1,pages=1,previousOverflow='';
const say=value=>{status.textContent=value||'';};
const text=value=>value===null||value===undefined||value===''?'—':String(value);
const date=value=>window.DMSDate?window.DMSDate.format(value):text(value);
function setMode(){const isNode=mode.value==='node';nodeField.classList.toggle('hidden',!isNode);userField.classList.toggle('hidden',isNode);$('dmsAuditNode').required=isNode;$('dmsAuditUsername').required=!isNode;}
function show(){previousOverflow=document.body.style.overflow;modal.classList.remove('hidden');document.body.style.overflow='hidden';mode.focus();}
function hide(){modal.classList.add('hidden');document.body.style.overflow=previousOverflow;}
function drawRows(rows){
 results.replaceChildren();
 if(!rows.length){const p=document.createElement('p');p.className='dms-audit-empty';p.textContent='No audit events found for this search.';results.append(p);return;}
 const table=document.createElement('table');table.className='dms-audit-table';
 const head=document.createElement('thead'),tr=document.createElement('tr');
 ['Date / Time','Actor','Category','Action','Target',''].forEach(label=>{const th=document.createElement('th');th.textContent=label;tr.append(th);});head.append(tr);table.append(head);
 const body=document.createElement('tbody');
 rows.forEach(row=>{const tr=document.createElement('tr');
 [date(row.CreatedAt),text(row.UserName),text(row.Category),text(row.Action),[row.TargetType,row.TargetID].filter(Boolean).join(' / ')||'—'].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});
 const td=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='dms-audit-detail-btn';button.textContent='Details';button.addEventListener('click',()=>loadDetail(row.LogID));td.append(button);tr.append(td);body.append(tr);});
 table.append(body);results.append(table);
}
function detailLabel(key){
 const known={LogID:'Log ID',UserID:'User ID',UserName:'Actor',Category:'Category',Action:'Action',IPAddress:'IP address',CreatedAt:'Date / time',TargetType:'Target type',TargetID:'Target ID'};
 if(known[key])return known[key];
 return String(key).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
function addDetailRow(body,field,value){
 const tr=document.createElement('tr'),th=document.createElement('th'),td=document.createElement('td');
 th.scope='row';th.textContent=field;td.textContent=value;tr.append(th,td);body.append(tr);
}
function appendDetailValue(body,path,value,depth){
 if(value&&typeof value==='object'){
  const entries=Array.isArray(value)?value.map((item,index)=>[String(index+1),item]):Object.entries(value);
  if(!entries.length){addDetailRow(body,path,Array.isArray(value)?'Empty list':'No values');return;}
  if(depth>=5){addDetailRow(body,path,JSON.stringify(value));return;}
  entries.forEach(([key,item])=>appendDetailValue(body,path?path+(Array.isArray(value)?' ['+key+']': ' / '+detailLabel(key)):detailLabel(key),item,depth+1));
  return;
 }
 const rendered=value===null||value===undefined||value===''?'—':typeof value==='boolean'?(value?'Yes':'No'):String(value);
 addDetailRow(body,path||'Details',rendered);
}
function detailGroup(body,label){
 const tr=document.createElement('tr'),th=document.createElement('th');tr.className='dms-audit-detail-group';th.colSpan=2;th.textContent=label;tr.append(th);body.append(tr);
}
async function loadDetail(id){
 detail.classList.remove('hidden');detail.textContent='Loading…';
 try{
  const response=await fetch(api+'/'+encodeURIComponent(id),{credentials:'include',cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Unable to load event details.');
  const event=data.event||{},table=document.createElement('table'),head=document.createElement('thead'),headRow=document.createElement('tr'),body=document.createElement('tbody');
  table.className='dms-audit-detail-table';
  ['Field','Value'].forEach(label=>{const th=document.createElement('th');th.scope='col';th.textContent=label;headRow.append(th);});
  head.append(headRow);table.append(head);
  detailGroup(body,'Event information');
  [['LogID',event.LogID],['UserName',event.UserName],['Category',event.Category],['Action',event.Action],['IPAddress',event.IPAddress],['CreatedAt',event.CreatedAt?date(event.CreatedAt):null],['TargetType',event.TargetType],['TargetID',event.TargetID]].forEach(([key,value])=>addDetailRow(body,detailLabel(key),value===null||value===undefined||value===''?'—':String(value)));
  detailGroup(body,'Additional details');
  if(event.details===null||event.details===undefined){addDetailRow(body,'Details','No additional details were recorded.');}
  else if(typeof event.details==='object'){appendDetailValue(body,'',event.details,0);}
  else{appendDetailValue(body,'Details',event.details,0);}
  table.append(body);
  const heading=document.createElement('h3');heading.className='dms-audit-detail-title';heading.textContent='Audit event details';
  const wrap=document.createElement('div');wrap.className='dms-audit-detail-table-wrap';wrap.append(table);
  detail.replaceChildren(heading,wrap);
 }catch(error){detail.textContent=error.message;}
}
async function search(targetPage){
 const from=$('dmsAuditFrom').value.trim(),to=$('dmsAuditTo').value.trim();
 if(!from||!to)throw new Error('Enter both Jalali dates.');
 const start=window.DMSDate.fromJalaliInput(from+' 00:00:00');
 const end=new Date(new Date(window.DMSDate.fromJalaliInput(to+' 23:59:59')).getTime()+1000).toISOString();
 if(new Date(start)>=new Date(end))throw new Error('End date must not be before start date.');
 const params=new URLSearchParams({mode:mode.value,fromUtc:start,toUtc:end,page:String(targetPage),pageSize:'25'});
 if(mode.value==='node'){const value=$('dmsAuditNode').value.trim();if(!value)throw new Error('Enter a Node code or name.');params.set('node',value);}
 else{const value=$('dmsAuditUsername').value.trim();if(!value)throw new Error('Enter an exact username.');params.set('username',value);}
 say('Searching…');results.replaceChildren();detail.classList.add('hidden');
 const response=await fetch(api+'/search?'+params.toString(),{credentials:'include',cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Audit search failed.');
 page=Number(data.page)||targetPage;pages=Math.max(1,Math.ceil((Number(data.total)||0)/(Number(data.pageSize)||25)));drawRows(data.rows||[]);
 pageLabel.textContent='Page '+page+' of '+pages+' · '+(Number(data.total)||0).toLocaleString()+' events';prev.disabled=page<=1;next.disabled=page>=pages;say('');
}
open.addEventListener('click',show);close.addEventListener('click',hide);
modal.addEventListener('click',event=>{if(event.target===modal)hide();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.classList.contains('hidden'))hide();});
mode.addEventListener('change',setMode);
form.addEventListener('submit',event=>{event.preventDefault();search(1).catch(error=>say(error.message));});
prev.addEventListener('click',()=>search(page-1).catch(error=>say(error.message)));
next.addEventListener('click',()=>search(page+1).catch(error=>say(error.message)));
setMode();
fetch((window.DMS_API_BASE||'')+'/api/auth/me',{credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{const granted=new Set(data?.permissions||[]);if(permissionCodes.some(code=>granted.has(code)))open.classList.remove('hidden');}).catch(()=>{});
})();