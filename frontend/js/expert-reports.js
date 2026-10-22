(() => {
  'use strict';

  const PERMISSION = 'DASHBOARD_REPORT_EXPERT';
  const API = `${window.DMS_API_BASE || ''}/api`;
  const $ = id => document.getElementById(id);
  const fmt = value => Number(value || 0).toLocaleString('en-US');
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  const state = { experts: [], daily: [], startDate: '', endDate: '', selectedExpert: 'all' };
  const stageDefs = [
    ['CroquisParts', 'Croquis', ''],
    ['ModelingParts', 'Modeling', 'modeling'],
    ['StandardParts', 'Standard parts', 'standard'],
    ['DrawnParts', 'Drawn parts', 'drawn']
  ];

  function jalaliToIso(value) {
    if (!window.DMSDate) throw new Error('Jalali date utility did not load.');
    const iso = window.DMSDate.fromJalaliInput(String(value || '').trim(), true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) throw new Error('Invalid Jalali date.');
    return iso;
  }

  function defaultRange() {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 89);
    return {
      start: window.DMSDate.toJalaliInput(start, true),
      end: window.DMSDate.toJalaliInput(end, true)
    };
  }

  function ensureModal() {
    if ($('expertReportModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div id="expertReportModal" class="expert-report-modal hidden" role="dialog" aria-modal="true" aria-labelledby="expertReportTitle">
        <div class="expert-report-dialog">
          <header class="expert-report-header">
            <div><span class="expert-report-eyebrow">DMS PERFORMANCE</span><h2 id="expertReportTitle">Expert Reports</h2><p>Completed drawing work by Drawing Expert</p></div>
            <button id="expertReportClose" class="expert-report-close" type="button" aria-label="Close Expert Reports">×</button>
          </header>
          <div class="expert-report-toolbar">
            <div class="expert-report-field"><label for="expertReportStart">From</label><input id="expertReportStart" type="text" inputmode="numeric" placeholder="1405/07/01" aria-label="Start date in Jalali calendar"></div>
            <div class="expert-report-field"><label for="expertReportEnd">To</label><input id="expertReportEnd" type="text" inputmode="numeric" placeholder="1405/07/30" aria-label="End date in Jalali calendar"></div>
            <div class="expert-report-field"><label for="expertReportExpert">Expert</label><select id="expertReportExpert" aria-label="Filter by Drawing Expert"><option value="all">All experts</option></select></div>
            <button id="expertReportRefresh" class="expert-report-refresh" type="button">Refresh Report</button>
          </div>
          <div id="expertReportBody" class="expert-report-body">
            <div id="expertReportStatus" class="expert-report-status" role="status"></div>
            <div class="expert-report-kpis">
              <div class="expert-report-kpi"><span>Completed Parts</span><strong id="expertReportTotal">0</strong></div>
              <div class="expert-report-kpi"><span>Active Experts</span><strong id="expertReportExpertCount">0</strong></div>
              <div class="expert-report-kpi"><span>Top Expert</span><strong id="expertReportTop">-</strong></div>
            </div>
            <div class="expert-report-grid">
              <section class="expert-report-panel"><h3>Expert Parts Completed</h3><p>Stage contribution by expert</p><div id="expertStageChart" class="expert-report-bars"></div><div class="expert-legend"><span>Croquis</span><span class="modeling">Modeling</span><span class="standard">Standard parts</span><span class="drawn">Drawn parts</span></div></section>
              <section class="expert-report-panel"><h3>Expert Comparison</h3><p>Total completed parts per expert</p><div id="expertComparisonChart" class="expert-report-bars"></div></section>
              <section class="expert-report-panel"><h3>Production Trend</h3><p>Completed parts by Jalali month</p><div id="expertTrendChart" class="expert-line-chart"></div></section>
              <section class="expert-report-panel"><h3>Production Share</h3><p>Share of completed parts by expert</p><div id="expertShareChart" class="expert-pie-wrap"></div></section>
              <section class="expert-report-panel wide"><h3>Expert Production Detail</h3><p>Exact completed part counts used by the charts</p><div class="expert-report-table-wrap"><table class="expert-report-table"><thead><tr><th>Expert</th><th>Croquis</th><th>Modeling</th><th>Standard</th><th>Drawn</th><th>Total</th></tr></thead><tbody id="expertReportRows"></tbody></table></div></section>
            </div>
          </div>
        </div>
      </div>`);

    $('expertReportClose').addEventListener('click', closeModal);
    $('expertReportModal').addEventListener('click', event => { if (event.target === $('expertReportModal')) closeModal(); });
    $('expertReportRefresh').addEventListener('click', loadReport);
    $('expertReportExpert').addEventListener('change', () => { state.selectedExpert = $('expertReportExpert').value; render(); });
    ['expertReportStart','expertReportEnd'].forEach(id => $(id).addEventListener('keydown', event => { if (event.key === 'Enter') loadReport(); }));
  }

  function installSidebarItem(permissions) {
    const allowed = Array.isArray(permissions) && permissions.includes(PERMISSION);
    const existing = $('expertReportsNav');
    if (!allowed) {
      existing?.remove();
      return;
    }
    const sidebar = $('dmsMainSidebar');
    const nav = sidebar?.querySelector('.dms-sidebar-nav[aria-label="Workspace"]')
      || sidebar?.querySelector('.dms-sidebar-nav');
    if (!nav) {
      console.error('Expert Reports: workspace navigation was not found inside #dmsMainSidebar.');
      return;
    }
    const button = existing || document.createElement('button');
    button.type = 'button';
    button.id = 'expertReportsNav';
    button.className = 'dms-nav-item';
    button.dataset.dmsNav = 'expert-reports';
    button.innerHTML = '<span class="dms-nav-icon" aria-hidden="true">◫</span><span>Expert Reports</span>';
    button.title = 'Expert Reports';
    if (!button.isConnected) nav.appendChild(button);
    if (button.dataset.handlerAttached !== 'true') {
      button.dataset.handlerAttached = 'true';
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-dms-nav]').forEach(node => node.classList.toggle('active', node === button));
        openModal();
      });
    }
  }

  async function getJson(url) {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { window.location.replace('login.html'); throw new Error('Authentication required.'); }
    if (response.status === 403) throw new Error('Permission denied.');
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function loadReport() {
    ensureModal();
    const status = $('expertReportStatus');
    status.className = 'expert-report-status';
    status.textContent = 'Loading report...';
    const startInput = $('expertReportStart').value.trim();
    const endInput = $('expertReportEnd').value.trim();
    try {
      const startDate = jalaliToIso(startInput);
      const endDate = jalaliToIso(endInput);
      if (startDate > endDate) throw new Error('The start date cannot be after the end date.');
      const data = await getJson(`${API}/auth/expert-reports?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
      state.startDate = startDate; state.endDate = endDate;
      state.experts = Array.isArray(data.experts) ? data.experts : [];
      state.daily = Array.isArray(data.daily) ? data.daily : [];
      populateExpertFilter();
      render();
      status.textContent = `Report range: ${startInput} → ${endInput}`;
    } catch (error) {
      status.className = 'expert-report-status error';
      status.textContent = error.message || 'Unable to load Expert Reports.';
      clearCharts();
    }
  }

  function populateExpertFilter() {
    const select = $('expertReportExpert');
    const current = state.selectedExpert;
    select.innerHTML = '<option value="all">All experts</option>' + state.experts.map(x => `<option value="${esc(x.UserID)}">${esc(x.ExpertName || x.ExpertUsername || 'Unknown')}</option>`).join('');
    select.value = state.experts.some(x => String(x.UserID) === current) ? current : 'all';
    state.selectedExpert = select.value;
  }

  function filteredExperts() {
    return state.selectedExpert === 'all' ? state.experts : state.experts.filter(x => String(x.UserID) === state.selectedExpert);
  }

  function totalOf(row) { return stageDefs.reduce((sum, [key]) => sum + Number(row[key] || 0), 0); }

  function renderStageChart(rows) {
    const box = $('expertStageChart');
    if (!rows.length) { box.innerHTML = '<div class="expert-report-empty">No completed production in the selected range.</div>'; return; }
    const max = Math.max(1, ...rows.flatMap(row => stageDefs.map(([key]) => Number(row[key] || 0))));
    box.innerHTML = rows.map(row => `<div class="expert-bar-column"><div class="expert-bar-stack">${stageDefs.map(([key,,cls]) => `<div class="expert-bar ${cls}" title="${esc(key)}: ${fmt(row[key])}" style="height:${Math.max(2,Number(row[key]||0)/max*170)}px"></div>`).join('')}</div><span class="expert-bar-total">${fmt(totalOf(row))}</span><span class="expert-bar-label" title="${esc(row.ExpertName)}">${esc(row.ExpertName || row.ExpertUsername)}</span></div>`).join('');
  }

  function renderComparison(rows) {
    const box = $('expertComparisonChart');
    if (!rows.length) { box.innerHTML = '<div class="expert-report-empty">No completed production in the selected range.</div>'; return; }
    const sorted = [...rows].sort((a,b) => totalOf(b) - totalOf(a));
    const max = Math.max(1, ...sorted.map(totalOf));
    box.innerHTML = sorted.map(row => `<div class="expert-bar-column"><div class="expert-bar-stack"><div class="expert-bar" title="Total: ${fmt(totalOf(row))}" style="height:${Math.max(2,totalOf(row)/max*170)}px"></div></div><span class="expert-bar-total">${fmt(totalOf(row))}</span><span class="expert-bar-label" title="${esc(row.ExpertName)}">${esc(row.ExpertName || row.ExpertUsername)}</span></div>`).join('');
  }

  function renderTrend() {
    const box = $('expertTrendChart');
    const byMonth = new Map();
    state.daily.forEach(row => {
      const date = String(row.ProductionDate || '').slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !window.DMSDate) return;
      const month = window.DMSDate.toJalaliInput(new Date(date + 'T12:00:00'), true).slice(0,7);
      byMonth.set(month, (byMonth.get(month) || 0) + Number(row.TotalParts || 0));
    });
    const points = [...byMonth.entries()].sort((a,b) => a[0].localeCompare(b[0]));
    if (!points.length) { box.innerHTML = '<div class="expert-report-empty">No monthly production data.</div>'; return; }
    const width=760,height=210,padX=34,padY=20,plotW=width-padX*2,plotH=height-padY*2;
    const max=Math.max(1,...points.map(x=>x[1]));
    const coords=points.map((p,i)=>({x:points.length===1?width/2:padX+(i/(points.length-1))*plotW,y:padY+(1-p[1]/max)*plotH,value:p[1],label:p[0]}));
    const path=coords.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const grid=[0,.25,.5,.75,1].map(r=>`<line class="grid" x1="${padX}" y1="${(padY+r*plotH).toFixed(1)}" x2="${width-padX}" y2="${(padY+r*plotH).toFixed(1)}"/>`).join('');
    box.innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly completed parts trend">${grid}<path class="line" d="${path}"/>${coords.map(p=>`<circle class="point" cx="${p.x}" cy="${p.y}" r="4"><title>${esc(p.label)}: ${fmt(p.value)}</title></circle>`).join('')}</svg><div class="expert-line-labels">${coords.map(p=>`<span>${esc(p.label)}</span>`).join('')}</div>`;
  }

  function renderShare(rows) {
    const box = $('expertShareChart');
    if (!rows.length) { box.innerHTML = '<div class="expert-report-empty">No production share to display.</div>'; return; }
    const sorted=[...rows].sort((a,b)=>totalOf(b)-totalOf(a));
    const total=sorted.reduce((sum,row)=>sum+totalOf(row),0);
    if(total<=0){box.innerHTML='<div class="expert-report-empty">No production share to display.</div>';return;}
    let cursor=0;
    const stops=sorted.map((row,i)=>{const start=cursor;cursor+=(totalOf(row)/total)*360;const end=cursor;const hue=`hsl(${185+i*37} 65% 58%)`;return {row,start,end,hue};});
    const gradient=stops.map(x=>`${x.hue} ${x.start}deg ${x.end}deg`).join(',');
    box.innerHTML=`<div class="expert-pie" style="background:conic-gradient(${gradient})"><div class="expert-pie-center">${fmt(total)}<br>parts</div></div><div class="expert-pie-legend">${stops.map(x=>`<div class="expert-pie-item"><i style="background:${x.hue}"></i><span>${esc(x.row.ExpertName||x.row.ExpertUsername)} — ${fmt(totalOf(x.row))} (${((totalOf(x.row)/total)*100).toFixed(1)}%)</span></div>`).join('')}</div>`;
  }

  function renderTable(rows) {
    const body=$('expertReportRows');
    if(!rows.length){body.innerHTML='<tr><td colspan="6" class="expert-report-empty">No data for the selected filters.</td></tr>';return;}
    const sorted=[...rows].sort((a,b)=>totalOf(b)-totalOf(a));
    body.innerHTML=sorted.map(row=>`<tr><td>${esc(row.ExpertName||row.ExpertUsername||'Unknown')}</td><td>${fmt(row.CroquisParts)}</td><td>${fmt(row.ModelingParts)}</td><td>${fmt(row.StandardParts)}</td><td>${fmt(row.DrawnParts)}</td><td><strong>${fmt(totalOf(row))}</strong></td></tr>`).join('');
  }

  function clearCharts(){['expertStageChart','expertComparisonChart','expertTrendChart','expertShareChart'].forEach(id=>{const el=$(id);if(el)el.innerHTML='<div class="expert-report-empty">Report unavailable.</div>';});$('expertReportRows').innerHTML='<tr><td colspan="6" class="expert-report-empty">Report unavailable.</td></tr>';}

  function render() {
    const rows=filteredExperts();
    const total=rows.reduce((sum,row)=>sum+totalOf(row),0);
    const top=[...rows].sort((a,b)=>totalOf(b)-totalOf(a))[0];
    $('expertReportTotal').textContent=fmt(total);
    $('expertReportExpertCount').textContent=fmt(rows.length);
    $('expertReportTop').textContent=top?`${top.ExpertName||top.ExpertUsername} · ${fmt(totalOf(top))}`:'-';
    renderStageChart(rows);renderComparison(rows);renderTrend();renderShare(rows);renderTable(rows);
  }

  function openModal() {
    ensureModal();
    $('expertReportModal').classList.remove('hidden');
    document.body.classList.add('expert-report-open');
    if (!$('expertReportStart').value) { const range=defaultRange();$('expertReportStart').value=range.start;$('expertReportEnd').value=range.end; }
    loadReport();
  }

  function closeModal() {
    $('expertReportModal')?.classList.add('hidden');
    document.body.classList.remove('expert-report-open');
  }

  document.addEventListener('keydown', event => { if(event.key==='Escape' && !$('expertReportModal')?.classList.contains('hidden')) closeModal(); });

  async function refreshExpertReportsPermission() {
    try {
      const response = await fetch(`${API}/auth/me`, {
        credentials: 'include',
        cache: 'no-store'
      });
      if (!response.ok) {
        installSidebarItem([]);
        if (response.status !== 401 && response.status !== 403) {
          console.error('Expert Reports permission check failed:', response.status);
        }
        return;
      }
      const data = await response.json();
      installSidebarItem(Array.isArray(data.permissions) ? data.permissions : []);
    } catch (error) {
      console.error('Expert Reports permission load failed:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshExpertReportsPermission, { once: true });
  } else {
    refreshExpertReportsPermission();
  }
  // Keep the sidebar aligned with permission changes while this page stays open.
  window.addEventListener('focus', refreshExpertReportsPermission);
})();
