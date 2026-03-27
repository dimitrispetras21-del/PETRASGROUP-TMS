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
  { username: 'dimitris',   hash: 'b7e480feeff4e9f28cde7b5f10c8b46d4e81eac0f44fc91d9b6ca20648dc75ca', role: 'owner',      name: 'Dimitris Petras' },
  { username: 'pantelis',   hash: 'fa1db14f60e798c8f3c582586fd7d4c70cf8431249ffc7787befa93e6dbfd215', role: 'dispatcher', name: 'Pantelis Tsanaktsidis' },
  { username: 'sotiris',    hash: 'a5b2ee26884135591d0c8213b30802060d379074e151c08d8bc07757aea77ead', role: 'dispatcher', name: 'Sotiris Koulouriotis' },
  { username: 'thodoris',   hash: '699d7aab30ff342aa3656f63b1b72b6fcfa83ca26fa75313ec89a4b7d5fc0c10', role: 'management', name: 'Thodoris Vainas' },
  { username: 'eirini',     hash: '172f322617cd908a2cefceab73f655b875f9f4c55cbc37d129f9072aee57512a', role: 'accountant', name: 'Eirini Papazoi' },
  { username: 'kelesmitos', hash: '00ad77798c78b32aecb433e682eabecae8338ed965dafebb4d31a697974a892a', role: 'dispatcher', name: 'Dimitris Kelesmitos' },
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

    // ── Only allow /v0/ paths (Airtable REST API) ─
    if (!url.pathname.startsWith('/v0/')) {
      return jsonError('Invalid path. Expected /v0/{baseId}/{tableId} or /auth/login', 400, origin);
    }

    // ── JWT authentication for /v0/* routes ──────
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
