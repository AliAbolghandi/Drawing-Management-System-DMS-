(() => {
  'use strict';

  const API = `${window.DMS_API_BASE || ''}/api`;
  const $ = id => document.getElementById(id);
  const fmt = value => Number(value || 0).toLocaleString('en-US');
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  async function getJson(url) {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { window.location.replace('login.html'); throw new Error('Authentication required.'); }
    if (response.status === 403) throw new Error('Admin access is required.');
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function getAllRows(tableName, sortBy) {
    const pageSize = 200;
    let page = 1;
    let total = Infinity;
    const rows = [];
    while (rows.length < total) {
      const sort = sortBy ? `&sortBy=${encodeURIComponent(sortBy)}&sortDir=asc` : '';
      const data = await getJson(`${API}/admin/tables/${encodeURIComponent(tableName)}/rows?page=${page}&pageSize=${pageSize}${sort}`);
      const batch = data.rows || [];
      rows.push(...batch);
      total = Number(data.total || rows.length);
      if (!batch.length) break;
      page++;
    }
    return rows;
  }

  function completedDate(value) {
    if (!value) return null;
    const s = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }

  function positive(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function inRange(date, start, end) {
    return Boolean(date && date >= start && date <= end);
  }

  function jalaliMonthForDate(isoDate) {
    if (!isoDate) return null;
    const jalaliDate = window.DMSDate.toJalaliInput(new Date(isoDate + 'T12:00:00'), true);
    const parts = jalaliDate.split('/');
    return parts.length === 3 && parts[0].length === 4 && parts[1].length === 2 && parts[2].length === 2
      ? parts.slice(0, 2).join('/')
      : null;
  }

  function buildMonthlyProduction(workRows, assignmentRows, startDate, endDate) {
    const assignments = new Map(assignmentRows.map(row => [Number(row.AssignmentID), row]));
    const monthly = new Map();
    const countedAssignments = new Set();

    const ensureMonth = date => {
      const month = jalaliMonthForDate(date);
      if (!month) return null;
      if (!monthly.has(month)) {
        monthly.set(month, { JalaliMonth: month, CroquisParts: 0, ModelingParts: 0, DrawingParts: 0 });
      }
      return monthly.get(month);
    };

    for (const work of workRows) {
      const assignmentId = Number(work.AssignmentID);
      if (!Number.isFinite(assignmentId) || countedAssignments.has(assignmentId)) continue;
      if (!assignments.has(assignmentId)) continue;
      countedAssignments.add(assignmentId);

      const croquisDate = completedDate(work.CroquisEndDate);
      if (inRange(croquisDate, startDate, endDate)) {
        const monthRow = ensureMonth(croquisDate);
        if (monthRow) monthRow.CroquisParts += positive(work.CroquisPartCount);
      }

      const modelingDate = completedDate(work.ModelingEndDate);
      if (inRange(modelingDate, startDate, endDate)) {
        const monthRow = ensureMonth(modelingDate);
        if (monthRow) monthRow.ModelingParts += positive(work.ModelingPartCount);
      }

      const drawingDate = completedDate(work.DrawingEndDate);
      if (inRange(drawingDate, startDate, endDate)) {
        const monthRow = ensureMonth(drawingDate);
        if (monthRow) monthRow.DrawingParts += positive(work.StandardPartCount) + positive(work.DrawnPartCount);
      }
    }

    return [...monthly.values()]
      .filter(row => row.CroquisParts > 0 || row.ModelingParts > 0 || row.DrawingParts > 0)
      .sort((a, b) => a.JalaliMonth.localeCompare(b.JalaliMonth));
  }

  function render(rows) {
    const chart = $('monthlyProductionChart');
    const body = $('monthlyProductionRows');
    if (!chart || !body) return;

    document.querySelectorAll('.report-legend[data-report-legend="monthly"]').forEach(el => el.remove());

    if (!rows.length) {
      chart.innerHTML = '<div class="chart-empty">No production events in this date range.</div>';
      body.innerHTML = '<tr><td colspan="5" class="report-empty">No production data for the selected date range.</td></tr>';
      return;
    }

    const keys = [
      ['CroquisParts', '', 'Croquis'],
      ['ModelingParts', 'modeling', 'Modeling'],
      ['DrawingParts', 'drawing', 'Final Drawing']
    ];
    const max = Math.max(1, ...rows.flatMap(row => keys.map(([key]) => Number(row[key] || 0))));

    chart.innerHTML = rows.map(row => {
      const month = row.JalaliMonth;
      const bars = keys.map(([key, cls, label]) => {
        const value = Number(row[key] || 0);
        const height = value > 0 ? Math.max(2, value / max * 150) : 0;
        return `<div class="report-bar ${cls}" title="${label}: ${fmt(value)}" style="height:${height}px"></div>`;
      }).join('');
      return `<div class="report-bar-group"><div class="report-bar-label">${esc(month)}</div><div class="report-bar-stack">${bars}</div><div class="report-bar-value">C ${fmt(row.CroquisParts)} · M ${fmt(row.ModelingParts)} · D ${fmt(row.DrawingParts)}</div></div>`;
    }).join('');

    chart.insertAdjacentHTML('beforebegin', '<div class="report-legend" data-report-legend="monthly"><span>Croquis</span><span class="legend-modeling">Modeling</span><span class="legend-drawing">Final Drawing</span></div>');

    const totals = rows.reduce((acc, row) => ({
      c: acc.c + Number(row.CroquisParts || 0),
      m: acc.m + Number(row.ModelingParts || 0),
      d: acc.d + Number(row.DrawingParts || 0)
    }), { c: 0, m: 0, d: 0 });

    body.innerHTML = rows.map(row => {
      const month = row.JalaliMonth;
      return `<tr><td>${esc(month)}</td><td>${fmt(row.CroquisParts)}</td><td>${fmt(row.ModelingParts)}</td><td>${fmt(row.DrawingParts)}</td><td><strong>${fmt(Number(row.CroquisParts || 0) + Number(row.ModelingParts || 0) + Number(row.DrawingParts || 0))}</strong></td></tr>`;
    }).join('') + `<tr class="report-total-row"><td>Total</td><td>${fmt(totals.c)}</td><td>${fmt(totals.m)}</td><td>${fmt(totals.d)}</td><td>${fmt(totals.c + totals.m + totals.d)}</td></tr>`;
  }

  async function refreshMonthlyProduction() {
    try {
      const startDate = window.DMSDate.fromJalaliInput($('reportStartDate').value, true);
      const endDate = window.DMSDate.fromJalaliInput($('reportEndDate').value, true);
      if (!startDate || !endDate || startDate > endDate) return;

      const [workRows, assignmentRows] = await Promise.all([
        getAllRows('DrawingRequestExpertWork', 'AssignmentID'),
        getAllRows('DrawingRequestAssignments', 'AssignmentID')
      ]);

      render(buildMonthlyProduction(workRows, assignmentRows, startDate, endDate));
    } catch (error) {
      console.error('Monthly Production refresh failed:', error);
    }
  }

  window.addEventListener('load', () => {
    setTimeout(refreshMonthlyProduction, 100);
    const button = $('loadProductionReports');
    if (button) button.addEventListener('click', () => setTimeout(refreshMonthlyProduction, 100));
  });
})();
