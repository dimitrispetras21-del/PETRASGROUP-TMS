// ═══════════════════════════════════════════════
// CLOUDFLARE WORKER — Airtable API Proxy
// Hides API key from browser, validates origin
// ═══════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'https://dimitrispetras21-del.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const AIRTABLE_BASE = 'https://api.airtable.com';

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    // Validate origin
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    // Parse path: /v0/appXXX/tblXXX/recXXX?params
    const url = new URL(request.url);
    const path = url.pathname; // e.g. /v0/appElT5CQV6JQvym8/tblgHlNmLBH3JTdIM

    // Only allow /v0/ paths
    if (!path.startsWith('/v0/')) {
      return new Response('Not found', { status: 404 });
    }

    // Build Airtable URL
    const airtableUrl = `${AIRTABLE_BASE}${path}${url.search}`;

    // Forward request to Airtable with secret API key
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${env.AT_TOKEN}`);
    if (request.method !== 'GET' && request.method !== 'DELETE') {
      headers.set('Content-Type', 'application/json');
    }

    const airtableResponse = await fetch(airtableUrl, {
      method: request.method,
      headers,
      body: ['POST', 'PATCH', 'PUT'].includes(request.method) ? request.body : null,
    });

    // Return response with CORS headers
    const response = new Response(airtableResponse.body, {
      status: airtableResponse.status,
      statusText: airtableResponse.statusText,
    });

    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    response.headers.set('Content-Type', 'application/json');

    return response;
  }
};

function handleCORS(request) {
  const origin = request.headers.get('Origin') || '';
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden', { status: 403 });
  }
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  });
}
