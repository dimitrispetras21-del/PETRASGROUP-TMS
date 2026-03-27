// ═══════════════════════════════════════════════
// PETRAS GROUP TMS — Cloudflare Worker API Proxy
// Hides Airtable API key from the browser
// Server-side concurrency limiting (max 4 to Airtable)
// ═══════════════════════════════════════════════

const ALLOWED_ORIGIN = 'https://dimitrispetras21-del.github.io';
const AIRTABLE_API   = 'https://api.airtable.com';
const MAX_CONCURRENT = 4;
const MAX_QUEUED     = 20;

let activeRequests = 0;
const queue = [];

function processQueue() {
  while (queue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const next = queue.shift();
    next();
  }
}

function enqueue() {
  return new Promise((resolve) => {
    const tryRun = () => {
      activeRequests++;
      resolve();
    };
    if (activeRequests < MAX_CONCURRENT) {
      tryRun();
    } else {
      queue.push(tryRun);
    }
  });
}

function release() {
  activeRequests--;
  processQueue();
}

function corsHeaders(origin) {
  const allowed = (origin === ALLOWED_ORIGIN) ? ALLOWED_ORIGIN : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonError(message, status, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Reject disallowed origins (allow no-origin for direct/curl testing)
    if (origin && origin !== ALLOWED_ORIGIN) {
      return jsonError('Origin not allowed', 403, origin);
    }

    // Health check
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        active: activeRequests,
        queued: queue.length,
      }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Only allow /v0/ paths (Airtable REST API)
    if (!url.pathname.startsWith('/v0/')) {
      return jsonError('Invalid path. Expected /v0/{baseId}/{tableId}', 400, origin);
    }

    // Check secret is configured
    if (!env.AIRTABLE_TOKEN) {
      return jsonError('Server misconfigured: missing AIRTABLE_TOKEN secret', 500, origin);
    }

    // Reject if queue is full
    if (queue.length >= MAX_QUEUED) {
      return new Response(JSON.stringify({ error: 'Too many queued requests. Try again shortly.' }), {
        status: 429,
        headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '2' },
      });
    }

    // Wait for concurrency slot
    await enqueue();

    try {
      const airtableUrl = AIRTABLE_API + url.pathname + url.search;

      const proxyHeaders = {
        'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
      };

      // Forward Content-Type for write requests
      const ct = request.headers.get('Content-Type');
      if (ct) proxyHeaders['Content-Type'] = ct;

      const fetchOpts = {
        method: request.method,
        headers: proxyHeaders,
      };

      // Forward body for POST/PATCH/PUT
      if (['POST', 'PATCH', 'PUT'].includes(request.method)) {
        fetchOpts.body = await request.text();
      }

      const resp = await fetch(airtableUrl, fetchOpts);
      const body = await resp.text();

      return new Response(body, {
        status: resp.status,
        headers: {
          ...cors,
          'Content-Type': resp.headers.get('Content-Type') || 'application/json',
        },
      });
    } catch (err) {
      return jsonError('Proxy error: ' + err.message, 502, origin);
    } finally {
      release();
    }
  },
};
