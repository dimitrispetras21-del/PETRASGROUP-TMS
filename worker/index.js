// ═══════════════════════════════════════════════
// PETRAS GROUP TMS — Cloudflare Worker API Proxy
// Hides Airtable API key from the browser
// Server-side concurrency limiting (max 4 to Airtable)
// JWT authentication for proxy mode
// ═══════════════════════════════════════════════

const ALLOWED_ORIGIN = 'https://dimitrispetras21-del.github.io';
const AIRTABLE_API   = 'https://api.airtable.com';
const MAX_CONCURRENT = 4;
const MAX_QUEUED     = 20;
const JWT_EXPIRY_SEC = 8 * 60 * 60; // 8 hours

let activeRequests = 0;
const queue = [];

// ── Hardcoded users (same as index.html) ─────────
const USERS = [
  { username: 'dimitris',   hash: '9f0ed2c68d6bc81d92dc15d0d4759223db5f596e1a687ce9e5c0017b7da8cb85', role: 'owner',      name: 'Dimitris Petras' },
  { username: 'pantelis',   hash: 'bcc9e4d2c4ed2564ad8277876393b815ded43cfe15fadb9b22f3223f7f842271', role: 'dispatcher', name: 'Pantelis Tsanaktsidis' },
  { username: 'sotiris',    hash: '164009a07c161d8ad67cb949d751f5097a8bfa558230b9aeefe521851d1209bf', role: 'dispatcher', name: 'Sotiris Koulouriotis' },
  { username: 'thodoris',   hash: 'f08f0ac8eb0b89aaef2dcc904cafc21b00e1f8f5c5f271703e0b649ffeea69fe', role: 'management', name: 'Thodoris Vainas' },
  { username: 'eirini',     hash: '5c9954dd6574c7f5f91c07739df100f9f8526846b0bc07518364a66a393ce7fb', role: 'accountant', name: 'Eirini Papazoi' },
  { username: 'kelesmitos', hash: '0eaeebea099831a5ca606ff11c8015300ceee85b508f49efbebb188fa1b62d0e', role: 'dispatcher', name: 'Dimitris Kelesmitos' },

  // ── Demo accounts, one per role (added 2026-07-27) ──────────────────────
  // Must mirror index.html's USERS array. Three rosters have to agree for a
  // login to work in proxy mode: index.html (the login page's own copy),
  // config.js (the app's copy), and this one (the Worker's). A user missing
  // from any of them fails somewhere in the chain, which is exactly how five
  // of six real people would have been locked out at cutover (finding F-E3).
  // Shared password, held only in the gitignored ops .env as TMS_PW_DEMO.
  { username: 'demo_owner',      hash: '5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43', role: 'owner',      name: 'Demo Owner' },
  { username: 'demo_management', hash: '5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43', role: 'management', name: 'Demo Management' },
  { username: 'demo_accountant', hash: '5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43', role: 'accountant', name: 'Demo Accountant' },
  { username: 'demo_dispatcher', hash: '5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43', role: 'dispatcher', name: 'Demo Dispatcher' },
  { username: 'demo_warehouse',  hash: '5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43', role: 'warehouse',  name: 'Demo Warehouse' },
];

// ── Concurrency queue ────────────────────────────
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

// ── CORS ─────────────────────────────────────────
function corsHeaders(origin) {
  const allowed = (origin === ALLOWED_ORIGIN) ? ALLOWED_ORIGIN : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonError(message, status, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function jsonOk(data, origin) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// ═══════════════════════════════════════════════
// JWT (HS256) — self-contained, no dependencies
// Uses Web Crypto API (available in Cloudflare Workers)
// ═══════════════════════════════════════════════

function base64UrlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getSigningKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function jwtSign(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = new TextEncoder();
  const headerB64  = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getSigningKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));

  return `${signingInput}.${base64UrlEncode(sig)}`;
}

async function jwtVerify(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const enc = new TextEncoder();
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getSigningKey(secret);
  const sigBytes = base64UrlDecode(sigB64);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(signingInput));

  if (!valid) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // expired
    }
    return payload;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════
// Request handler
// ═══════════════════════════════════════════════

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

    const url = new URL(request.url);

    // ── Health check (public, no auth) ───────────
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

    // ── Auth: Login endpoint ─────────────────────
    if (url.pathname === '/auth/login' && request.method === 'POST') {
      if (!env.JWT_SECRET) {
        return jsonError('Server misconfigured: missing JWT_SECRET', 500, origin);
      }
      try {
        const body = await request.json();
        const { username, passwordHash } = body;
        if (!username || !passwordHash) {
          return jsonError('Missing username or passwordHash', 400, origin);
        }
        const user = USERS.find(u => u.username === username.toLowerCase() && u.hash === passwordHash);
        if (!user) {
          return jsonError('Invalid credentials', 401, origin);
        }
        const now = Math.floor(Date.now() / 1000);
        const payload = {
          sub: user.username,
          role: user.role,
          name: user.name,
          iat: now,
          exp: now + JWT_EXPIRY_SEC,
        };
        const token = await jwtSign(payload, env.JWT_SECRET);
        return jsonOk({
          token,
          username: user.username,
          role: user.role,
          name: user.name,
          expiresAt: (now + JWT_EXPIRY_SEC) * 1000, // ms for client
        }, origin);
      } catch (e) {
        return jsonError('Invalid request body', 400, origin);
      }
    }

    // ── Only allow /v0/ (Airtable) and /v1/ai/messages (Anthropic, Fix 1.D) ─
    const isAiRoute = url.pathname === '/v1/ai/messages' && request.method === 'POST';
    if (!url.pathname.startsWith('/v0/') && !isAiRoute) {
      return jsonError('Invalid path. Expected /v0/{baseId}/{tableId}, /v1/ai/messages or /auth/login', 400, origin);
    }

    // ── JWT authentication (both Airtable and AI routes) ──────
    if (!env.JWT_SECRET) {
      return jsonError('Server misconfigured: missing JWT_SECRET', 500, origin);
    }

    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonError('Missing or invalid Authorization header', 401, origin);
    }

    const token = authHeader.slice(7);
    const claims = await jwtVerify(token, env.JWT_SECRET);
    if (!claims) {
      return jsonError('Invalid or expired token', 401, origin);
    }

    // ── AI proxy route (Fix 1.D): browser never sees the Anthropic key ──
    // Deliberately OUTSIDE the Airtable concurrency queue: a streaming chat
    // response can stay open for minutes and would starve the 4 Airtable slots.
    // Anthropic enforces its own rate limits; 429s pass through to the client,
    // which already has friendly handling for them (scan-helpers.js).
    if (isAiRoute) {
      if (!env.ANTHROPIC_KEY) {
        return jsonError('Server misconfigured: missing ANTHROPIC_KEY secret', 500, origin);
      }
      try {
        const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          // Buffered, not streamed: pallet OCR payloads are a few MB of base64,
          // well within Worker memory, and buffering keeps the fetch simple.
          body: await request.text(),
        });
        // Pass the response body through UNTOUCHED. This preserves SSE streaming
        // for the ai-chat stream:true call as well as plain JSON responses.
        return new Response(aiResp.body, {
          status: aiResp.status,
          headers: {
            ...cors,
            'Content-Type': aiResp.headers.get('Content-Type') || 'application/json',
          },
        });
      } catch (err) {
        return jsonError('AI proxy error: ' + err.message, 502, origin);
      }
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
        'X-User-Role': claims.role,
        'X-User-Name': claims.name,
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
