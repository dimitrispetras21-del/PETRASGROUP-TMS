// ═══════════════════════════════════════════════
// MODULE — NATIONAL ORDERS
// ═══════════════════════════════════════════════

async function renderOrdersNatl() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Loading national orders...');
  try {
    const orders = await atGet(TABLES.NAT_ORDERS);
    renderNatlOrdersTable(orders, c);
  } catch(e) {
    c.innerHTML = showError(e.message);
  }
}

function renderNatlOrdersTable(orders, c) {
  const canEdit = can('orders') === 'full';
  window._natlOrdersData = orders;

  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">National Orders</div>
        <div class="page-sub">${orders.length} orders total</div>
      </div>
      ${canEdit ? `<button class="btn btn-success" onclick="alert('Create national order — coming soon')">+ New Order</button>` : ''}
    </div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <input class="search-input" placeholder="🔍  Search..."
          oninput="filterNatlOrders(this.value)">
        <span class="entity-count" id="natlOrdersCount">${orders.length} orders</span>
      </div>
      <table>
        <thead><tr>
          <th>Order No</th><th>Client</th><th>Loading</th><th>Delivery</th><th>Pallets</th><th>Status</th>
        </tr></thead>
        <tbody id="natlOrdersTbody">
          ${renderNatlOrderRows(orders)}
        </tbody>
      </table>
    </div>`;
}

function renderNatlOrderRows(orders) {
  if (!orders.length) {
    return `<tr><td colspan="6" style="text-align:center;color:var(--silver-dim);padding:32px">No orders found</td></tr>`;
  }
  return orders.slice(0, 200).map(r => {
    const f = r.fields;
    return `<tr>
      <td><strong>${fv(f['Order No']) || r.id.slice(-6)}</strong></td>
      <td>${fv(f['Client Name']) || fv(f['Client']) || '—'}</td>
      <td>${fv(f['Loading Location 1']) || '—'}</td>
      <td>${fv(f['Unloading Location 1']) || '—'}</td>
      <td>${fv(f['Total Pallets']) || '—'}</td>
      <td>${fv(f['Status']) || '—'}</td>
    </tr>`;
  }).join('');
}

function filterNatlOrders(q) {
  const orders = (window._natlOrdersData || []).filter(r => {
    const f = r.fields;
    const s = q.toLowerCase();
    return (fv(f['Order No']) || '').toLowerCase().includes(s)
      || (fv(f['Client Name']) || '').toLowerCase().includes(s);
  });
  document.getElementById('natlOrdersTbody').innerHTML = renderNatlOrderRows(orders);
  document.getElementById('natlOrdersCount').textContent = orders.length + ' orders';
}
