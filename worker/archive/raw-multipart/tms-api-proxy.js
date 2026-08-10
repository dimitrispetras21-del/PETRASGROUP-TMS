--052d0657dc19d7cf3eb3c425b78f479d9177ac337ed42a22d510f5c44eb8
Content-Disposition: form-data; name="index.js"

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var ALLOWED_ORIGIN = "https://dimitrispetras21-del.github.io";
var AIRTABLE_API = "https://api.airtable.com";
var MAX_CONCURRENT = 4;
var MAX_QUEUED = 20;
var JWT_EXPIRY_SEC = 8 * 60 * 60;
var activeRequests = 0;
var queue = [];
var USERS = [
  { username: "dimitris", hash: "9f0ed2c68d6bc81d92dc15d0d4759223db5f596e1a687ce9e5c0017b7da8cb85", role: "owner", name: "Dimitris Petras" },
  { username: "pantelis", hash: "bcc9e4d2c4ed2564ad8277876393b815ded43cfe15fadb9b22f3223f7f842271", role: "dispatcher", name: "Pantelis Tsanaktsidis" },
  { username: "sotiris", hash: "164009a07c161d8ad67cb949d751f5097a8bfa558230b9aeefe521851d1209bf", role: "dispatcher", name: "Sotiris Koulouriotis" },
  { username: "thodoris", hash: "f08f0ac8eb0b89aaef2dcc904cafc21b00e1f8f5c5f271703e0b649ffeea69fe", role: "management", name: "Thodoris Vainas" },
  { username: "eirini", hash: "5c9954dd6574c7f5f91c07739df100f9f8526846b0bc07518364a66a393ce7fb", role: "accountant", name: "Eirini Papazoi" },
  { username: "kelesmitos", hash: "0eaeebea099831a5ca606ff11c8015300ceee85b508f49efbebb188fa1b62d0e", role: "dispatcher", name: "Dimitris Kelesmitos" },
  // ── Demo accounts, one per role (added 2026-07-27) ──────────────────────
  // Must mirror index.html's USERS array. Three rosters have to agree for a
  // login to work in proxy mode: index.html (the login page's own copy),
  // config.js (the app's copy), and this one (the Worker's). A user missing
  // from any of them fails somewhere in the chain, which is exactly how five
  // of six real people would have been locked out at cutover (finding F-E3).
  // Shared password, held only in the gitignored ops .env as TMS_PW_DEMO.
  { username: "demo_owner", hash: "5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43", role: "owner", name: "Demo Owner" },
  { username: "demo_management", hash: "5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43", role: "management", name: "Demo Management" },
  { username: "demo_accountant", hash: "5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43", role: "accountant", name: "Demo Accountant" },
  { username: "demo_dispatcher", hash: "5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43", role: "dispatcher", name: "Demo Dispatcher" },
  { username: "demo_warehouse", hash: "5e92d9e6a898eeaaceb1b5b6f39f22cf694706da227ebb98577a5613f6445c43", role: "warehouse", name: "Demo Warehouse" }
];
function processQueue() {
  while (queue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const next = queue.shift();
    next();
  }
}
__name(processQueue, "processQueue");
function enqueue() {
  return new Promise((resolve) => {
    const tryRun = /* @__PURE__ */ __name(() => {
      activeRequests++;
      resolve();
    }, "tryRun");
    if (activeRequests < MAX_CONCURRENT) {
      tryRun();
    } else {
      queue.push(tryRun);
    }
  });
}
__name(enqueue, "enqueue");
function release() {
  activeRequests--;
  processQueue();
}
__name(release, "release");
function corsHeaders(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonError(message, status, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" }
  });
}
__name(jsonError, "jsonError");
function jsonOk(data, origin) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" }
  });
}
__name(jsonOk, "jsonOk");
function base64UrlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
__name(base64UrlDecode, "base64UrlDecode");
async function getSigningKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
__name(getSigningKey, "getSigningKey");
async function jwtSign(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await getSigningKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  return `${signingInput}.${base64UrlEncode(sig)}`;
}
__name(jwtSign, "jwtSign");
async function jwtVerify(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const enc = new TextEncoder();
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await getSigningKey(secret);
  const sigBytes = base64UrlDecode(sigB64);
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(signingInput));
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1e3)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
__name(jwtVerify, "jwtVerify");
var index_default = {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (origin && origin !== ALLOWED_ORIGIN) {
      return jsonError("Origin not allowed", 403, origin);
    }
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        active: activeRequests,
        queued: queue.length
      }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/auth/login" && request.method === "POST") {
      if (!env.JWT_SECRET) {
        return jsonError("Server misconfigured: missing JWT_SECRET", 500, origin);
      }
      try {
        const body = await request.json();
        const { username, passwordHash } = body;
        if (!username || !passwordHash) {
          return jsonError("Missing username or passwordHash", 400, origin);
        }
        const user = USERS.find((u) => u.username === username.toLowerCase() && u.hash === passwordHash);
        if (!user) {
          return jsonError("Invalid credentials", 401, origin);
        }
        const now = Math.floor(Date.now() / 1e3);
        const payload = {
          sub: user.username,
          role: user.role,
          name: user.name,
          iat: now,
          exp: now + JWT_EXPIRY_SEC
        };
        const token2 = await jwtSign(payload, env.JWT_SECRET);
        return jsonOk({
          token: token2,
          username: user.username,
          role: user.role,
          name: user.name,
          expiresAt: (now + JWT_EXPIRY_SEC) * 1e3
          // ms for client
        }, origin);
      } catch (e) {
        return jsonError("Invalid request body", 400, origin);
      }
    }
    const isAiRoute = url.pathname === "/v1/ai/messages" && request.method === "POST";
    if (!url.pathname.startsWith("/v0/") && !isAiRoute) {
      return jsonError("Invalid path. Expected /v0/{baseId}/{tableId}, /v1/ai/messages or /auth/login", 400, origin);
    }
    if (!env.JWT_SECRET) {
      return jsonError("Server misconfigured: missing JWT_SECRET", 500, origin);
    }
    const authHeader = request.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonError("Missing or invalid Authorization header", 401, origin);
    }
    const token = authHeader.slice(7);
    const claims = await jwtVerify(token, env.JWT_SECRET);
    if (!claims) {
      return jsonError("Invalid or expired token", 401, origin);
    }
    if (isAiRoute) {
      if (!env.ANTHROPIC_KEY) {
        return jsonError("Server misconfigured: missing ANTHROPIC_KEY secret", 500, origin);
      }
      try {
        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01"
          },
          // Buffered, not streamed: pallet OCR payloads are a few MB of base64,
          // well within Worker memory, and buffering keeps the fetch simple.
          body: await request.text()
        });
        return new Response(aiResp.body, {
          status: aiResp.status,
          headers: {
            ...cors,
            "Content-Type": aiResp.headers.get("Content-Type") || "application/json"
          }
        });
      } catch (err) {
        return jsonError("AI proxy error: " + err.message, 502, origin);
      }
    }
    if (!env.AIRTABLE_TOKEN) {
      return jsonError("Server misconfigured: missing AIRTABLE_TOKEN secret", 500, origin);
    }
    if (queue.length >= MAX_QUEUED) {
      return new Response(JSON.stringify({ error: "Too many queued requests. Try again shortly." }), {
        status: 429,
        headers: { ...cors, "Content-Type": "application/json", "Retry-After": "2" }
      });
    }
    await enqueue();
    try {
      const airtableUrl = AIRTABLE_API + url.pathname + url.search;
      const proxyHeaders = {
        "Authorization": `Bearer ${env.AIRTABLE_TOKEN}`,
        "X-User-Role": claims.role,
        "X-User-Name": claims.name
      };
      const ct = request.headers.get("Content-Type");
      if (ct) proxyHeaders["Content-Type"] = ct;
      const fetchOpts = {
        method: request.method,
        headers: proxyHeaders
      };
      if (["POST", "PATCH", "PUT"].includes(request.method)) {
        fetchOpts.body = await request.text();
      }
      const resp = await fetch(airtableUrl, fetchOpts);
      const body = await resp.text();
      return new Response(body, {
        status: resp.status,
        headers: {
          ...cors,
          "Content-Type": resp.headers.get("Content-Type") || "application/json"
        }
      });
    } catch (err) {
      return jsonError("Proxy error: " + err.message, 502, origin);
    } finally {
      release();
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map

--052d0657dc19d7cf3eb3c425b78f479d9177ac337ed42a22d510f5c44eb8--
