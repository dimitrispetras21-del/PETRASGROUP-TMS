// ═══════════════════════════════════════════════
// MODULE — INTERNATIONAL ORDERS
// ═══════════════════════════════════════════════

async function renderOrdersIntl() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading orders...');
  try {
    const orders = await atGet(TABLES.ORDERS);
    renderOrdersTable(orders, c, 'International Orders');
  } catch(e) {
    c.innerHTML = showError(e.message);
  }
}

function renderOrdersTable(orders, c, title = 'Orders') {
  const canEdit = can('orders') === 'full';
  window._ordersData = orders;

  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${title}</div>
        <div class="page-sub">${orders.length} orders total</div>
      </div>
      ${canEdit ? `<button class="btn btn-success" onclick="alert('Create order — coming soon')">+ New Order</button>` : ''}
    </div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <input class="search-input" placeholder="🔍  Search order..."
          oninput="filterOrders(this.value)" id="orderSearch">
        <select class="filter-select" onchange="filterOrdersByStatus(this.value)">
          <option value="">Status: All</option>
          <option value="pending">Pending</option>
          <option value="assigned">Assigned</option>
        </select>
        <span class="entity-count" id="ordersCount">${orders.length} orders</span>
      </div>
      <table id="ordersTable">
        <thead><tr>
          <th>Order No</th><th>Client</th><th>Loading</th><th>Delivery</th>
          <th>Pallets</th><th>Trip</th><th>Status</th>
        </tr></thead>
        <tbody id="ordersTbody">
          ${renderOrderRows(orders)}
        </tbody>
      </table>
    </div>`;
}

function renderOrderRows(orders) {
  if (!orders.length) {
    return `<tr><td colspan="7" style="text-align:center;color:var(--silver-dim);padding:32px">No orders found</td></tr>`;
  }
  return orders.slice(0, 200).map(r => {
    const f = r.fields;
    const hasTrip = f['Trip'] && f['Trip'].length > 0;
    return `<tr>
      <td><strong>${fv(f['Order No']) || r.id.slice(-6)}</strong></td>
      <td>${fv(f['Client Name']) || fv(f['Client']) || '—'}</td>
      <td>${fv(f['Loading Location 1']) || '—'}</td>
      <td>${fv(f['Unloading Location 1']) || '—'}</td>
      <td>${fv(f['Total Pallets']) || '—'}</td>
      <td>${hasTrip
        ? '<span class="badge badge-green">Assigned</span>'
        : '<span class="badge badge-yellow">Pending</span>'}</td>
      <td>${fv(f['Status']) || '—'}</td>
    </tr>`;
  }).join('');
}

function filterOrders(q) {
  const orders = (window._ordersData || []).filter(r => {
    const f = r.fields;
    const s = q.toLowerCase();
    return (fv(f['Order No']) || '').toLowerCase().includes(s)
      || (fv(f['Client Name']) || '').toLowerCase().includes(s)
      || (fv(f['Loading Location 1']) || '').toLowerCase().includes(s)
      || (fv(f['Unloading Location 1']) || '').toLowerCase().includes(s);
  });
  document.getElementById('ordersTbody').innerHTML = renderOrderRows(orders);
  document.getElementById('ordersCount').textContent = orders.length + ' orders';
}

function filterOrdersByStatus(val) {
  let orders = window._ordersData || [];
  if (val === 'pending')  orders = orders.filter(r => !r.fields['Trip'] || !r.fields['Trip'].length);
  if (val === 'assigned') orders = orders.filter(r => r.fields['Trip']  && r.fields['Trip'].length);
  document.getElementById('ordersTbody').innerHTML = renderOrderRows(orders);
  document.getElementById('ordersCount').textContent = orders.length + ' orders';
}
