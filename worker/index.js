// ═══════════════════════════════════════════════
// CLOUDFLARE WORKER — Airtable API Proxy
// Security + Server-side Rate Limiting for multi-user
// ═══════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'https://dimitrispetras21-del.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const AIRTABLE_BASE = 'https://api.airtable.com';
const RATE_LIMIT = 4;        // max 4 req/sec to Airtable (limit is 5)
const RATE_WINDOW_MS = 1000; // 1 second window

// In-memory sliding window (resets per worker instance)
let requestTimestamps = [];

function isRateLimited() {
  const now = Date.now();
  // Remove timestamps older than window
  requestTimestamps = requestTimestamps.filter(t => now - t < RATE_WINDOW_MS);
  if (requestTimestamps.length >= RATE_LIMIT) {
    return true;
  }
  requestTimestamps.push(now);
  return false;
}

// Wait until a slot is available (max 5 sec)
async function waitForSlot() {
  for (let i = 0; i < 25; i++) {
    if (!isRateLimited()) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false; // timeout
}

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

    // Parse path
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check endpoint
    if (path === '/health') {
      return jsonResponse({ status: 'ok', queue: requestTimestamps.length }, origin);
    }

    // Only allow /v0/ paths
    if (!path.startsWith('/v0/')) {
      return new Response('Not found', { status: 404 });
    }

    // Server-side rate limiting — wait for slot
    const gotSlot = await waitForSlot();
    if (!gotSlot) {
      return jsonResponse({ error: 'Rate limit exceeded. Try again.' }, origin, 429);
    }

    // Build Airtable URL
    const airtableUrl = `${AIRTABLE_BASE}${path}${url.search}`;

    // Forward request to Airtable with secret API key
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${env.AT_TOKEN}`);
    if (request.method !== 'GET' && request.method !== 'DELETE') {
      headers.set('Content-Type', 'application/json');
    }

    try {
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
    } catch (err) {
      return jsonResponse({ error: 'Upstream error: ' + err.message }, origin, 502);
    }
  }
};

function jsonResponse(data, origin, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin || '*',
    }
  });
}

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
