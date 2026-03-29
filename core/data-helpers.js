// ═══════════════════════════════════════════════
// CORE — DATA HELPERS
// Shared lookup functions for reference data
// Depends on: api.js (getRef*), utils.js (escapeHtml, getLinkId)
// ═══════════════════════════════════════════════

/**
 * Get location name by record ID
 * @param {string} id - Location record ID
 * @returns {string} Location name or '—'
 */
function getLocationName(id) {
  if (!id) return '—';
  const locs = getRefLocations();
  const l = locs.find(r => r.id === id);
  return l ? escapeHtml(l.fields['Name'] || l.fields['City'] || '—') : '—';
}

/**
 * Get client name by record ID
 * @param {string} id - Client record ID
 * @returns {string} Client company name or '—'
 */
function getClientName(id) {
  if (!id) return '—';
  const clients = getRefClients();
  const c = clients.find(r => r.id === id);
  return c ? escapeHtml(c.fields['Company Name'] || '—') : '—';
}

/**
 * Get truck plate by record ID
 * @param {string} id - Truck record ID
 * @returns {string} License plate or ''
 */
function getTruckPlate(id) {
  if (!id) return '';
  const trucks = getRefTrucks();
  const t = trucks.find(r => r.id === id);
  return t ? escapeHtml(t.fields['License Plate'] || '') : '';
}

/**
 * Get driver name by record ID
 * @param {string} id - Driver record ID
 * @returns {string} Full name or ''
 */
function getDriverName(id) {
  if (!id) return '';
  const drivers = getRefDrivers();
  const d = drivers.find(r => r.id === id);
  return d ? escapeHtml(d.fields['Full Name'] || '') : '';
}

/**
 * Get partner name by record ID
 * @param {string} id - Partner record ID
 * @returns {string} Company name or ''
 */
function getPartnerName(id) {
  if (!id) return '';
  const partners = getRefPartners();
  const p = partners.find(r => r.id === id);
  return p ? escapeHtml(p.fields['Company Name'] || '') : '';
}

/**
 * Extract first linked record ID from Airtable array field
 * @param {Array|string} val - Linked record field value
 * @returns {string|null} Record ID or null
 */
function getLinkedId(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val[0]?.id || val[0] || null;
  return typeof val === 'string' ? val : null;
}

/**
 * Format date range as "DD/MM → DD/MM"
 * @param {string} loadingDt - Loading date string
 * @param {string} deliveryDt - Delivery date string
 * @returns {string} Formatted range
 */
function formatDateRange(loadingDt, deliveryDt) {
  const fmt = dt => {
    if (!dt) return '--';
    const d = new Date(dt);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  return `${fmt(loadingDt)} \u2192 ${fmt(deliveryDt)}`;
}

/**
 * Resolve a string that may contain record IDs or client names separated by / or |
 * Used by ramp board for "Supplier/Client" fields
 * @param {string} str - Client string (may contain recIDs or names)
 * @returns {string} Resolved and escaped client names
 */
function resolveClientStr(str) {
  if (!str) return '—';
  return escapeHtml(str.split(/\s*[/|]\s*/).map(s => {
    const trimmed = s.trim();
    if (!trimmed) return '—';
    // Already a resolved name (not a record ID)
    if (typeof trimmed === 'string' && !trimmed.startsWith('rec')) return trimmed;
    // Try to resolve as record ID
    const clients = getRefClients();
    const c = clients.find(r => r.id === trimmed);
    return c ? (c.fields['Company Name'] || '—') : String(trimmed).substring(0, 15);
  }).join(' / '));
}
