// ═══════════════════════════════════════════════
// MODULE — DASHBOARD
// ═══════════════════════════════════════════════

async function renderDashboard() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading dashboard...');
  try {
    const today = new Date().toISOString().split('T')[0];
    const tmrw = new Date(Date.now() + 864e5).toISOString().split('T')[0];
    const wn = currentWeekNumber();

    const [orders, natOrders, trucks] = await Promise.all([
      atGet(TABLES.ORDERS),
      atGet(TABLES.NAT_ORDERS),
      atGetAll(TABLES.TRUCKS, { fields: ['License Plate','Active'] }, true),
    ]);

    // ── KPI calculations ──
    const byStatus = (arr, st) => arr.filter(r => r.fields['Status'] === st).length;
    const pending   = byStatus(orders, 'Pending');
    const assigned  = byStatus(orders, 'Assigned');
    const inTransit = byStatus(orders, 'In Transit');
    const delivered = byStatus(orders, 'Delivered');
    const invoiced  = byStatus(orders, 'Invoiced');
    const totalIntl = orders.length;

    const nPending   = byStatus(natOrders, 'Pending');
    const nAssigned  = byStatus(natOrders, 'Assigned') + byStatus(natOrders, 'Groupage Assigned');
    const nDelivered = byStatus(natOrders, 'Delivered');
    const totalNatl  = natOrders.length;

    // Fleet utilization: trucks with assigned orders this week
    const activeTrucks = trucks.filter(t => t.fields['Active']).length;
    const trucksInUse = new Set();
    orders.filter(r => {
      const w = r.fields[' Week Number'];
      return w == wn && r.fields['Truck'];
    }).forEach(r => {
      const tid = Array.isArray(r.fields['Truck']) ? r.fields['Truck'][0] : r.fields['Truck'];
      if (tid) trucksInUse.add(typeof tid === 'string' ? tid : tid?.id);
    });
    const utilPct = activeTrucks ? Math.round(trucksInUse.size / activeTrucks * 100) : 0;

    // ── Upcoming: today + tomorrow loading/delivery ──
    const upcoming = [];
    orders.forEach(r => {
      const f = r.fields;
      const loadDt = (f['Loading DateTime']||'').substring(0,10);
      const delDt  = (f['Delivery DateTime']||'').substring(0,10);
      const route  = `${(f['Loading Summary']||'').slice(0,25)} → ${(f['Delivery Summary']||'').slice(0,25)}`;
      const pals   = f['Total Pallets']||0;
      const status = f['Status']||'Pending';
      if (loadDt === today)
        upcoming.push({ type: 'load', when: 'Today', route, pals, status, dir: f['Direction']||'' });
      else if (loadDt === tmrw)
        upcoming.push({ type: 'load', when: 'Tomorrow', route, pals, status, dir: f['Direction']||'' });
      if (delDt === today)
        upcoming.push({ type: 'deliver', when: 'Today', route, pals, status, dir: f['Direction']||'' });
      else if (delDt === tmrw)
        upcoming.push({ type: 'deliver', when: 'Tomorrow', route, pals, status, dir: f['Direction']||'' });
    });
    upcoming.sort((a,b) => a.when.localeCompare(b.when));

    // ── Status distribution for mini bars ──
    const intlTotal = Math.max(totalIntl, 1);
    const bar = (val, color) => `<div style="height:4px;flex:${val};background:${color};border-radius:2px"></div>`;

    const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

    c.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Dashboard</div>
          <div class="page-sub">${greeting}, ${user.name} — ${new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-grid" style="grid-template-columns:repeat(6,1fr)">
        <div class="kpi-card">
          <div class="kpi-label">Pending</div>
          <div class="kpi-value" style="color:#F59E0B">${pending + nPending}</div>
          <div class="kpi-delta">${pending} intl · ${nPending} natl</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Assigned</div>
          <div class="kpi-value" style="color:#0284C7">${assigned + nAssigned}</div>
          <div class="kpi-delta">${assigned} intl · ${nAssigned} natl</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">In Transit</div>
          <div class="kpi-value" style="color:#7C3AED">${inTransit}</div>
          <div class="kpi-delta">international</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Delivered</div>
          <div class="kpi-value" style="color:#10B981">${delivered + nDelivered}</div>
          <div class="kpi-delta">${delivered} intl · ${nDelivered} natl</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Invoiced</div>
          <div class="kpi-value" style="color:#10B981">${invoiced}</div>
          <div class="kpi-delta">international</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Fleet Utilization</div>
          <div class="kpi-value" style="color:${utilPct>=70?'#10B981':utilPct>=40?'#F59E0B':'#EF4444'}">${utilPct}%</div>
          <div class="kpi-delta">${trucksInUse.size}/${activeTrucks} trucks W${wn}</div>
        </div>
      </div>

      <!-- Status bar -->
      <div style="margin-bottom:24px">
        <div style="font-family:'Syne',sans-serif;font-size:11px;font-weight:700;letter-spacing:.5px;margin-bottom:6px;color:var(--text-dim)">INTERNATIONAL — ${totalIntl} orders</div>
        <div style="display:flex;gap:2px;height:4px;border-radius:2px;overflow:hidden">
          ${bar(pending,'#F59E0B')}${bar(assigned,'#0284C7')}${bar(inTransit,'#7C3AED')}${bar(delivered,'#10B981')}${bar(invoiced,'#059669')}
        </div>
        <div style="display:flex;gap:12px;margin-top:4px;font-size:10px;color:var(--text-dim)">
          <span style="color:#F59E0B">● Pending ${pending}</span>
          <span style="color:#0284C7">● Assigned ${assigned}</span>
          <span style="color:#7C3AED">● Transit ${inTransit}</span>
          <span style="color:#10B981">● Delivered ${delivered}</span>
          <span style="color:#059669">● Invoiced ${invoiced}</span>
        </div>
      </div>

      <!-- Two columns: Upcoming + Recent -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:12px;font-weight:700;margin-bottom:8px;letter-spacing:.5px">UPCOMING — TODAY & TOMORROW</div>
          <table class="mt"><thead><tr>
            <th>When</th><th>Action</th><th>Route</th><th class="c">Pal</th><th>Status</th>
          </tr></thead>
          <tbody>${upcoming.length ? upcoming.slice(0,12).map(u => `<tr>
            <td style="font-size:11px;font-weight:600;color:${u.when==='Today'?'#0284C7':'var(--text-mid)'}">${u.when}</td>
            <td style="font-size:11px"><span style="font-size:9px;font-weight:700;color:${u.type==='load'?'#F59E0B':'#10B981'};text-transform:uppercase">${u.type==='load'?'LOAD':'DELIVER'}</span></td>
            <td style="font-size:11px;color:var(--text);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.route}</td>
            <td class="c" style="font-size:11px">${u.pals}</td>
            <td><span class="badge ${u.status==='Delivered'?'badge-green':u.status==='Assigned'?'badge-blue':u.status==='In Transit'?'badge-yellow':'badge-grey'}" style="font-size:9px">${u.status}</span></td>
          </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:20px">No upcoming operations</td></tr>'}</tbody></table>
        </div>
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:12px;font-weight:700;margin-bottom:8px;letter-spacing:.5px">NATIONAL ORDERS — ${totalNatl} total</div>
          <table class="mt"><thead><tr>
            <th>Status</th><th class="r">Count</th><th class="r">%</th>
          </tr></thead>
          <tbody>
            ${[
              { st: 'Pending', c: nPending, col: '#F59E0B' },
              { st: 'Assigned', c: nAssigned, col: '#0284C7' },
              { st: 'Delivered', c: nDelivered, col: '#10B981' },
              { st: 'Invoiced', c: byStatus(natOrders,'Invoiced'), col: '#059669' },
            ].map(s => `<tr>
              <td style="font-size:12px"><span style="color:${s.col};font-weight:600">● ${s.st}</span></td>
              <td class="r" style="font-size:12px;font-weight:700">${s.c}</td>
              <td class="r" style="font-size:11px;color:var(--text-dim)">${totalNatl?Math.round(s.c/totalNatl*100):0}%</td>
            </tr>`).join('')}
          </tbody></table>
        </div>
      </div>

      <!-- C11-C13: Analytics row -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:20px">
        ${_dashTopClients(orders)}
        ${_dashDeliveryRate(orders)}
        ${_dashPartnerCost(orders)}
      </div>

      <!-- C15: Notification center -->
      ${_dashNotifications(orders, natOrders)}
      `;
  } catch(e) {
    c.innerHTML = showError(e.message);
  }
}

// C11: Top clients by order count
function _dashTopClients(orders) {
  const counts = {};
  orders.forEach(r => {
    const name = (r.fields['Client Name'] || r.fields['Client Summary'] || '').split(',')[0].trim() || 'Unknown';
    counts[name] = (counts[name] || 0) + 1;
  });
  const top = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,5);
  return `<div>
    <div style="font-family:'Syne',sans-serif;font-size:12px;font-weight:700;margin-bottom:8px;letter-spacing:.5px">TOP CLIENTS</div>
    <table class="mt"><thead><tr><th>Client</th><th class="r">Orders</th><th class="r">%</th></tr></thead>
    <tbody>${top.map(([name, c]) => `<tr>
      <td style="font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</td>
      <td class="r" style="font-size:12px;font-weight:700">${c}</td>
      <td class="r" style="font-size:11px;color:var(--text-dim)">${Math.round(c/orders.length*100)}%</td>
    </tr>`).join('')}</tbody></table>
  </div>`;
}

// C12: On-time delivery rate
function _dashDeliveryRate(orders) {
  const delivered = orders.filter(r => r.fields['Delivery Performance']);
  const onTime = delivered.filter(r => r.fields['Delivery Performance'] === 'On Time').length;
  const delayed = delivered.filter(r => r.fields['Delivery Performance'] === 'Delayed').length;
  const total = onTime + delayed;
  const pct = total ? Math.round(onTime / total * 100) : 0;
  return `<div>
    <div style="font-family:'Syne',sans-serif;font-size:12px;font-weight:700;margin-bottom:8px;letter-spacing:.5px">DELIVERY PERFORMANCE</div>
    <div style="background:#0F172A;border:1px solid #1E293B;border-radius:10px;padding:16px 20px;text-align:center">
      <div style="font-family:'Syne',sans-serif;font-size:36px;font-weight:700;color:${pct>=90?'#10B981':pct>=70?'#F59E0B':'#EF4444'}">${pct}%</div>
      <div style="font-size:11px;color:#94A3B8;margin-top:4px">on-time rate</div>
      <div style="display:flex;justify-content:center;gap:16px;margin-top:8px;font-size:11px">
        <span style="color:#10B981">${onTime} on time</span>
        <span style="color:#EF4444">${delayed} delayed</span>
      </div>
      ${total ? `<div style="height:4px;background:#1E293B;border-radius:2px;margin-top:8px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:#10B981;border-radius:2px"></div>
      </div>` : '<div style="font-size:11px;color:#475569;margin-top:8px">No delivery data yet</div>'}
    </div>
  </div>`;
}

// C13: Partner cost comparison
function _dashPartnerCost(orders) {
  const partnerOrders = orders.filter(r => r.fields['Is Partner Trip'] && r.fields['Partner Rate']);
  const byPartner = {};
  partnerOrders.forEach(r => {
    const name = (Array.isArray(r.fields['Partner']) ? '' : '') || 'Unknown';
    const pName = r.fields['Partner Summary'] || r.fields['Partner Name'] || 'Partner';
    byPartner[pName] = byPartner[pName] || { count: 0, total: 0 };
    byPartner[pName].count++;
    byPartner[pName].total += (r.fields['Partner Rate'] || 0);
  });
  const top = Object.entries(byPartner).sort((a,b) => b[1].count-a[1].count).slice(0,5);
  return `<div>
    <div style="font-family:'Syne',sans-serif;font-size:12px;font-weight:700;margin-bottom:8px;letter-spacing:.5px">PARTNER TRIPS</div>
    <table class="mt"><thead><tr><th>Partner</th><th class="r">Trips</th><th class="r">Avg Rate</th></tr></thead>
    <tbody>${top.length ? top.map(([name, d]) => `<tr>
      <td style="font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</td>
      <td class="r" style="font-size:12px;font-weight:700">${d.count}</td>
      <td class="r" style="font-size:11px;color:var(--text-dim)">${d.count?Math.round(d.total/d.count)+'€':'—'}</td>
    </tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:16px;font-size:11px">No partner data yet</td></tr>'}</tbody></table>
  </div>`;
}

// C15: Notification center
function _dashNotifications(orders, natOrders) {
  const alerts = [];
  // Overdue deliveries
  const today = new Date().toISOString().split('T')[0];
  orders.forEach(r => {
    const f = r.fields;
    if (f['Status']==='Assigned' || f['Status']==='In Transit') {
      const del = (f['Delivery DateTime']||'').substring(0,10);
      if (del && del < today) alerts.push({ type: 'danger', msg: `Overdue: ${(f['Loading Summary']||'').slice(0,20)} → ${(f['Delivery Summary']||'').slice(0,20)}`, sub: `Due ${del}` });
    }
  });
  // Pending orders without assignment
  const pendingOld = orders.filter(r => r.fields['Status']==='Pending').length;
  if (pendingOld > 5) alerts.push({ type: 'warn', msg: `${pendingOld} orders pending assignment`, sub: 'Check Weekly International' });
  // National pending
  const nPend = natOrders.filter(r => r.fields['Status']==='Pending').length;
  if (nPend > 10) alerts.push({ type: 'warn', msg: `${nPend} national orders pending`, sub: 'Check Weekly National' });

  if (!alerts.length) return '';
  return `<div style="margin-top:20px">
    <div style="font-family:'Syne',sans-serif;font-size:12px;font-weight:700;margin-bottom:8px;letter-spacing:.5px">ALERTS</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${alerts.slice(0,8).map(a => `<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:8px;
        background:${a.type==='danger'?'rgba(239,68,68,0.06)':'rgba(245,158,11,0.06)'};
        border:1px solid ${a.type==='danger'?'rgba(239,68,68,0.15)':'rgba(245,158,11,0.15)'}">
        <span style="font-size:14px">${a.type==='danger'?'&#9888;':'&#9888;'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:${a.type==='danger'?'#EF4444':'#F59E0B'}">${a.msg}</div>
          <div style="font-size:10px;color:var(--text-dim)">${a.sub}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
}
