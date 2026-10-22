(() => {
  'use strict';
  const API = `${window.DMS_API_BASE || ''}/api`;
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
  async function getAllRows(tableName, sortBy){
    const pageSize=200;
    let page=1, total=Infinity, rows=[];
    while(rows.length<total){
      const sort=sortBy?`&sortBy=${encodeURIComponent(sortBy)}&sortDir=asc`:'';
      const data=await getJson(`${API}/admin/tables/${encodeURIComponent(tableName)}/rows?page=${page}&pageSize=${pageSize}${sort}`);
      const batch=data.rows||[];
      rows=rows.concat(batch);
      total=Number(data.total||rows.length);
      if(batch.length===0) break;
      page++;
    }
    return rows;
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

  const reportState = { experts: [], months: [] };
  const reportFmt = value => Number(value || 0).toLocaleString('en-US');
  const reportNum = (row, key) => Number(row?.[key] || 0);
  function reportDateToIso(value) {
    if (!window.DMSDate) throw new Error('Jalali date utility did not load.');
    return window.DMSDate.fromJalaliInput(value, true);
  }
  function reportDefaultDates() {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 89);
    $('reportStartDate').value = window.DMSDate.toJalaliInput(start, true);
    $('reportEndDate').value = window.DMSDate.toJalaliInput(end, true);
  }
  function completedDate(value){
    if(!value) return null;
    const s=String(value).slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null;
  }
  function inReportRange(date,start,end){return Boolean(date&&date>=start&&date<=end);}
  function positivePartCount(value){
    const n=Number(value);
    return Number.isFinite(n)&&n>0?n:0;
  }
  function jalaliMonthForDate(isoDate) {
    if (!isoDate) return null;
    const jalaliDate = window.DMSDate.toJalaliInput(new Date(isoDate + 'T12:00:00'), true);
    const parts = jalaliDate.split('/');
    return parts.length === 3 && parts[0].length === 4 && parts[1].length === 2 && parts[2].length === 2
      ? parts.slice(0, 2).join('/')
      : null;
  }
  function addPredictionMonth(monthly,date,count){
    const month=jalaliMonthForDate(date);
    if(!month) return;
    if(!monthly.has(month)) monthly.set(month,{JalaliMonth:month,PredictedParts:0,CroquisParts:0,ModelingParts:0,StandardParts:0,DrawnParts:0});
    monthly.get(month).PredictedParts+=positivePartCount(count);
  }

  // Production is calculated from completed stage records only.
  // Each AssignmentID has at most one ExpertWork row by database constraint.
  // A delegated assignment remains valid production for the expert who actually completed that stage.
  function buildProductionReport(workRows,assignmentRows,userRows,startDate,endDate){
    const assignments=new Map(assignmentRows.map(a=>[Number(a.AssignmentID),a]));
    const users=new Map(userRows.map(u=>[Number(u.UserID),u]));
    const experts=new Map();
    const monthly=new Map();
    const predictions=new Map();
    const countedWork=new Set();

    const ensureMonth=(date)=>{
      const month=jalaliMonthForDate(date);
      if(!month) return null;
      if(!monthly.has(month)) monthly.set(month,{JalaliMonth:month,PredictedParts:0,CroquisParts:0,ModelingParts:0,StandardParts:0,DrawnParts:0});
      return monthly.get(month);
    };
    const addStage=(assignment,stageDate,field,count)=>{
      if(!stageDate||!inReportRange(stageDate,startDate,endDate)) return;
      const parts=positivePartCount(count);
      if(parts<=0) return;
      const userId=Number(assignment.DrawingExpertUserID);
      const u=users.get(userId)||{};
      const expertName=(String(u.Name||'')+' '+String(u.Family||'')).trim()||assignment.DrawingExpertUsername||u.Username||'Unknown';
      if(!experts.has(userId)) experts.set(userId,{UserID:userId,Username:u.Username||assignment.DrawingExpertUsername||'',ExpertName:expertName,CroquisParts:0,ModelingParts:0,StandardParts:0,DrawnParts:0});
      experts.get(userId)[field]+=parts;
      const monthRow=ensureMonth(stageDate);
      if(monthRow) monthRow[field]+=parts;
    };

    for(const w of workRows){
      const assignmentId=Number(w.AssignmentID);
      if(!Number.isFinite(assignmentId)||countedWork.has(assignmentId)) continue;
      const a=assignments.get(assignmentId);
      if(!a) continue;
      countedWork.add(assignmentId);

      addStage(a,completedDate(w.CroquisEndDate),'CroquisParts',w.CroquisPartCount);
      addStage(a,completedDate(w.ModelingEndDate),'ModelingParts',w.ModelingPartCount);
      addStage(a,completedDate(w.DrawingEndDate),'StandardParts',w.StandardPartCount);
      addStage(a,completedDate(w.DrawingEndDate),'DrawnParts',w.DrawnPartCount);

      const prediction=positivePartCount(w.PredictedPartCount);
      if(prediction>0){
        const requestId=Number(a.RequestID);
        if(Number.isFinite(requestId)){
          const assignedDate=completedDate(a.AssignedAt);
          const acceptedAt=String(a.AcceptedAt||a.AssignedAt||'');
          const previous=predictions.get(requestId);
          if(!previous||acceptedAt>previous.acceptedAt||(acceptedAt===previous.acceptedAt&&assignmentId>previous.assignmentId)){
            predictions.set(requestId,{prediction,assignmentId,assignedDate,acceptedAt});
          }
        }
      }
    }

    for(const p of predictions.values()){
      if(p.assignedDate&&inReportRange(p.assignedDate,startDate,endDate)) addPredictionMonth(monthly,p.assignedDate,p.prediction);
    }

    const months=[...monthly.values()].sort((a,b)=>a.JalaliMonth.localeCompare(b.JalaliMonth));
    return {
      experts:[...experts.values()].sort((a,b)=>String(a.ExpertName).localeCompare(String(b.ExpertName))),
      months,
      predictedParts:[...predictions.values()].filter(p=>p.assignedDate&&inReportRange(p.assignedDate,startDate,endDate)).reduce((n,p)=>n+p.prediction,0)
    };
  }
  function renderExpertReport() {
    document.querySelectorAll('.report-legend[data-report-legend="expert"]').forEach(el => el.remove());
    const selected = $('reportExpertFilter').value;
    const rows = selected === 'all' ? reportState.experts : reportState.experts.filter(x => String(x.UserID) === selected);
    const chart = $('expertPerformanceChart');
    if (!rows.length) chart.innerHTML = '<div class="chart-empty">No expert contributions in this date range.</div>';
    else {
      const keys = [['CroquisParts','','Croquis'],['ModelingParts','modeling','Modeling'],['StandardParts','standard','Standard parts'],['DrawnParts','drawn','Drawn parts']];
      const max = Math.max(1, ...rows.flatMap(x => keys.map(([key]) => reportNum(x,key))));
      chart.innerHTML = rows.map(x => '<div class="report-bar-group"><div class="report-bar-label">' + escapeHtml(x.ExpertName || x.Username) + '</div><div class="report-bar-stack">' + keys.map(([key,cls,label]) => '<div class="report-bar '+cls+'" title="'+label+': '+reportFmt(x[key])+'" style="height:'+Math.max(2,reportNum(x,key)/max*138)+'px"></div>').join('') + '</div><div class="report-bar-value">C '+reportFmt(x.CroquisParts)+' / M '+reportFmt(x.ModelingParts)+' / S '+reportFmt(x.StandardParts)+' / D '+reportFmt(x.DrawnParts)+'</div></div>').join('');
      chart.insertAdjacentHTML('beforebegin','<div class="report-legend"><span>Croquis</span><span class="legend-modeling">Modeling</span><span class="legend-standard">Standard parts</span><span class="legend-drawn">Drawn parts</span></div>');
      const legend=chart.previousElementSibling;if(legend?.classList.contains('report-legend'))legend.dataset.reportLegend='expert';
    }
    const body=$('expertPerformanceRows');
    if(!rows.length) body.innerHTML='<tr><td colspan="6" class="report-empty">No data for the selected filters.</td></tr>';
    else {
      const dataRows=rows.map(x=>{const c=reportNum(x,'CroquisParts'),m=reportNum(x,'ModelingParts'),s=reportNum(x,'StandardParts'),d=reportNum(x,'DrawnParts');return '<tr><td>'+escapeHtml(x.ExpertName||x.Username)+'</td><td>'+reportFmt(c)+'</td><td>'+reportFmt(m)+'</td><td>'+reportFmt(s)+'</td><td>'+reportFmt(d)+'</td><td><strong>'+reportFmt(c+m+s+d)+'</strong></td></tr>';}).join('');
      const totals=rows.reduce((a,x)=>({c:a.c+reportNum(x,'CroquisParts'),m:a.m+reportNum(x,'ModelingParts'),s:a.s+reportNum(x,'StandardParts'),d:a.d+reportNum(x,'DrawnParts')}),{c:0,m:0,s:0,d:0});
      body.innerHTML=dataRows+'<tr class="report-total-row"><td>Total</td><td>'+reportFmt(totals.c)+'</td><td>'+reportFmt(totals.m)+'</td><td>'+reportFmt(totals.s)+'</td><td>'+reportFmt(totals.d)+'</td><td>'+reportFmt(totals.c+totals.m+totals.s+totals.d)+'</td></tr>';
    }
  }
  function renderMonthlyReport() {
    const rows=reportState.months;
    const chart=$('monthlyProductionChart');
    if(!rows.length) chart.innerHTML='<div class="chart-empty">No production events in this date range.</div>';
    else {
      const keys=[['CroquisParts','','Croquis'],['ModelingParts','modeling','Modeling'],['StandardParts','standard','Standard parts'],['DrawnParts','drawn','Drawn parts'],['PredictedParts','predicted','Predicted']];
      const max=Math.max(1,...rows.flatMap(x=>keys.map(([key])=>reportNum(x,key))));
      chart.innerHTML=rows.map(x=>'<div class="report-bar-group"><div class="report-bar-label">'+escapeHtml(x.JalaliMonth)+'</div><div class="report-bar-stack">'+keys.map(([key,cls,label])=>'<div class="report-bar '+cls+'" title="'+label+': '+reportFmt(x[key])+'" style="height:'+Math.max(2,reportNum(x,key)/max*150)+'px"></div>').join('')+'</div><div class="report-bar-value">C '+reportFmt(x.CroquisParts)+' · M '+reportFmt(x.ModelingParts)+' · S '+reportFmt(x.StandardParts)+' · D '+reportFmt(x.DrawnParts)+' · P '+reportFmt(x.PredictedParts)+'</div></div>').join('');
      chart.insertAdjacentHTML('beforebegin','<div class="report-legend"><span>Croquis</span><span class="legend-modeling">Modeling</span><span class="legend-standard">Standard parts</span><span class="legend-drawn">Drawn parts</span><span class="legend-predicted">Predicted parts</span></div>');
      const legend=chart.previousElementSibling;if(legend?.classList.contains('report-legend'))legend.dataset.reportLegend='monthly';
    }
    const body=$('monthlyProductionRows');
    if(!rows.length){body.innerHTML='<tr><td colspan="7" class="report-empty">No data for the selected date range.</td></tr>';return;}
    const totals=rows.reduce((a,x)=>({p:a.p+reportNum(x,'PredictedParts'),c:a.c+reportNum(x,'CroquisParts'),m:a.m+reportNum(x,'ModelingParts'),s:a.s+reportNum(x,'StandardParts'),d:a.d+reportNum(x,'DrawnParts')}),{p:0,c:0,m:0,s:0,d:0});
    body.innerHTML=rows.map(x=>'<tr><td>'+escapeHtml(x.JalaliMonth)+'</td><td>'+reportFmt(x.PredictedParts)+'</td><td>'+reportFmt(x.CroquisParts)+'</td><td>'+reportFmt(x.ModelingParts)+'</td><td>'+reportFmt(x.StandardParts)+'</td><td>'+reportFmt(x.DrawnParts)+'</td><td>'+reportFmt(reportNum(x,'CroquisParts')+reportNum(x,'ModelingParts')+reportNum(x,'StandardParts')+reportNum(x,'DrawnParts'))+'</td></tr>').join('')+'<tr class="report-total-row"><td>Total</td><td>'+reportFmt(totals.p)+'</td><td>'+reportFmt(totals.c)+'</td><td>'+reportFmt(totals.m)+'</td><td>'+reportFmt(totals.s)+'</td><td>'+reportFmt(totals.d)+'</td><td>'+reportFmt(totals.c+totals.m+totals.s+totals.d)+'</td></tr>';
  }
  async function loadProductionReports(){
    const message=$('reportMessage');
    try{
      const startDate=reportDateToIso($('reportStartDate').value);const endDate=reportDateToIso($('reportEndDate').value);
      if(!startDate||!endDate||startDate>endDate)throw new Error('بازه تاریخ شمسی معتبر نیست؛ تاریخ شروع باید قبل از تاریخ پایان باشد.');
      message.textContent='Loading production reports...';
      const [workRows,assignmentRows,userRows]=await Promise.all([getAllRows('DrawingRequestExpertWork','AssignmentID'),getAllRows('DrawingRequestAssignments','AssignmentID'),getAllRows('Users','UserID')]);
      const report=buildProductionReport(workRows,assignmentRows,userRows,startDate,endDate);
      reportState.experts=report.experts;reportState.months=report.months;
      const select=$('reportExpertFilter');const previous=select.value;
      select.innerHTML='<option value="all">All experts</option>'+reportState.experts.map(x=>'<option value="'+escapeHtml(x.UserID)+'">'+escapeHtml(x.ExpertName||x.Username)+'</option>').join('');
      if([...select.options].some(o=>o.value===previous))select.value=previous;
      document.querySelectorAll('.report-legend').forEach(el=>el.remove());renderExpertReport();renderMonthlyReport();
      message.textContent='Report period: '+window.DMSDate.toJalaliInput(new Date(startDate),true)+' تا '+window.DMSDate.toJalaliInput(new Date(endDate),true)+'. Production counts use each completed stage EndDate; each assignment is counted once; predictions are counted once per request.';
    }catch(e){console.error(e);message.textContent=e.message||'Could not load production reports.';$('expertPerformanceChart').innerHTML='<div class="chart-empty">Report unavailable.</div>';$('monthlyProductionChart').innerHTML='<div class="chart-empty">Report unavailable.</div>';$('expertPerformanceRows').innerHTML='<tr><td colspan="5" class="report-empty">Report unavailable.</td></tr>';$('monthlyProductionRows').innerHTML='<tr><td colspan="7" class="report-empty">Report unavailable.</td></tr>';}
  }

  $('refreshButton').addEventListener('click',load);$('backButton').addEventListener('click',()=>location.href='index.html');$('backButtonBottom').addEventListener('click',()=>location.href='index.html');$('managementButton').addEventListener('click',()=>location.href='management.html');
  $('loadProductionReports').addEventListener('click',loadProductionReports);$('reportExpertFilter').addEventListener('change',renderExpertReport);reportDefaultDates();loadProductionReports();load();
})();
