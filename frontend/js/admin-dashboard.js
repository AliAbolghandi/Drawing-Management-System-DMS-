(() => {
  'use strict';
  const host = window.location.hostname || 'localhost';
  const API = `http://${host}:3000/api`;
  const $ = id => document.getElementById(id);
  const fmt = value => Number(value || 0).toLocaleString('en-US');
  const escapeHtml = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const state = { tables:new Map(), rows:new Map() };

  async function getJson(url){
    const response=await fetch(url,{credentials:'include',cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(response.status===401){window.location.replace('login.html');throw new Error('Authentication required.');}
    if(response.status===403) throw new Error('Admin access is required.');
    if(!response.ok) throw new Error(data.error||`HTTP ${response.status}`);
    return data;
  }
  function showError(message){$('dashboardError').textContent=message;$('dashboardError').classList.remove('hidden');}
  function renderActivity(logs){
    const box=$('activityChart');
    if(!logs.length){box.innerHTML='<div class="chart-empty">No audit activity recorded.</div>';return;}
    const days=[];
    for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);days.push(d);}
    const counts=days.map(d=>logs.filter(x=>{const t=new Date(x.CreatedAt);return !Number.isNaN(t.getTime())&&t.toDateString()===d.toDateString()}).length);
    const max=Math.max(1,...counts);
    box.innerHTML=days.map((d,i)=>`<div class="bar-item"><span class="bar-value">${fmt(counts[i])}</span><div class="bar" style="height:${Math.max(3,(counts[i]/max)*190)}px"></div><span class="bar-label">${d.toLocaleDateString('en-US',{weekday:'short'})}</span></div>`).join('');
  }
  function renderWorkflow(rows){
    const box=$('workflowChart');
    if(!state.tables.has('DrawingRequests')){box.innerHTML='<div class="chart-empty">Drawing request workflow is not installed in the current database.</div>';return;}
    const counts=new Map();
    rows.forEach(r=>{const status=String(r.StatusID??r.StatusCode??'Unknown');counts.set(status,(counts.get(status)||0)+1);});
    if(!counts.size){box.innerHTML='<div class="chart-empty">No drawing requests recorded.</div>';return;}
    const items=[...counts.entries()].sort((a,b)=>b[1]-a[1]);const max=items[0][1];
    box.innerHTML=items.map(([status,count])=>`<div class="status-item"><div class="status-item-top"><span>Status ${escapeHtml(status)}</span><strong>${fmt(count)}</strong></div><div class="status-track"><div class="status-fill" style="width:${(count/max)*100}%"></div></div></div>`).join('');
  }
  function renderRecent(logs){
    const box=$('recentActivity');
    if(!logs.length){box.innerHTML='<div class="chart-empty">No audit activity recorded.</div>';return;}
    box.innerHTML=logs.slice(0,12).map(x=>{const d=new Date(x.CreatedAt);const time=Number.isNaN(d.getTime())?'-':d.toLocaleString('en-US',{dateStyle:'short',timeStyle:'short'});return `<div class="recent-row"><span class="recent-time">${escapeHtml(time)}</span><span class="recent-user">${escapeHtml(x.UserName||'System')}</span><span class="recent-action">${escapeHtml(x.Action||'-')}</span></div>`;}).join('');
  }
  async function load(){
    $('generatedAt').textContent='Refreshing...';$('dashboardError').classList.add('hidden');
    try{
      const meta=await getJson(`${API}/admin/tables`);
      state.tables.clear();(meta.tables||[]).forEach(t=>state.tables.set(t.tableName,t));
      const count=name=>state.tables.get(name)?.approxRows||0;
      $('totalNodes').textContent=fmt(count('Nodes'));$('danieliPdfs').textContent=fmt(count('DanieliPDF'));$('totalUsers').textContent=fmt(count('Users'));$('activeRoles').textContent=fmt(count('Roles'));$('totalLogs').textContent=fmt(count('Logs'));$('totalRequests').textContent=state.tables.has('DrawingRequests')?fmt(count('DrawingRequests')):'N/A';
      const [users,logs,requests]=await Promise.all([
        getJson(`${API}/admin/tables/Users/rows?page=1&pageSize=200`),
        getJson(`${API}/admin/tables/Logs/rows?page=1&pageSize=200&sortBy=CreatedAt&sortDir=desc`),
        state.tables.has('DrawingRequests')?getJson(`${API}/admin/tables/DrawingRequests/rows?page=1&pageSize=200&sortBy=CreatedAt&sortDir=desc`):Promise.resolve({rows:[]})
      ]);
      state.rows.set('Users',users.rows||[]);state.rows.set('Logs',logs.rows||[]);state.rows.set('DrawingRequests',requests.rows||[]);
      const activeUsers=(users.rows||[]).filter(x=>Number(x.IsActive)===1).length;
      const today=new Date();today.setHours(0,0,0,0);
      const todayLogs=(logs.rows||[]).filter(x=>{const d=new Date(x.CreatedAt);return !Number.isNaN(d.getTime())&&d>=today}).length;
      $('activeUsers').textContent=`${fmt(activeUsers)} active`;$('todayLogs').textContent=`${fmt(todayLogs)} today`;
      $('activeNodes').textContent='Database records';$('activeRequests').textContent=state.tables.has('DrawingRequests')?`${fmt(requests.rows.length)} latest loaded`:'Workflow unavailable';
      $('healthNodes').textContent=fmt(count('Nodes'));$('healthUsers').textContent=fmt(activeUsers);$('healthNotifications').textContent=state.tables.has('Notifications')?fmt(count('Notifications')):'N/A';$('healthFailed').textContent=fmt((logs.rows||[]).filter(x=>String(x.Action||'').includes('FAILED')).length);
      renderActivity(logs.rows||[]);renderWorkflow(requests.rows||[]);renderRecent(logs.rows||[]);
      $('generatedAt').textContent=`Updated ${new Date().toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})}`;
    }catch(e){console.error(e);showError(e.message);$('generatedAt').textContent='Load failed';}
  }
  $('refreshButton').addEventListener('click',load);$('backButton').addEventListener('click',()=>location.href='index.html');$('backButtonBottom').addEventListener('click',()=>location.href='index.html');$('managementButton').addEventListener('click',()=>location.href='management.html');load();
})();
