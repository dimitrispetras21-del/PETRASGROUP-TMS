// ═══════════════════════════════════════════════
// MODULE — DASHBOARD
// ═══════════════════════════════════════════════

async function renderDashboard() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading dashboard...');
  try {
    const [trips, orders] = await Promise.all([
      atGet(TABLES.TRIPS),
      atGet(TABLES.ORDERS),
    ]);

    const activeTrips   = trips.filter(r => !r.fields['Actual Delivery Date']);
    const pendingOrders = orders.filter(r => !r.fields['Trip']);
    const wn            = currentWeekNumber();
    const thisWeek      = trips.filter(r => r.fields['Week Number'] == wn);

    c.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Dashboard</div>
          <div class="page-sub">Good morning, ${user.name} — ${new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Active Trips</div>
          <div class="kpi-value" style="color:#0284C7">${activeTrips.length}</div>
          <div class="kpi-delta">Currently in progress</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">This Week</div>
          <div class="kpi-value" style="color:#0284C7">${thisWeek.length}</div>
          <div class="kpi-delta">Current week</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Pending Orders</div>
          <div class="kpi-value" style="color:#F59E0B">${pendingOrders.length}</div>
          <div class="kpi-delta">Without trip assignment</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Trips</div>
          <div class="kpi-value">${trips.length}</div>
          <div class="kpi-delta">All time</div>
        </div>
      </div>

      <div class="table-wrap">
        <div class="table-toolbar">
          <span style="font-family:'Syne',sans-serif;font-size:13px;font-weight:600;color:var(--text)">Active Trips</span>
        </div>
        <table>
          <thead><tr>
            <th>Trip No</th><th>Week</th><th>Truck</th><th>Driver</th><th>Direction</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${activeTrips.length === 0
              ? `<tr><td colspan="6" style="text-align:center;color:var(--silver-dim);padding:24px">No active trips</td></tr>`
              : activeTrips.slice(0, 20).map(r => `
              <tr onclick="navigate('weekly_intl')">
                <td><strong>${fv(r.fields['TripID']) || r.id.slice(-6)}</strong></td>
                <td>W${fv(r.fields['Week Number']) || '—'}</td>
                <td>${fv(r.fields['Truck Plate']) || '—'}</td>
                <td>${fv(r.fields['Driver Name']) || '—'}</td>
                <td>${r.fields['Is Partner Trip']
                  ? '<span class="badge badge-blue">Partner</span>'
                  : '<span class="badge badge-green">Owned</span>'}</td>
                <td><span class="badge badge-yellow">Active</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    c.innerHTML = showError(e.message);
  }
}
