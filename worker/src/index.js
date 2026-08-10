var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/lib/cors.js
function corsHeaders(origin, env) {
  const allowlist = (env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = allowlist.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonOk(data, origin, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin, env), "Content-Type": "application/json" }
  });
}
__name(jsonOk, "jsonOk");
function jsonError(message, status, origin, env) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(origin, env), "Content-Type": "application/json" }
  });
}
__name(jsonError, "jsonError");

// src/lib/jwt.js
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
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1e3)) return null;
    return payload;
  } catch {
    return null;
  }
}
__name(jwtVerify, "jwtVerify");

// src/routes/auth.js
var JWT_EXPIRY_SEC = 8 * 60 * 60;
async function handleLogin(request, origin, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request", 400, origin, env);
  }
  const username = (body.username || "").trim();
  const password = body.password || "";
  if (!username || !password) {
    return jsonError("Username and password required", 400, origin, env);
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/verify_login`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ p_username: username, p_password: password })
  });
  if (!res.ok) {
    console.error("verify_login RPC failed", res.status, await res.text().catch(() => ""));
    return jsonError("Login failed", 500, origin, env);
  }
  const rows = await res.json();
  const user = Array.isArray(rows) ? rows[0] : rows;
  if (!user) {
    return jsonError("Invalid credentials", 401, origin, env);
  }
  const now = Math.floor(Date.now() / 1e3);
  const token = await jwtSign(
    { sub: user.username, role: user.role, name: user.name, iat: now, exp: now + JWT_EXPIRY_SEC },
    env.JWT_SECRET
  );
  return jsonOk({ token, user: { username: user.username, role: user.role, name: user.name } }, origin, env);
}
__name(handleLogin, "handleLogin");

// src/middleware/auth.js
async function getCaller(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return jwtVerify(match[1], env.JWT_SECRET);
}
__name(getCaller, "getCaller");

// src/lib/supabase.js
async function dbSelect(env, table, opts = {}) {
  const params = new URLSearchParams();
  params.set("select", opts.select || "*");
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.order) params.set("order", opts.order);
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`dbSelect ${table} ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}
__name(dbSelect, "dbSelect");
async function dbSelectRaw(env, table, params) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`dbSelectRaw ${table} ${res.status}: ${detail.slice(0, 200)}`);
  }
  return { rows: await res.json(), contentRange: res.headers.get("content-range") };
}
__name(dbSelectRaw, "dbSelectRaw");

// src/routes/audit.js
var AUDIT_READERS = ["owner", "management"];
var MAX_LIMIT = 200;
var DEFAULT_LIMIT = 50;
async function handleAuditGet(request, origin, env) {
  const caller = await getCaller(request, env);
  if (!caller) return jsonError("Unauthorized", 401, origin, env);
  if (!AUDIT_READERS.includes(caller.role)) {
    return jsonError("Forbidden", 403, origin, env);
  }
  const q = new URL(request.url).searchParams;
  const params = new URLSearchParams();
  params.set("select", "id,actor,role,action,table_name,record_id,before_data,after_data,created_at");
  params.set("order", "created_at.desc");
  const eqFilters = {
    record_id: "record_id",
    table: "table_name",
    actor: "actor",
    action: "action"
  };
  for (const [param, column] of Object.entries(eqFilters)) {
    const v = q.get(param);
    if (v) params.set(column, `eq.${v}`);
  }
  const since = q.get("since");
  const until = q.get("until");
  if (since) params.append("created_at", `gte.${since}`);
  if (until) params.append("created_at", `lte.${until}`);
  const rawLimit = parseInt(q.get("limit") || "", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const rawOffset = parseInt(q.get("offset") || "", 10);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  try {
    const { rows } = await dbSelectRaw(env, "audit_log", params);
    return jsonOk({ entries: rows, count: rows.length, limit, offset }, origin, env);
  } catch (e) {
    console.error("AUDIT READ FAILED", e.message);
    return jsonError("Failed to load audit trail", 500, origin, env);
  }
}
__name(handleAuditGet, "handleAuditGet");

// src/lib/supabase-write.js
async function dbInsert(env, table, row) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(row)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`dbInsert ${table} ${res.status}: ${detail.slice(0, 200)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}
__name(dbInsert, "dbInsert");
async function dbUpdate(env, table, matchColumn, matchValue, patch) {
  const params = new URLSearchParams();
  params.set(matchColumn, `eq.${matchValue}`);
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(patch)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`dbUpdate ${table} ${res.status}: ${detail.slice(0, 200)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] || null : rows;
}
__name(dbUpdate, "dbUpdate");
async function dbRpc(env, fn, args) {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`dbRpc ${fn} ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}
__name(dbRpc, "dbRpc");

// src/routes/app_errors.js
var ERROR_READERS = ["owner", "management"];
var MAX_LIMIT2 = 200;
var DEFAULT_LIMIT2 = 50;
var CLAMPS = {
  message: 2e3,
  stack: 8e3,
  page: 500,
  user_agent: 400,
  sw_version: 100
};
function clampStr(v, max) {
  if (typeof v !== "string" || v.length === 0) return null;
  return v.length > max ? v.slice(0, max) : v;
}
__name(clampStr, "clampStr");
async function handleAppErrorPost(request, origin, env) {
  if (!origin) return jsonError("Origin required", 403, origin, env);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400, origin, env);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonError("Invalid payload", 400, origin, env);
  }
  const message = clampStr(body.message, CLAMPS.message);
  if (!message) return jsonError("message is required", 400, origin, env);
  const caller = await getCaller(request, env);
  const row = {
    actor: caller ? caller.sub : null,
    message,
    stack: clampStr(body.stack, CLAMPS.stack),
    page: clampStr(body.page, CLAMPS.page),
    user_agent: clampStr(body.user_agent, CLAMPS.user_agent),
    sw_version: clampStr(body.sw_version, CLAMPS.sw_version)
  };
  try {
    await dbInsert(env, "app_errors", row);
    return jsonOk({ ok: true }, origin, env, 201);
  } catch (e) {
    console.error("APP ERROR INSERT FAILED", e.message);
    return jsonError("Failed to record error", 500, origin, env);
  }
}
__name(handleAppErrorPost, "handleAppErrorPost");
async function handleAppErrorsGet(request, origin, env) {
  const caller = await getCaller(request, env);
  if (!caller) return jsonError("Unauthorized", 401, origin, env);
  if (!ERROR_READERS.includes(caller.role)) {
    return jsonError("Forbidden", 403, origin, env);
  }
  const q = new URL(request.url).searchParams;
  const params = new URLSearchParams();
  params.set("select", "id,actor,message,stack,page,user_agent,sw_version,created_at");
  params.set("order", "created_at.desc");
  const actor = q.get("actor");
  if (actor) params.set("actor", `eq.${actor}`);
  const since = q.get("since");
  const until = q.get("until");
  if (since) params.append("created_at", `gte.${since}`);
  if (until) params.append("created_at", `lte.${until}`);
  const rawLimit = parseInt(q.get("limit") || "", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT2) : DEFAULT_LIMIT2;
  const rawOffset = parseInt(q.get("offset") || "", 10);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  try {
    const { rows } = await dbSelectRaw(env, "app_errors", params);
    return jsonOk({ entries: rows, count: rows.length, limit, offset }, origin, env);
  } catch (e) {
    console.error("APP ERRORS READ FAILED", e.message);
    return jsonError("Failed to load errors", 500, origin, env);
  }
}
__name(handleAppErrorsGet, "handleAppErrorsGet");

// src/middleware/rbac.js
var PERMISSIONS = {
  owner: {
    "*": ["GET", "POST", "PATCH", "DELETE"]
  },
  // The reference/maintenance WRITE grants below mirror the frontend PERMS
  // levels ('full' -> write, 'view' -> read-only) so the migrated app behaves
  // identically. NOTE(scoping): whether dispatchers should really create/edit
  // reference data (clients etc.) is a live scoping question (ref-data editing
  // UI, agenda A2). This encodes CURRENT behaviour, not an endorsement; tighten
  // once the ref-data policy is settled. Writable = GET+POST+PATCH+DELETE;
  // DELETE is a soft-delete in the facade (never a hard delete).
  management: {
    "*": ["GET"],
    orders: ["GET", "POST", "PATCH"],
    invoices: ["GET", "POST", "PATCH"],
    // clients:'full' + drivers:'full' + maintenance:'full'
    clients: ["GET", "POST", "PATCH", "DELETE"],
    partners: ["GET", "POST", "PATCH", "DELETE"],
    locations: ["GET", "POST", "PATCH", "DELETE"],
    scan_examples: ["GET", "POST"],
    drivers: ["GET", "POST", "PATCH", "DELETE"],
    trucks: ["GET", "POST", "PATCH", "DELETE"],
    trailers: ["GET", "POST", "PATCH", "DELETE"],
    workshops: ["GET", "POST", "PATCH", "DELETE"],
    maint_history: ["GET", "POST", "PATCH", "DELETE"],
    maint_req: ["GET", "POST", "PATCH", "DELETE"],
    // planning:'view' -> ramp is read-only for management (covered by '*': GET,
    // listed explicitly for clarity alongside the other planning tables).
    ramp: ["GET"],
    // NOTE(scoping): the pallet ledgers have NO dedicated frontend PERMS section
    // (config.js sections are planning/orders/clients/maintenance/drivers/costs/
    // settings/performance/ceo_dashboard). They are operational data written by
    // order/stop flows and read for balance/cost tracking. Absent a frontend
    // anchor, this encodes a conservative default: owner + management + dispatcher
    // write, accountant read, warehouse none. Revisit once the client confirms who
    // manages pallet exchange. Writable = GET+POST+PATCH+DELETE (DELETE = facade
    // soft-delete).
    pallet_ledger_suppliers: ["GET", "POST", "PATCH", "DELETE"],
    pallet_ledger_partners: ["GET", "POST", "PATCH", "DELETE"],
    // PARTNER ASSIGNMENTS (0018): margin/commercial data, squarely management's.
    // Write included (management can correct a rate); covered for read by '*' but
    // listed explicitly, as with the other tables above.
    partner_assignments: ["GET", "POST", "PATCH", "DELETE"],
    // fuel: read-only for management (covered by '*': GET; listed explicitly so
    // FUEL reads as consciously handled, not forgotten). It is a COST table
    // (fuel spend), so dispatcher/warehouse are denied entirely, see the dispatcher
    // block + the FUEL RBAC NOTE below. No app role WRITES fuel: it is written
    // only by the sister repo's fuel_import.html tool, so no POST/PATCH grant is
    // given to any interactive role. NOTE(scoping): if a future in-app fuel-entry
    // feature is built, decide then who may write it; today read-only is correct.
    fuel: ["GET"]
  },
  accountant: {
    "*": ["GET"],
    // fuel: cost/P&L data the accountant should see (read-only, via '*': GET,
    // listed for clarity). Same NOTE as management: no interactive writer today.
    fuel: ["GET"],
    invoices: ["GET", "POST", "PATCH"],
    // clients:'full' + drivers:'full'; maintenance:'view' (read via '*': GET).
    clients: ["GET", "POST", "PATCH", "DELETE"],
    partners: ["GET", "POST", "PATCH", "DELETE"],
    locations: ["GET", "POST", "PATCH", "DELETE"],
    scan_examples: ["GET", "POST"],
    drivers: ["GET", "POST", "PATCH", "DELETE"],
    trucks: ["GET", "POST", "PATCH", "DELETE"],
    trailers: ["GET", "POST", "PATCH", "DELETE"]
  },
  dispatcher: {
    // No blanket read: dispatchers must not see P&L / cost tables (R-04 scenario).
    // So every table is listed explicitly. Mirrors frontend PERMS for dispatcher
    // (orders full; clients full; drivers view; maintenance view; costs none).
    // DELIBERATELY ABSENT (denied by the no-blanket rule): fuel (cost table),
    // and every P&L/cost table to come (trip_costs, driver_ledger). Do NOT add
    // `fuel` here, dispatchers seeing fuel spend is exactly the R-04 leak.
    orders: ["GET", "POST", "PATCH"],
    national_orders: ["GET", "POST", "PATCH"],
    // groupage_lines: NO DELETE, ever (the never-delete rule, gotcha #5 / spec §6).
    // The DB also refuses it (no service_role DELETE grant + ON DELETE RESTRICT);
    // this keeps the app layer honest too. Status flips Assigned<->Unassigned.
    groupage_lines: ["GET", "POST", "PATCH"],
    consolidated_loads: ["GET", "POST", "PATCH", "DELETE"],
    // the only deletable sync node (soft-delete)
    // national_loads + order_stops complete the sync chain (0016, Wave 5). Both
    // dispatcher-owned via the order flows. order_stops: no DELETE (stops are
    // managed with their parent order, not independently removed).
    national_loads: ["GET", "POST", "PATCH", "DELETE"],
    order_stops: ["GET", "POST", "PATCH"],
    // Τοπικές κινήσεις — ίδια κυριότητα με τα national_loads: ο dispatcher
    // τις δημιουργεί και τις σβήνει από το Weekly National.
    local_moves: ["GET", "POST", "PATCH", "DELETE"],
    // planning:'full' -> dispatchers own the ramp board (daily_ramp.js). DELETE
    // is the facade soft-delete. Auto-sync creates ramp rows on board render
    // (#38) via this same POST grant.
    ramp: ["GET", "POST", "PATCH", "DELETE"],
    // Pallet ledgers: written by the order/stop flows dispatchers drive
    // (orders_intl/natl, pallet_upload). See the management NOTE(scoping) above.
    pallet_ledger_suppliers: ["GET", "POST", "PATCH", "DELETE"],
    pallet_ledger_partners: ["GET", "POST", "PATCH", "DELETE"],
    // PARTNER ASSIGNMENTS (0018): dispatchers assign partners to orders, so they
    // own this table. Evidenced, not assumed: core/pa-helpers.js is called from
    // weekly_intl/weekly_natl/daily_ops and its own docstring says "called when a
    // dispatcher clears/unassigns a partner". DELETE is granted because
    // unassigning is a real dispatcher action (facade soft-delete).
    // ⚠️ R-04 TENSION, deliberate: this table carries margin data (Gross Profit,
    // Margin Percent), which dispatchers otherwise must not see. It is granted
    // anyway because the dispatcher must set Partner Rate to do the job, and the
    // margin is derived from it. If the client wants the margin hidden from
    // dispatchers, the fix is field-level (drop `computed` from the response by
    // role), NOT revoking the table, which would break assignment entirely.
    // Raise at scoping alongside the pallet-ledger RBAC question.
    partner_assignments: ["GET", "POST", "PATCH", "DELETE"],
    // clients:'full' -> dispatchers manage the reference "clients" section today.
    clients: ["GET", "POST", "PATCH", "DELETE"],
    partners: ["GET", "POST", "PATCH", "DELETE"],
    locations: ["GET", "POST", "PATCH", "DELETE"],
    scan_examples: ["GET", "POST"],
    // drivers:'view' + maintenance:'view' -> read-only.
    drivers: ["GET"],
    trucks: ["GET"],
    trailers: ["GET"],
    workshops: ["GET"],
    maint_history: ["GET"],
    maint_req: ["GET"]
  },
  warehouse: {
    orders: ["GET"],
    national_orders: ["GET"],
    consolidated_loads: ["GET"],
    national_loads: ["GET"],
    local_moves: ["GET"],
    groupage_lines: ["GET"],
    order_stops: ["GET"],
    // warehouse needs the stop list to load/unload
    locations: ["GET"]
  }
};
function can(role, table, method) {
  const roleMap = PERMISSIONS[role];
  if (!roleMap) return false;
  const tableRule = roleMap[table] || roleMap["*"];
  if (!tableRule) return false;
  return tableRule.includes(method);
}
__name(can, "can");

// src/middleware/audit.js
async function audit(env, entry) {
  try {
    await dbInsert(env, "audit_log", {
      actor: entry.actor,
      role: entry.role,
      action: entry.action,
      table_name: entry.table,
      record_id: entry.recordId || null,
      before_data: entry.before ? JSON.stringify(entry.before) : null,
      after_data: entry.after ? JSON.stringify(entry.after) : null,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (e) {
    console.error("AUDIT WRITE FAILED", entry.action, entry.table, e.message);
  }
}
__name(audit, "audit");

// src/routes/data.js
async function handleGetLocations(request, origin, env) {
  const caller = await getCaller(request, env);
  if (!caller) return jsonError("Unauthorized", 401, origin, env);
  if (!can(caller.role, "locations", "GET")) {
    return jsonError("Forbidden", 403, origin, env);
  }
  try {
    const rows = await dbSelect(env, "locations", { select: "*", order: "name.asc", limit: 500 });
    return jsonOk({ records: rows }, origin, env);
  } catch (e) {
    console.error("GET /api/locations", e.message);
    return jsonError("Failed to load locations", 500, origin, env);
  }
}
__name(handleGetLocations, "handleGetLocations");
var LOCATION_FIELDS = ["legacy_id", "name", "address", "city", "country"];
async function handleCreateLocation(request, origin, env) {
  const caller = await getCaller(request, env);
  if (!caller) return jsonError("Unauthorized", 401, origin, env);
  if (!can(caller.role, "locations", "POST")) {
    return jsonError("Forbidden", 403, origin, env);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request", 400, origin, env);
  }
  const name = (body.name || "").trim();
  if (!name) return jsonError("Location name is required", 400, origin, env);
  const row = {};
  for (const field of LOCATION_FIELDS) {
    if (body[field] === void 0 || body[field] === null) continue;
    row[field] = typeof body[field] === "string" ? body[field].trim() : body[field];
  }
  row.name = name;
  let created;
  try {
    created = await dbInsert(env, "locations", row);
  } catch (e) {
    console.error("POST /api/locations", e.message);
    return jsonError("Failed to create location", 500, origin, env);
  }
  await audit(env, {
    actor: caller.sub,
    role: caller.role,
    action: "create",
    table: "locations",
    recordId: created?.id != null ? String(created.id) : null,
    after: created
  });
  return jsonOk({ record: created }, origin, env, 201);
}
__name(handleCreateLocation, "handleCreateLocation");

// src/routes/ai.js
var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var ANTHROPIC_VERSION = "2023-06-01";
var ALLOWED_MODELS = /* @__PURE__ */ new Set([
  "claude-haiku-4-5-20251001",
  "claude-sonnet-5",
  "claude-opus-5"
]);
var MAX_TOKENS_CEILING = 8e3;
var UPSTREAM_TIMEOUT_MS = 6e4;
async function handleAiMessages(request, origin, env) {
  const caller = await getCaller(request, env);
  if (!caller) return jsonError("Unauthorized", 401, origin, env);
  if (!env.ANTHROPIC_API_KEY) {
    console.error("AI PROXY: ANTHROPIC_API_KEY is not set on this Worker");
    return jsonError("AI service is not configured", 503, origin, env);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400, origin, env);
  }
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
    return jsonError("Body must include a messages array", 400, origin, env);
  }
  if (!ALLOWED_MODELS.has(body.model)) {
    return jsonError(`Model not allowed: ${body.model || "(none)"}`, 400, origin, env);
  }
  const requested = Number(body.max_tokens);
  const maxTokens = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_TOKENS_CEILING) : MAX_TOKENS_CEILING;
  const payload = { ...body, max_tokens: maxTokens };
  delete payload.stream;
  const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify(payload),
      signal: timeout
    });
  } catch (e) {
    console.error("AI PROXY upstream failed:", e.name, e.message);
    const isTimeout = e.name === "TimeoutError" || e.name === "AbortError";
    return jsonError(
      isTimeout ? "AI request timed out" : "AI service unavailable",
      isTimeout ? 504 : 502,
      origin,
      env
    );
  }
  const text = await upstream.text();
  if (!upstream.ok) {
    console.error(`AI PROXY upstream ${upstream.status}:`, text.slice(0, 300));
    if (upstream.status === 429) return jsonError("AI rate limit reached, try again shortly", 429, origin, env);
    if (upstream.status === 529) return jsonError("AI service overloaded, try again shortly", 503, origin, env);
    return jsonError("AI request failed", 502, origin, env);
  }
  return new Response(text, {
    status: 200,
    headers: { "content-type": "application/json", ...corsHeaders(origin, env) }
  });
}
__name(handleAiMessages, "handleAiMessages");

// src/lib/facade-tables.js
var TABLES = {
  // ── Reference data (read-heavy, every role reads; managed centrally) ──
  tblxu8DRfTQOFRCzS: {
    name: "LOCATIONS",
    pg: "locations",
    fields: {
      Name: "name",
      Type: "type",
      Address: "address",
      "State/province": "state_province",
      City: "city",
      Country: "country",
      Latitude: "latitude",
      Longitude: "longitude",
      // Wave 3 (owner-approved, 8/8): driver-sheet fields
      "Opening Hours": "opening_hours",
      "Delivery Days": "delivery_days"
    }
  },
  tblFWKAQVUzAM8mCE: {
    name: "CLIENTS",
    pg: "clients",
    fields: {
      "Company Name": "company_name",
      Adress: "address",
      // Airtable typo preserved as the LABEL; column is `address`
      City: "city",
      Country: "country",
      "VAT Number": "vat_number",
      Email: "email",
      Phone: "phone",
      Active: "active"
    }
  },
  tblLHl5m8bqONfhWv: {
    name: "PARTNERS",
    pg: "partners",
    fields: {
      "Company Name": "company_name",
      Adress: "address",
      Country: "country",
      "VAT Number": "vat_number",
      Phone: "phone",
      Email: "email",
      Active: "active"
    }
  },
  tbl7UGmYhc2Y82pPs: {
    name: "DRIVERS",
    pg: "drivers",
    fields: {
      "Full Name": "full_name",
      Phone: "phone",
      Type: "type",
      "License Number": "license_number",
      "License Expiry": "license_expiry",
      Active: "active"
    }
  },
  tblEAPExIAjiA3asD: {
    name: "TRUCKS",
    pg: "trucks",
    fields: {
      "License Plate": "license_plate",
            "VIN": "vin",
      Brand: "brand",
      Model: "model",
      Active: "active",
      "KTEO Expiry": "kteo_expiry",
      "KEK Expiry": "kek_expiry",
      "Insurance Expiry": "insurance_expiry",
      "Insurance Partner": "insurance_partner",
      "Euro Standard": "euro_standard",
"Year": "year",
"Tare Weight kg": "tare_weight_kg",
      Notes: "notes"
    }
  },
  tblDcrqRJXzPrtYLm: {
    name: "TRAILERS",
    pg: "trailers",
    fields: {
      "License Plate": "license_plate",
            "VIN": "vin",
      Active: "active",
      "KTEO Expiry": "kteo_expiry",
      "Insurance Expiry": "insurance_expiry",
      "FRC Expiry": "frc_expiry",
      "Brand": "brand",
      "Model": "model",
      "Year": "year",
     "Trailer Type": "trailer_type",
      "Tare Weight kg": "tare_weight_kg",
      Notes: "notes"
    }
  },
  // ── Maintenance (workshops has data path; history/req read by the module) ──
  tblMiFxbm9ky8PCQi: {
    name: "WORKSHOPS",
    pg: "workshops",
    fields: {
      Name: "name",
      Phone: "phone",
      Address: "address",
      // correctly spelled here, unlike CLIENTS/PARTNERS
      City: "city",
      Specialty: "specialty",
      "Contact Person": "contact_person",
      Email: "email",
      Notes: "notes",
      Active: "active"
    }
  },
  tbllPbPPd6N3zEZF1: {
    name: "MAINT_HISTORY",
    pg: "maint_history",
    fields: {
      "Vehicle Plate": "vehicle_plate",
      "Vehicle Type": "vehicle_type",
      Date: "service_date",
      Type: "type",
      Description: "description",
      Cost: "cost",
      "Odometer km": "odometer_km",
      Parts: "parts",
      "Invoice Number": "invoice_number",
      "Next Service Date": "next_service_date",
      "Next Service km": "next_service_km",
      Status: "status",
      Notes: "notes",
      "Source Ref": "source_ref",
      "Needs Review": "needs_review"
    },
    // Legacy label kept alive: the service form sends 'Odometer km' while this map
    // only knew 'Odometer', so mileage was dropped on every save until 2026-08-05.
    aliases: {
      Odometer: "odometer_km"
    },
    // FK columns, NOT plain fields. Records carry legacy ids ('recXXX'), so these
    // must pass through resolveLinksOnWrite; putting them in `fields` would push a
    // recid straight into a bigint column and 500 (see the RAMP note on `fields`
    // doubling as the write allowlist). Workshop was previously unmapped entirely,
    // which silently dropped every workshop assignment.
    links: {
      Workshop: { column: "workshop_id", table: "workshops" },
      Truck: { column: "truck_id", table: "trucks" },
      Trailer: { column: "trailer_id", table: "trailers" }
    }
  },
  tbl3vhUmzKDWhJynR: {
    name: "MAINT_REQ",
    pg: "maint_req",
    fields: {
      "Vehicle Plate": "vehicle_plate",
      "Vehicle Type": "vehicle_type",
      Description: "description",
      Priority: "priority",
      // Greek values, never translated (gotcha #9)
      Status: "status",
      "Date Reported": "date_reported",
      Notes: "notes"
    }
  },
  // ── Ramp (Wave 3): the daily dock-planning board (modules/daily_ramp.js) ──
  // Every storable field is mapped (button + links-as-FK excluded); the numbered
  // Stop columns are kept flat to match Airtable's shape, see 0014 header. Greek
  // singleSelect values (Type/Status) pass through as text, never translated (#9).
  tblT8W5WcuToBQNiY: {
    name: "RAMP",
    pg: "ramp",
    fields: {
      "Plan Date": "plan_date",
      Time: "event_time",
      // `time` is a PG type name; column renamed to event_time
      Type: "type",
      Status: "status",
      Pallets: "pallets",
      Goods: "goods",
      "Supplier/Client": "supplier_client",
      Notes: "notes",
      "Postponed To": "postponed_to",
      "Ramp Category": "ramp_category",
      "Stock Status": "stock_status",
      Temperature: "temperature",
      // text ("2"), not numeric (Airtable stores as string)
      "Loading Points": "loading_points",
      "Delivery Points": "delivery_points",
      "Is Veroia Switch": "is_veroia_switch",
      "Temp Checked": "temp_checked",
      "Pallets Counted": "pallets_counted",
      "Goods Staged": "goods_staged",
      "Temp Set": "temp_set",
      "Stop Client 1": "stop_client_1",
      "Stop Location 1": "stop_location_1",
      "Stop Temp 1": "stop_temp_1",
      "Stop Ref 1": "stop_ref_1",
      "Stop Pallets 1": "stop_pallets_1",
      "Stop Client 2": "stop_client_2",
      "Stop Location 2": "stop_location_2",
      "Stop Temp 2": "stop_temp_2",
      "Stop Ref 2": "stop_ref_2",
      "Stop Pallets 2": "stop_pallets_2",
      "Stop Client 3": "stop_client_3",
      "Stop Location 3": "stop_location_3",
      "Stop Temp 3": "stop_temp_3",
      "Stop Ref 3": "stop_ref_3",
      "Stop Pallets 3": "stop_pallets_3",
      "Stop Client 4": "stop_client_4",
      "Stop Location 4": "stop_location_4",
      "Stop Temp 4": "stop_temp_4",
      "Stop Ref 4": "stop_ref_4",
      "Stop Pallets 4": "stop_pallets_4",
      "Stop Client 5": "stop_client_5",
      "Stop Location 5": "stop_location_5",
      "Stop Temp 5": "stop_temp_5",
      "Stop Ref 5": "stop_ref_5",
      "Stop Pallets 5": "stop_pallets_5"
      // Link fields ('Order','National Order','Trip','Driver','Truck') are NOT
      // mapped here: they are FK bigint columns, not label-valued fields, and the
      // facade cannot round-trip a recXXX link array to an FK until the parents
      // migrate (Wave 4/5). Kept out of the map so a write can't set them yet and
      // a read doesn't surface an unresolved FK as a bad Airtable link (§4.3).
    }
  },
  // ── Pallet ledgers (Wave 2): pallet movements OUT/IN (modules/pallet_ledger.js
  // manual entry + modules/pallet_upload.js AI OCR). Schema built in 0011. ──
  //
  // NOT mapped on either table, on purpose:
  //  - 'Signed Pallets' (SUPPLIERS): an Airtable FORMULA -> a GENERATED column in
  //    pg (0011 FLAG 1). Never writable; and the frontend computes the balance
  //    KPI in JS from Pallets+Direction, it does not read this field. So it stays
  //    server-side only (available to SQL/views), never surfaced through the facade.
  //  - 'Sheet Uploaded' (multipleAttachments): not modeled (no attachment store
  //    until R2 lands, 0011 FLAG 5). The AI flow only sets the 'AI Extracted' bool.
  //  - Link fields (Order/Order Stop = sync chain deferred FK; Client Account/
  //    Partner Account/Partner/Loading Supplier = resolvable FK): excluded like
  //    every other facade table, an FK bigint is not an Airtable link array (§4.3).
  tblAAH3N1bIcBRPXi: {
    name: "PALLET_LEDGER_SUPPLIERS",
    pg: "pallet_ledger_suppliers",
    fields: {
      Date: "entry_date",
      // renamed: `date` is a PG type name (0011)
      Direction: "direction",
      // singleSelect OUT|IN, drives signed_pallets sign
      Pallets: "pallets",
      "Pallet Type": "pallet_type",
      // EUR/EPAL|CHEP|Industrial
      "Counterparty Type": "counterparty_type",
      // Client|Partner
      "Stop Type": "stop_type",
      // Loading|Crossdock|Unloading|No Order
      "AI Extracted": "ai_extracted",
      Verified: "verified",
      Notes: "notes"
      // NOTE: 'Signed Pallets' is deliberately NOT mapped. It is a generated
      // column (0011) and `fields` doubles as the WRITE allowlist, so mapping it
      // would let a write reach a column Postgres refuses, turning a clean drop
      // into a 500. Contract pinned by facade-tables.test.js.
    },
    // The FK columns have existed since 0011 but were never mapped here, so every
    // filter naming one 422'd. Found live 2026-07-29 via invoicing.js
    // _invFetchPalletBalance, whose error is swallowed: the pallet balance
    // rendered 0 for EVERY client instead of an error. Labels are taken from
    // 0011's own Airtable-label comments, not guessed.
    links: {
      "Client Account": { column: "client_id", table: "clients" },
      "Partner Account": { column: "partner_id", table: "partners" },
      "Loading Supplier": { column: "loading_supplier_id", table: "locations" },
      Order: { column: "order_id", table: "orders" },
      "Order Stop": { column: "order_stop_id", table: "order_stops" }
    }
  },
  tblAUixdjwpgnJ1hK: {
    name: "PALLET_LEDGER_PARTNERS",
    pg: "pallet_ledger_partners",
    fields: {
      Date: "entry_date",
      Direction: "direction",
      // singleSelect IN|OUT
      Pallets: "pallets",
      "Pallet Type": "pallet_type",
      // EUR/EPAL|CHEP|LPR|Other (differs from suppliers, 0011 FLAG 3)
      "AI Extracted": "ai_extracted",
      Verified: "verified",
      Notes: "notes"
      // 'Signed Pallets' omitted for the same reason as the suppliers ledger above.
    },
    links: {
      Partner: { column: "partner_id", table: "partners" },
      "Order Stop": { column: "order_stop_id", table: "order_stops" }
    }
  },
  // ══════════════════════════════════════════════════════════════════════════
  // SYNC CHAIN (Wave 5), GATED, schema in 0016. First-of-its-kind: these tables
  // carry a `links` block (Airtable label -> {column, table}) resolved by
  // facade-links.js, because unlike every table above, their links ARE the point
  // (an order IS its Client + Locations + fleet). `fields` = scalar columns
  // (label -> column, as before); `links` = FK columns round-tripped as recid
  // arrays. Child/reverse links (GROUPAGE LINES, ORDER STOPS, ...) are NOT here:
  // they are the child's FK, fetched by filtering the child table. Wave-4 links
  // (TRIPS) are omitted (parent not built).
  //
  // ORDERS (proving ground): tblgHlNmLBH3JTdIM. Full scalar + link map.
  // ══════════════════════════════════════════════════════════════════════════
  tblgHlNmLBH3JTdIM: {
    name: "ORDERS",
    pg: "orders",
    // Derived formula fields, served from the 0020 view (the deferral 0016
    // noted came due on cutover day: Weekly International filters
    // {Week Number}=<n> and several pages read these labels). week_number
    // reproduces the frontend's own Sunday-week math, NOT ISO weeks.
    readView: "orders_with_derived",
    computed: {
      "Week Number": "week_number",
      "Total Pallets": "total_pallets"
    },
    // Reverse link (children listed on the parent, as Airtable's reverse field
    // does): the frontend's stopsLoad reads the parent's 'ORDER STOPS' then
    // batch-fetches those ids (found live 2026-07-28). Same label on all three
    // stop-parent tables (ORDERS, NAT_ORDERS, NAT_LOADS).
    reverseLinks: { "ORDER STOPS": { table: "order_stops", column: "order_id" } },
    fields: {
      Brand: "brand",
      Type: "order_type",
      Direction: "direction",
      // Export|Import|arrows, verbatim (#9)
      Status: "status",
      "Ops Status": "ops_status",
      "Invoice Status": "invoice_status",
      "Delivery Performance": "delivery_performance",
      "Carrier Type": "carrier_type",
      "Refrigerator Mode": "refrigerator_mode",
      "Pallet Type": "pallet_type",
      Price: "price",
      "Partner Rate": "partner_rate",
      "Advance Paid": "advance_paid",
      Goods: "goods",
      "Gross Weight kg": "gross_weight_kg",
      "Temperature \xB0C": "temperature_c",
      Reference: "reference",
      "Groupage ID": "groupage_id",
      "Matched Import ID": "matched_import_id",
      "Partner Truck Plates": "partner_truck_plates",
      ETA: "eta",
      "Invoice Number": "invoice_number",
      Notes: "notes",
      "Ops Notes": "ops_notes",
      "High Risk Auto Flag": "high_risk_auto_flag",
      "Loading DateTime": "loading_datetime",
      "Delivery DateTime": "delivery_datetime",
      "Cross-dock Date": "cross_dock_date",
      "Postponed To": "postponed_to",
      "Actual Delivery Date": "actual_delivery_date",
      "Invoice Date": "invoice_date",
      "Assigned At": "assigned_at",
      "Pallet Exchange": "pallet_exchange",
      "Temp Check": "temp_check",
      "Docs Ready": "docs_ready",
      "Pallet Exchange Confirmed": "pallet_exchange_confirmed",
      "SMS to Driver": "sms_to_driver",
      "Money Confirmed": "money_confirmed",
      "Client Updated": "client_updated",
      DONE: "done",
      "Veroia Switch": "veroia_switch",
      // the sync-chain trigger (#6, no trailing space)
      "High Risk Flag": "high_risk_flag",
      "National Order Created": "national_order_created",
      Invoiced: "invoiced",
      "National Groupage": "national_groupage",
      "Is Partner Trip": "is_partner_trip",
      "Pallet Sheet 1 Uploaded": "pallet_sheet_1_uploaded",
      "Pallet Sheet 2 Uploaded": "pallet_sheet_2_uploaded",
      "CMR Photo Received": "cmr_photo_received",
      "Client Notified": "client_notified",
      "Temp OK": "temp_ok",
      "Driver Notified": "driver_notified",
      "Second Card": "second_card",
      // numbered flat pallets/datetimes (facade fidelity, 0016)
      "Loading Pallets 1": "loading_pallets_1",
      "Loading Pallets 2": "loading_pallets_2",
      "Loading Pallets 3": "loading_pallets_3",
      "Loading Pallets 4": "loading_pallets_4",
      "Loading Pallets 5": "loading_pallets_5",
      "Loading Pallets 6": "loading_pallets_6",
      "Loading Pallets 7": "loading_pallets_7",
      "Loading Pallets 8": "loading_pallets_8",
      "Loading Pallets 9": "loading_pallets_9",
      "Loading Pallets 10": "loading_pallets_10",
      "Unloading Pallets 1": "unloading_pallets_1",
      "Unloading Pallets 2": "unloading_pallets_2",
      "Unloading Pallets 3": "unloading_pallets_3",
      "Unloading Pallets 4": "unloading_pallets_4",
      "Unloading Pallets 5": "unloading_pallets_5",
      "Unloading Pallets 6": "unloading_pallets_6",
      "Unloading Pallets 7": "unloading_pallets_7",
      "Unloading Pallets 8": "unloading_pallets_8",
      "Unloading Pallets 9": "unloading_pallets_9",
      "Unloading Pallets 10": "unloading_pallets_10",
      "Loading DateTime 2": "loading_datetime_2",
      "Loading DateTime 3": "loading_datetime_3",
      "Loading DateTime 4": "loading_datetime_4",
      "Loading DateTime 5": "loading_datetime_5",
      "Loading DateTime 6": "loading_datetime_6",
      "Loading DateTime 7": "loading_datetime_7",
      "Loading DateTime 8": "loading_datetime_8",
      "Loading DateTime 9": "loading_datetime_9",
      "Loading DateTime 10": "loading_datetime_10",
      "Unloading DateTime 1": "unloading_datetime_1",
      "Unloading DateTime 2": "unloading_datetime_2",
      "Unloading DateTime 3": "unloading_datetime_3",
      "Unloading DateTime 4": "unloading_datetime_4",
      "Unloading DateTime 5": "unloading_datetime_5",
      "Unloading DateTime 6": "unloading_datetime_6",
      "Unloading DateTime 7": "unloading_datetime_7",
      "Unloading DateTime 8": "unloading_datetime_8",
      "Unloading DateTime 9": "unloading_datetime_9",
      "Unloading DateTime 10": "unloading_datetime_10",
      // Wave 3 (owner-approved, 8/8): groupage persistence — Weekly Intl
      "Group ID": "group_id",
      "Rotation ID": "rotation_id"
      // DERIVED (formula) fields are intentionally absent: Order Number, Net
      // Price, Total Pallets, Week Number, Loading/Delivery Summary, Created By.
    },
    links: {
      Client: { column: "client_id", table: "clients" },
      Record: { column: "partner_id", table: "partners" },
      // legacy 2nd partner link -> same FK as Partner
      Partner: { column: "partner_id", table: "partners" },
      Truck: { column: "truck_id", table: "trucks" },
      Trailer: { column: "trailer_id", table: "trailers" },
      Driver: { column: "driver_id", table: "drivers" },
      "Veroia Cross-dock": { column: "veroia_crossdock_id", table: "locations" },
      "Loading Location 1": { column: "loading_location_1_id", table: "locations" },
      "Loading Location 2": { column: "loading_location_2_id", table: "locations" },
      "Loading Location 3": { column: "loading_location_3_id", table: "locations" },
      "Loading Location 4": { column: "loading_location_4_id", table: "locations" },
      "Loading Location 5": { column: "loading_location_5_id", table: "locations" },
      "Loading Location 6": { column: "loading_location_6_id", table: "locations" },
      "Loading Location 7": { column: "loading_location_7_id", table: "locations" },
      "Loading Location 8": { column: "loading_location_8_id", table: "locations" },
      "Loading Location 9": { column: "loading_location_9_id", table: "locations" },
      "Loading Location 10": { column: "loading_location_10_id", table: "locations" },
      "Unloading Location 1": { column: "unloading_location_1_id", table: "locations" },
      "Unloading Location 2": { column: "unloading_location_2_id", table: "locations" },
      "Unloading Location 3": { column: "unloading_location_3_id", table: "locations" },
      "Unloading Location 4": { column: "unloading_location_4_id", table: "locations" },
      "Unloading Location 5": { column: "unloading_location_5_id", table: "locations" },
      "Unloading Location 6": { column: "unloading_location_6_id", table: "locations" },
      "Unloading Location 7": { column: "unloading_location_7_id", table: "locations" },
      "Unloading Location 8": { column: "unloading_location_8_id", table: "locations" },
      "Unloading Location 9": { column: "unloading_location_9_id", table: "locations" },
      "Unloading Location 10": { column: "unloading_location_10_id", table: "locations" }
      // Omitted on purpose: TRIPS* (Wave-4 parent not built); NATIONAL ORDERS,
      // GROUPAGE LINES, CONSOLIDATED LOADS, ORDER STOPS, RAMP PLAN, PALLET LEDGER,
      // RAMP EVENTS, PARTNER ASSIGNMENTS (child/reverse links = the child's FK,
      // fetched by filtering the child table, not stored on the order).
    }
  },
  // ══════════════════════════════════════════════════════════════════════════
  // GROUPAGE LINES: tblxUAaIsUMEDl3qQ. Sync-chain child (1 per loading stop).
  // Second sync-chain table wired, same proven scalar + link pattern as ORDERS.
  // NEVER-DELETE lifecycle: RBAC (rbac.js) grants NO DELETE on groupage_lines,
  // and the parent FKs are ON DELETE RESTRICT (0016), so a GL is structurally
  // un-orphanable. "Remove a stop" = Status -> 'Unassigned', never a delete
  // (gotcha #5 / spec §6). Field labels below are the EXACT keys the writers
  // send: main app orders_intl.js:1206-1220 (create/patch) + order-sync.js.
  // ══════════════════════════════════════════════════════════════════════════
  tblxUAaIsUMEDl3qQ: {
    name: "GROUPAGE LINES",
    pg: "groupage_lines",
    fields: {
      Name: "name",
      Reference: "reference",
      Pallets: "pallets",
      "Loading Date": "loading_date",
      "Delivery Date": "delivery_date",
      Direction: "direction",
      // singleSelect: South→North|North→South, verbatim (#9)
      Status: "status",
      // Unassigned|Assigned, drives the never-delete lifecycle
      Goods: "goods",
      "Temperature C": "temperature_c",
      Notes: "notes"
      // DERIVED (formula/rollup) fields intentionally absent: Groupage ID,
      // Week Number, Total Pallets, any summary, resolved on read from the DB.
    },
    links: {
      "Loading Location": { column: "loading_location_id", table: "locations" },
      "Delivery Location": { column: "delivery_location_id", table: "locations" },
      "Linked International Order": { column: "order_id", table: "orders" },
      "Linked National Order": { column: "national_order_id", table: "national_orders" },
      // GL->CL is the REAL direction (0016 / spec §3 reconciliation); the CL-side
      // 'Groupage Lines' field the old code read is never populated, so it is not
      // modeled here. An Unassigned GL has no CL yet (FK null -> label omitted).
      "Linked Consolidated Load": { column: "cons_load_id", table: "consolidated_loads" }
    }
  },
  // ══════════════════════════════════════════════════════════════════════════
  // CONSOLIDATED LOADS: tbl5XSLQjOnG6yLCW. Sync-chain truck-load node.
  // Third sync-chain table wired. ORDERS-shaped: scalar fields + numbered flat
  // locations + resolvable fleet FKs. THE ONLY DELETABLE sync node (spec §6):
  // RBAC grants DELETE here (unlike GL), because on restore a CL is torn down
  // while its GLs only flip to Unassigned. Field set from the live meta pull
  // (schema doc §3.4, 16 live fields); the DDL (0016) carries the full ORDERS-
  // style column set, so the numbered locations + fleet are wired for fidelity.
  //
  // NOT wired here: 'Source Intl Orders' (many ORDERS per CL) is a MULTI-VALUE
  // reverse link -> the `cons_load_source_orders` join, not an owned single FK,
  // so it is out of scope for facade-links.js (owned single-value FKs only),
  // exactly as ORDERS/GL defer their multi/child links. Reconstructed at import,
  // projected later if the frontend needs it. Direction is Greek here
  // (ΑΝΟΔΟΣ/ΚΑΘΟΔΟΣ), stored verbatim (#9).
  // ══════════════════════════════════════════════════════════════════════════
  tbl5XSLQjOnG6yLCW: {
    name: "CONSOLIDATED LOADS",
    pg: "consolidated_loads",
    fields: {
      Name: "name",
      Date: "load_date",
      Direction: "direction",
      // Greek: ΑΝΟΔΟΣ|ΚΑΘΟΔΟΣ, verbatim (#9)
      Status: "status",
      // Pending|Assigned|Completed|Done (mixed, no CHECK)
      "Total Pallets": "total_pallets",
      // stored numeric here (NOT a formula, unlike ORDERS)
      Goods: "goods",
      "Temperature C": "temperature_c",
      "Loading DateTime": "loading_datetime",
      "Delivery DateTime": "delivery_datetime",
      Notes: "notes",
      "Groupage ID": "groupage_id",
      "Matched Order": "matched_order_id",
      "Is Groupage": "is_groupage",
      "Partner Truck Plates": "partner_truck_plates",
      "Partner Rate": "partner_rate",
      "Pallets 1": "pallets_1",
      "Pallets 2": "pallets_2",
      "Pallets 3": "pallets_3",
      "Pallets 4": "pallets_4",
      "Pallets 5": "pallets_5",
      "Pallets 6": "pallets_6",
      "Pallets 7": "pallets_7",
      "Pallets 8": "pallets_8",
      "Pallets 9": "pallets_9",
      "Pallets 10": "pallets_10"
    },
    links: {
      Client: { column: "client_id", table: "clients" },
      Truck: { column: "truck_id", table: "trucks" },
      Trailer: { column: "trailer_id", table: "trailers" },
      Driver: { column: "driver_id", table: "drivers" },
      Partner: { column: "partner_id", table: "partners" },
      "Loading Location 1": { column: "loading_location_1_id", table: "locations" },
      "Loading Location 2": { column: "loading_location_2_id", table: "locations" },
      "Loading Location 3": { column: "loading_location_3_id", table: "locations" },
      "Loading Location 4": { column: "loading_location_4_id", table: "locations" },
      "Loading Location 5": { column: "loading_location_5_id", table: "locations" },
      "Loading Location 6": { column: "loading_location_6_id", table: "locations" },
      "Loading Location 7": { column: "loading_location_7_id", table: "locations" },
      "Loading Location 8": { column: "loading_location_8_id", table: "locations" },
      "Loading Location 9": { column: "loading_location_9_id", table: "locations" },
      "Loading Location 10": { column: "loading_location_10_id", table: "locations" },
      "Delivery Location 1": { column: "delivery_location_1_id", table: "locations" },
      "Delivery Location 2": { column: "delivery_location_2_id", table: "locations" },
      "Delivery Location 3": { column: "delivery_location_3_id", table: "locations" },
      "Delivery Location 4": { column: "delivery_location_4_id", table: "locations" },
      "Delivery Location 5": { column: "delivery_location_5_id", table: "locations" },
      "Delivery Location 6": { column: "delivery_location_6_id", table: "locations" },
      "Delivery Location 7": { column: "delivery_location_7_id", table: "locations" },
      "Delivery Location 8": { column: "delivery_location_8_id", table: "locations" },
      "Delivery Location 9": { column: "delivery_location_9_id", table: "locations" },
      "Delivery Location 10": { column: "delivery_location_10_id", table: "locations" }
    }
  },
  // ══════════════════════════════════════════════════════════════════════════
  // NATIONAL ORDERS: tblGHCCsTMqAy4KR2. Sync-chain node, auto-created from an
  // international ORDER when Veroia Switch is ON (the cascade's 2nd hop). 4th
  // wired table. ORDERS-shaped. Direction is ARROW chars here (North→South),
  // NOT Greek words (that's CONS_LOADS) (#9). 0 live records today (the natl
  // flow is dormant), so modeled from the DDL/spec, not live rows.
  // ══════════════════════════════════════════════════════════════════════════
  tblGHCCsTMqAy4KR2: {
    name: "NATIONAL ORDERS",
    pg: "national_orders",
    reverseLinks: { "ORDER STOPS": { table: "order_stops", column: "national_order_id" } },
    fields: {
      Direction: "direction",
      // arrows here (North→South), verbatim (#9)
      Status: "status",
      Goods: "goods",
      Reference: "reference",
      Notes: "notes",
      Price: "price",
      "Partner Rate": "partner_rate",
      "Loading DateTime": "loading_datetime",
      "Delivery DateTime": "delivery_datetime",
      "Actual Delivery Date": "actual_delivery_date",
      "National Groupage": "national_groupage",
      "Is Partner Trip": "is_partner_trip",
      // ── Added 2026-07-29 (migration 0021), closing the 0016 lean-model gap ──
      // Verified against the live Airtable meta API, the same rule 0016 used.
      // 'Type' is the NATIONAL discriminator (Independent | Veroia Switch) that
      // the frontend actually keys off (orders_natl.js f['Type']==='Veroia
      // Switch'). It REPLACES the old 'Veroia Switch' -> veroia_switch entry,
      // which was a phantom copied from ORDERS: no such checkbox exists on
      // NATIONAL ORDERS, so nothing could ever have read or written it.
      Type: "type",
      Pallets: "pallets",
      "Temperature \xB0C": "temperature_c",
      "Pallet Exchange": "pallet_exchange",
      // The invoicing set. invoicing.js WRITES all three when invoicing a
      // national order ('Invoiced', 'Invoice Number', 'Invoice Date'); because
      // `fields` doubles as the write allowlist, they were silently dropped and
      // the invoice number never persisted. It also FILTERS on {Invoiced}=1,
      // which 422'd. Both halves of that bug close here.
      Invoiced: "invoiced",
      "Invoice Number": "invoice_number",
      "Invoice Date": "invoice_date",
      "Partner Truck Plates": "partner_truck_plates",
      "Groupage ID": "groupage_id",
      "Matched Order ID": "matched_order_id",
      "Ops Status": "ops_status",
      "Delivery Performance": "delivery_performance",
      "Ops Notes": "ops_notes",
      "Postponed To": "postponed_to",
      ETA: "eta",
      "Assigned At": "assigned_at",
      "CMR Photo Received": "cmr_photo_received",
      "Client Notified": "client_notified",
      "Docs Ready": "docs_ready",
      "Temp OK": "temp_ok",
      "Driver Notified": "driver_notified",
      "Second Card": "second_card",
      "Advance Paid": "advance_paid"
    },
    links: {
      Client: { column: "client_id", table: "clients" },
      Partner: { column: "partner_id", table: "partners" },
      Truck: { column: "truck_id", table: "trucks" },
      Trailer: { column: "trailer_id", table: "trailers" },
      Driver: { column: "driver_id", table: "drivers" },
      "Linked Order": { column: "source_order_id", table: "orders" },
      // source intl order
      "Pickup Location 1": { column: "pickup_location_1_id", table: "locations" },
      "Pickup Location 2": { column: "pickup_location_2_id", table: "locations" },
      "Pickup Location 3": { column: "pickup_location_3_id", table: "locations" },
      "Pickup Location 4": { column: "pickup_location_4_id", table: "locations" },
      "Pickup Location 5": { column: "pickup_location_5_id", table: "locations" },
      "Pickup Location 6": { column: "pickup_location_6_id", table: "locations" },
      "Pickup Location 7": { column: "pickup_location_7_id", table: "locations" },
      "Pickup Location 8": { column: "pickup_location_8_id", table: "locations" },
      "Pickup Location 9": { column: "pickup_location_9_id", table: "locations" },
      "Pickup Location 10": { column: "pickup_location_10_id", table: "locations" },
      "Delivery Location 1": { column: "delivery_location_1_id", table: "locations" },
      "Delivery Location 2": { column: "delivery_location_2_id", table: "locations" },
      "Delivery Location 3": { column: "delivery_location_3_id", table: "locations" },
      "Delivery Location 4": { column: "delivery_location_4_id", table: "locations" },
      "Delivery Location 5": { column: "delivery_location_5_id", table: "locations" },
      "Delivery Location 6": { column: "delivery_location_6_id", table: "locations" },
      "Delivery Location 7": { column: "delivery_location_7_id", table: "locations" },
      "Delivery Location 8": { column: "delivery_location_8_id", table: "locations" },
      "Delivery Location 9": { column: "delivery_location_9_id", table: "locations" },
      "Delivery Location 10": { column: "delivery_location_10_id", table: "locations" }
    }
  },
  // ══════════════════════════════════════════════════════════════════════════
  // ORDER STOPS: tblaeY5QOHAS1gyE8. Sync-chain child, the biggest operational
  // table (514 live rows). 5th wired table. A stop parents to EXACTLY ONE of
  // order / nat_order / nat_load (all three links wired, each an owned single
  // FK; the writer sets only the relevant one). No DELETE (stops are corrected
  // in place / soft-deleted, per RBAC).
  // ══════════════════════════════════════════════════════════════════════════
  tblaeY5QOHAS1gyE8: {
    name: "ORDER STOPS",
    pg: "order_stops",
    fields: {
      "Stop Label": "stop_label",
      "Stop Number": "stop_number",
      "Stop Type": "stop_type",
      // Loading|Unloading|Cross-dock
      DateTime: "datetime",
      Pallets: "pallets",
      Temperature: "temperature",
      Reference: "reference",
      Goods: "goods",
      Notes: "notes",
      "Pallet Sheet OK": "pallet_sheet_ok",
      "Pallets Loaded": "pallets_loaded",
      "Pallets Exchanged": "pallets_exchanged"
    },
    links: {
      Location: { column: "location_id", table: "locations" },
      "Client at Stop": { column: "client_at_stop_id", table: "clients" },
      "Parent Order": { column: "order_id", table: "orders" },
      "Parent Nat Order": { column: "national_order_id", table: "national_orders" },
      "Parent Nat Load": { column: "national_load_id", table: "national_loads" }
    }
  },
  // ══════════════════════════════════════════════════════════════════════════
  // NATIONAL LOADS: tblVW42cZnfC47gTb. The single national planning surface
  // (37 live rows). 6th and LAST sync-chain table wired. POLYMORPHIC parent
  // (spec §6): a discriminator `Source Type` + two nullable owned FKs
  // (source_order_id when Direct/VS, source_cons_load_id when Groupage), guarded
  // by a CHECK (never both). Both are owned single FKs, so facade-links.js wires
  // them straight. `Client` is PLAIN TEXT on this base, NOT a link (spec §3.5),
  // so it maps as a scalar field, not a link. Deletable (RBAC has DELETE).
  // `Source Orders` (the raw id list) is kept as a scalar audit column.
  // ══════════════════════════════════════════════════════════════════════════
  tblVW42cZnfC47gTb: {
    name: "NATIONAL LOADS",
    pg: "national_loads",
    fields: {
      Name: "name",
      Direction: "direction",
      Status: "status",
      Goods: "goods",
      Client: "client",
      // ⚠ plain text on this base, NOT a link (spec §3.5)
      "Total Pallets": "total_pallets",
      "Temperature C": "temperature_c",
      "Loading DateTime": "loading_datetime",
      "Delivery DateTime": "delivery_datetime",
      // Ώρα ραντεβού ανά σκέλος (HH:MM, text). ΞΕΧΩΡΙΣΤΑ από τα datetime:
      // ένα ραντεβού είναι απόφαση που καταγράφηκε ρητά, όχι η ώρα που
      // τυχαίνει να έχει μέσα του ένα timestamp.
      // Απαιτεί db/migrations/2026-08-10_nl_appointments.sql
      "Loading Appointment": "loading_appointment",
      "Delivery Appointment": "delivery_appointment",
      "Actual Delivery Date": "actual_delivery_date",
      Reference: "reference",
      "Matched Load": "matched_load",
      "Is Partner Trip": "is_partner_trip",
      "Partner Truck Plates": "partner_truck_plates",
      "Partner Rate": "partner_rate",
      "Pallet Exchange": "pallet_exchange",
      Notes: "notes",
      "Source Type": "source_type",
      // discriminator, echoed verbatim (FKs are the truth)
      "Source Orders": "source_orders_raw"
      // raw id list, audit/repair scalar
    },
    // ── Airtable-name compatibility (found live 2026-07-28, Phase 4 scenario 1) ──
    // The frontend's VS sync writes `Source Record` (a plain STRING recid) and
    // filters `{Source Record}="recX"`. The schema replaced that convention with
    // the `Source Order` FK link, a label the frontend never uses, so writes
    // silently DROPPED the parentage and the filter 422'd, killing the sync.
    // `aliases` maps the label for writes + filters onto the raw scalar column
    // (deliberately NOT into reads: columnToLabel would otherwise emit one label
    // for two names). `linkAliases` additionally derives the REAL FK from the
    // same value, so integrity is kept, not bypassed: an unknown recid still
    // rejects the write (never a ghost parent).
    aliases: { "Source Record": "source_orders_raw" },
    linkAliases: { "Source Record": "Source Order" },
    reverseLinks: { "ORDER STOPS": { table: "order_stops", column: "national_load_id" } },
    links: {
      // Polymorphic parent: exactly one set (CHECK enforced). Both owned single FKs.
      "Source Order": { column: "source_order_id", table: "orders" },
      // Direct/VS
      "Source Consolidated Load": { column: "source_cons_load_id", table: "consolidated_loads" },
      // Groupage
      Truck: { column: "truck_id", table: "trucks" },
      Trailer: { column: "trailer_id", table: "trailers" },
      Driver: { column: "driver_id", table: "drivers" },
      Partner: { column: "partner_id", table: "partners" },
      "Pickup Location 1": { column: "pickup_location_1_id", table: "locations" },
      "Pickup Location 2": { column: "pickup_location_2_id", table: "locations" },
      "Pickup Location 3": { column: "pickup_location_3_id", table: "locations" },
      "Pickup Location 4": { column: "pickup_location_4_id", table: "locations" },
      "Pickup Location 5": { column: "pickup_location_5_id", table: "locations" },
      "Pickup Location 6": { column: "pickup_location_6_id", table: "locations" },
      "Pickup Location 7": { column: "pickup_location_7_id", table: "locations" },
      "Pickup Location 8": { column: "pickup_location_8_id", table: "locations" },
      "Pickup Location 9": { column: "pickup_location_9_id", table: "locations" },
      "Pickup Location 10": { column: "pickup_location_10_id", table: "locations" },
      "Delivery Location 1": { column: "delivery_location_1_id", table: "locations" },
      "Delivery Location 2": { column: "delivery_location_2_id", table: "locations" },
      "Delivery Location 3": { column: "delivery_location_3_id", table: "locations" },
      "Delivery Location 4": { column: "delivery_location_4_id", table: "locations" },
      "Delivery Location 5": { column: "delivery_location_5_id", table: "locations" },
      "Delivery Location 6": { column: "delivery_location_6_id", table: "locations" },
      "Delivery Location 7": { column: "delivery_location_7_id", table: "locations" },
      "Delivery Location 8": { column: "delivery_location_8_id", table: "locations" },
      "Delivery Location 9": { column: "delivery_location_9_id", table: "locations" },
      "Delivery Location 10": { column: "delivery_location_10_id", table: "locations" }
    }
  },
  // ══════════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════
  // LOCAL MOVES: local_moves. Τοπικές κινήσεις — η ενότητα ΤΟΠΙΚΑ ΔΡΟΜΟΛΟΓΙΑ
  // του Weekly National. ΔΕΝ έχει Airtable προέλευση: γεννήθηκε κατευθείαν στη
  // Supabase (db/migrations/2026-08-10_local_moves.sql), γι' αυτό το κλειδί
  // είναι το ίδιο το pg name και όχι tbl*.
  //
  // Χωριστά από τα national_loads επίτηδες: μια τοπική κίνηση δεν έχει
  // κατεύθυνση βορρά-νότου (Θεσσαλονίκη -> Αλεξάνδρεια δεν είναι ούτε το ένα
  // ούτε το άλλο) και συχνά ούτε πελάτη ούτε παραγγελία.
  //
  // ΔΥΟ nullable γονείς, CHECK «ποτέ και τα δύο» στη βάση — ίδιος κανόνας με
  // τον πολυμορφικό γονέα των national_loads. Και οι δύο NULL = αυτοτελής.
  // ══════════════════════════════════════════════════════════════════════════
  local_moves: {
    name: "LOCAL MOVES",
    pg: "local_moves",
    fields: {
      Date: "move_date",
      Sequence: "sequence",
      Description: "description",
      Pallets: "pallets",
      "Time From": "time_from",
      "Time To": "time_to",
      Status: "status",
      Notes: "notes"
    },
    links: {
      Driver: { column: "driver_id", table: "drivers" },
      Truck: { column: "truck_id", table: "trucks" },
      Trailer: { column: "trailer_id", table: "trailers" },
      Partner: { column: "partner_id", table: "partners" },
      "From Location": { column: "from_location_id", table: "locations" },
      "To Location": { column: "to_location_id", table: "locations" },
      "Parent Nat Load": { column: "parent_nat_load_id", table: "national_loads" },
      "Parent Order": { column: "parent_order_id", table: "orders" }
    }
  },
  // PARTNER ASSIGNMENTS: tblUhgqnmiam5MGNK. Wave 4 (commercial), schema 0018.
  // 28 live rows. The subcontracting record: what we pay a partner for an order,
  // and the margin against what the client pays.
  //
  // READ-ONLY DERIVED FIELDS: 'Client Revenue' (lookup of ORDERS.Net Price),
  // 'Gross Profit' and 'Margin Percent' (formulas) are NOT columns, they are
  // served by the `partner_assignments_computed` view (0018), which reproduces
  // Airtable's arithmetic including its blank-as-zero behaviour (verified 28/28
  // against live values). `readView` tells the facade to SELECT from the view
  // while writes still target the base table, so the frontend keeps seeing the
  // computed fields without them ever being writable.
  //
  // Links: only Partner + Order are wired. 'TRIPS 2'/'TRIPS 3' (-> unmigrated
  // TRIPS) and 'Nat Load' are empty in all 28 rows; their columns exist in 0018
  // but stay unwired until TRIPS migrates (see the migration header).
  // ══════════════════════════════════════════════════════════════════════════
  // SCAN TRAINING (10/8): κοινά few-shot παραδείγματα του AI scan — οι
  // διορθώσεις κάθε dispatcher διδάσκουν τα σκαν όλων. Πίνακας scan_examples.
  tblScanTraining000: {
    name: "SCAN TRAINING",
    pg: "scan_examples",
    fields: {
      "Doc Type": "doc_type",
      "Client ID": "client_id",
      Corrected: "corrected",
      "Created At": "created_at"
    }
  },
  tblUhgqnmiam5MGNK: {
    name: "PARTNER ASSIGNMENTS",
    pg: "partner_assignments",
    readView: "partner_assignments_computed",
    fields: {
      Id: "airtable_seq",
      // Airtable autoNumber, round-tripped verbatim
      "Partner Rate": "partner_rate",
      "Assignment Date": "assignment_date",
      Status: "status",
      // Pending|Confirmed|Completed|Cancelled|Assigned
      "Payment Terms": "payment_terms",
      Notes: "notes",
      TRIPS: "trips_text"
      // stray singleLineText, empty (0018 FLAG 2)
    },
    // Derived, read-only: served from readView, never accepted on write.
    computed: {
      "Client Revenue": "client_revenue",
      "Gross Profit": "gross_profit",
      "Margin Percent": "margin_percent"
    },
    links: {
      Partner: { column: "partner_id", table: "partners" },
      Order: { column: "order_id", table: "orders" }
    }
  },
  // ── Fuel receipts (Wave 2): fuel spend, written ONLY by the sister repo's
  // fuel_import.html (DADI/DKV import). Schema built in 0015. COST TABLE: RBAC
  // (rbac.js) denies dispatcher + warehouse; only owner/management/accountant.
  // 14 storable fields, all directly storable (no formula/rollup). Emoji-laden
  // singleSelect values (Assignment Status/Fuel Type/Country) pass through as
  // text, never translated or stripped (#9). ──
  tblxRFsMeVhlLrBjF: {
    name: "FUEL",
    pg: "fuel",
    fields: {
      "Receipt ID": "receipt_id",
      Date: "receipt_date",
      // renamed: `date` is a PG type name (0015)
      "Odometer KM": "odometer_km",
      Liters: "liters",
      "Total Cost": "total_cost",
      // cost field, gates the dispatcher-deny RBAC
      Station: "station",
      Country: "country",
      // singleSelect 2-letter code
      "Invoice Number": "invoice_number",
      Notes: "notes",
      "Assignment Status": "assignment_status",
      // ✅/⚠️/❌ emoji verbatim
      "Fuel Type": "fuel_type"
      // 🏠/⛽/❄️ emoji verbatim
      // Link fields ('Truck','Trailer','Trip') are NOT mapped: they are FK bigint
      // columns, not label-valued fields. Truck/Trailer FKs resolve today (0007);
      // Trip is a deferred FK (TRIPS = Wave 4). Excluded like every other facade
      // table so a write can't set them yet and a read doesn't surface an
      // unresolved FK as a bad Airtable link (§4.3).
    }
  }
};
function tableConfig(tableId) {
  return TABLES[tableId] || null;
}
__name(tableConfig, "tableConfig");
function columnToLabel(cfg) {
  const out = {};
  for (const [label, column] of Object.entries(cfg.fields)) {
    out[column] = label;
  }
  for (const [label, column] of Object.entries(cfg.computed || {})) {
    out[column] = label;
  }
  return out;
}
__name(columnToLabel, "columnToLabel");
function readRelation(cfg) {
  return cfg.readView || cfg.pg;
}
__name(readRelation, "readRelation");
function fieldsToColumns(cfg, fields) {
  const row = {};
  if (!fields || typeof fields !== "object") return row;
  for (const [label, value] of Object.entries(fields)) {
    const column = cfg.fields[label] || (cfg.aliases || {})[label];
    if (column) row[column] = value;
  }
  return row;
}
__name(fieldsToColumns, "fieldsToColumns");
function filterFieldMap(cfg) {
  return { ...cfg.fields, ...cfg.computed || {}, ...cfg.aliases || {} };
}
__name(filterFieldMap, "filterFieldMap");

// src/lib/formula-translate.js
var UnsupportedFilter = class extends Error {
  static {
    __name(this, "UnsupportedFilter");
  }
  constructor(message) {
    super(message);
    this.name = "UnsupportedFilter";
  }
};
function translateTerm(term, labelToColumn) {
  const t = term.trim();
  let m = t.match(/^\{([^}]+)\}\s*=\s*(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const col = resolveColumn(m[1], labelToColumn);
    return { column: col, expr: `eq.${m[2]}` };
  }
  m = t.match(/^\{([^}]+)\}\s*!=\s*BLANK\(\)$/i);
  if (m) {
    const col = resolveColumn(m[1], labelToColumn);
    return { column: col, expr: "not.is.null" };
  }
  m = t.match(/^\{([^}]+)\}\s*!=\s*(["'])\2$/);
  if (m) {
    const col = resolveColumn(m[1], labelToColumn);
    return { column: col, expr: "not.is.null" };
  }
  m = t.match(/^\{([^}]+)\}\s*!=\s*(["'])(.+)\2$/);
  if (m) {
    const col = resolveColumn(m[1], labelToColumn);
    if (/[(),]/.test(m[3])) {
      throw new Error(`Unsupported value in != filter: ${m[3]}`);
    }
    return { nested: `or(${col}.neq.${m[3]},${col}.is.null)` };
  }
  m = t.match(/^\{([^}]+)\}\s*=\s*BLANK\(\)$/i);
  if (m) {
    const col = resolveColumn(m[1], labelToColumn);
    return { column: col, expr: "is.null" };
  }
  m = t.match(/^LOWER\(\s*TRIM\(\s*\{([^}]+)\}\s*\)\s*\)\s*=\s*(["'])(.*)\2$/i);
  if (m) {
    const col = resolveColumn(m[1], labelToColumn);
    if (m[3] === "") return { column: col, expr: "is.null" };
    const v = m[3].replace(/[*%]/g, "");
    return { column: col, expr: `ilike.${v}` };
  }
  m = t.match(/^\{([^}]+)\}\s*=\s*(["'])(.*)\2$/);
  if (m) {
    const col = resolveColumn(m[1], labelToColumn);
    if (m[3] === "") return { column: col, expr: "is.null" };
    return { column: col, expr: `eq.${m[3]}` };
  }
  m = t.match(/^IS_SAME\(\s*\{([^}]+)\}\s*,\s*(["'])(.*)\2\s*,\s*(["'])day\4\s*\)$/i);
  if (m) {
    const col = resolveColumn(m[1], labelToColumn);
    return { column: col, expr: `eq.${m[3].slice(0, 10)}` };
  }
  m = t.match(/^SEARCH\(\s*LOWER\(\s*(["'])(.*)\1\s*\)\s*,\s*LOWER\(\s*\{([^}]+)\}\s*\)\s*\)$/i);
  if (m) {
    const col = resolveColumn(m[3], labelToColumn);
    const q = m[2].replace(/[*%]/g, "");
    return { column: col, expr: `ilike.*${q}*` };
  }
  m = t.match(/^IS_AFTER\(\s*\{([^}]+)\}\s*,\s*(?:(["'])(.*)\2|TODAY\(\))\s*\)$/i);
  if (m) {
    const col = resolveColumn(m[1], labelToColumn);
    return { column: col, expr: `gt.${m[3] !== void 0 ? normaliseDate(m[3]) : todayUtc()}` };
  }
  m = t.match(/^IS_BEFORE\(\s*\{([^}]+)\}\s*,\s*(?:(["'])(.*)\2|TODAY\(\))\s*\)$/i);
  if (m) {
    const col = resolveColumn(m[1], labelToColumn);
    return { column: col, expr: `lt.${m[3] !== void 0 ? normaliseDate(m[3]) : todayUtc()}` };
  }
  m = t.match(/^RECORD_ID\(\)\s*=\s*(["'])(.*)\1$/i);
  if (m) {
    return { column: "legacy_id", expr: `eq.${m[2]}` };
  }
  throw new UnsupportedFilter(`Unsupported filter term: ${t.slice(0, 80)}`);
}
__name(translateTerm, "translateTerm");
function resolveColumn(label, labelToColumn) {
  const l = label.trim();
  if (l.startsWith("__col:")) return l.slice(6);
  const col = labelToColumn[l];
  if (!col) throw new UnsupportedFilter(`Unknown field in filter: ${label}`);
  return col;
}
__name(resolveColumn, "resolveColumn");
function normaliseDate(v) {
  return v;
}
__name(normaliseDate, "normaliseDate");
function todayUtc() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
__name(todayUtc, "todayUtc");
function splitArgs(inner) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let buf = "";
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null;
      buf += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
    } else if (ch === "(") {
      depth++;
      buf += ch;
    } else if (ch === ")") {
      depth--;
      buf += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);
  return parts;
}
__name(splitArgs, "splitArgs");
function orTerm(term, labelToColumn) {
  const t = term.trim();
  const m = t.match(/^AND\((.*)\)$/is);
  if (m) {
    const inner = splitArgs(m[1]).map((sub) => {
      const r2 = translateTerm(sub, labelToColumn);
      return r2.nested ? r2.nested : `${r2.column}.${r2.expr}`;
    });
    return `and(${inner.join(",")})`;
  }
  const r = translateTerm(t, labelToColumn);
  return r.nested ? r.nested : `${r.column}.${r.expr}`;
}
__name(orTerm, "orTerm");
function applyFilter(formula, labelToColumn, params) {
  const f = (formula || "").trim();
  if (!f) return;
  let m = f.match(/^AND\((.*)\)$/is);
  if (m) {
    for (const term of splitArgs(m[1])) {
      const t = term.trim();
      const inner = t.match(/^OR\((.*)\)$/is);
      if (inner) {
        const ors = splitArgs(inner[1]).map((sub) => orTerm(sub, labelToColumn));
        params.append("or", `(${ors.join(",")})`);
        continue;
      }
      const r2 = translateTerm(t, labelToColumn);
      if (r2.nested) {
        params.append("or", r2.nested.replace(/^or\((.*)\)$/s, "($1)"));
        continue;
      }
      params.append(r2.column, r2.expr);
    }
    return;
  }
  m = f.match(/^OR\((.*)\)$/is);
  if (m) {
    const ors = splitArgs(m[1]).map((term) => orTerm(term, labelToColumn));
    params.append("or", `(${ors.join(",")})`);
    return;
  }
  const r = translateTerm(f, labelToColumn);
  if (r.nested) {
    params.append("or", r.nested.replace(/^or\((.*)\)$/s, "($1)"));
    return;
  }
  params.append(r.column, r.expr);
}
__name(applyFilter, "applyFilter");

// src/lib/facade-links.js
async function resolveIdsToLegacy(env, dbSelectRaw2, parentTable, ids) {
  const out = /* @__PURE__ */ new Map();
  const distinct = [...new Set(ids.filter((v) => v != null))];
  if (distinct.length === 0) return out;
  const params = new URLSearchParams();
  params.set("select", "id,legacy_id");
  params.set("id", `in.(${distinct.join(",")})`);
  const { rows } = await dbSelectRaw2(env, parentTable, params);
  for (const r of rows) out.set(r.id, r.legacy_id);
  return out;
}
__name(resolveIdsToLegacy, "resolveIdsToLegacy");
async function resolveLegacyToIds(env, dbSelectRaw2, parentTable, legacyIds) {
  const out = /* @__PURE__ */ new Map();
  const distinct = [...new Set(legacyIds.filter((v) => v != null && v !== ""))];
  if (distinct.length === 0) return out;
  const params = new URLSearchParams();
  params.set("select", "id,legacy_id");
  const quoted = distinct.map((v) => `"${String(v).replace(/"/g, "")}"`).join(",");
  params.set("legacy_id", `in.(${quoted})`);
  const { rows } = await dbSelectRaw2(env, parentTable, params);
  for (const r of rows) out.set(r.legacy_id, r.id);
  return out;
}
__name(resolveLegacyToIds, "resolveLegacyToIds");
async function resolveLinksOnRead(env, dbSelectRaw2, rows, linksCfg) {
  const perRow = /* @__PURE__ */ new Map();
  if (!linksCfg || rows.length === 0) return perRow;
  const byTable = /* @__PURE__ */ new Map();
  for (const { column, table } of Object.values(linksCfg)) {
    if (!byTable.has(table)) byTable.set(table, /* @__PURE__ */ new Set());
    const set = byTable.get(table);
    for (const row of rows) {
      const v = row[column];
      if (v != null) set.add(v);
    }
  }
  const resolved = /* @__PURE__ */ new Map();
  for (const [table, idSet] of byTable) {
    resolved.set(table, await resolveIdsToLegacy(env, dbSelectRaw2, table, [...idSet]));
  }
  for (const row of rows) {
    const fields = {};
    for (const [label, { column, table }] of Object.entries(linksCfg)) {
      const id = row[column];
      if (id == null) continue;
      const legacy = resolved.get(table)?.get(id);
      if (legacy) fields[label] = [legacy];
    }
    if (Object.keys(fields).length) perRow.set(row, fields);
  }
  return perRow;
}
__name(resolveLinksOnRead, "resolveLinksOnRead");
async function resolveLinksOnWrite(env, dbSelectRaw2, fields, linksCfg) {
  const fkColumns = {};
  const unknownLinks = [];
  if (!linksCfg || !fields) return { fkColumns, unknownLinks };
  const byTable = /* @__PURE__ */ new Map();
  const present = [];
  for (const [label, { column, table }] of Object.entries(linksCfg)) {
    if (!(label in fields)) continue;
    const val = fields[label];
    const recid = Array.isArray(val) ? val[0] ?? null : val || null;
    present.push({ label, column, table, recid });
    if (recid) {
      if (!byTable.has(table)) byTable.set(table, /* @__PURE__ */ new Set());
      byTable.get(table).add(recid);
    }
  }
  const resolved = /* @__PURE__ */ new Map();
  for (const [table, set] of byTable) {
    resolved.set(table, await resolveLegacyToIds(env, dbSelectRaw2, table, [...set]));
  }
  for (const { label, column, table, recid } of present) {
    if (recid == null) {
      fkColumns[column] = null;
      continue;
    }
    const id = resolved.get(table)?.get(recid);
    if (id == null) {
      unknownLinks.push({ label, recid });
    } else {
      fkColumns[column] = id;
    }
  }
  return { fkColumns, unknownLinks };
}
__name(resolveLinksOnWrite, "resolveLinksOnWrite");
async function resolveReverseLinksOnRead(env, dbSelectRaw2, rows, reverseCfg) {
  const byRow = /* @__PURE__ */ new Map();
  const ids = rows.map((r) => r.id).filter((v) => v != null);
  if (!ids.length) return byRow;
  for (const [label, spec] of Object.entries(reverseCfg)) {
    const params = new URLSearchParams();
    params.set("select", `legacy_id,${spec.column}`);
    params.set(spec.column, `in.(${ids.join(",")})`);
    params.set("deleted_at", "is.null");
    const { rows: children } = await dbSelectRaw2(env, spec.table, params);
    const byParent = /* @__PURE__ */ new Map();
    for (const c of children) {
      if (!c.legacy_id) continue;
      const list = byParent.get(c[spec.column]) || [];
      list.push(c.legacy_id);
      byParent.set(c[spec.column], list);
    }
    for (const row of rows) {
      const list = byParent.get(row.id);
      if (!list) continue;
      const extra = byRow.get(row) || {};
      extra[label] = list;
      byRow.set(row, extra);
    }
  }
  return byRow;
}
__name(resolveReverseLinksOnRead, "resolveReverseLinksOnRead");

// src/routes/facade.js
var MAX_PAGE = 100;
function mintLegacyId() {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "rec";
  for (let i = 0; i < 14; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
__name(mintLegacyId, "mintLegacyId");
function toAirtableRecord(row, colToLabel) {
  const fields = {};
  for (const [col, label] of Object.entries(colToLabel)) {
    if (row[col] !== void 0 && row[col] !== null) {
      fields[label] = row[col];
    }
  }
  return { id: row.legacy_id, fields };
}
__name(toAirtableRecord, "toAirtableRecord");
async function handleFacadeGet(request, tableId, origin, env) {
  const caller = await getCaller(request, env);
  if (!caller) return jsonError("Unauthorized", 401, origin, env);
  const cfg = tableConfig(tableId);
  if (!cfg) {
    return jsonError("Table not available on this backend", 404, origin, env);
  }
  if (!can(caller.role, cfg.pg, "GET")) {
    return jsonError("Forbidden", 403, origin, env);
  }
  const url = new URL(request.url);
  const q = url.searchParams;
  const params = new URLSearchParams();
  params.set("deleted_at", "is.null");
  const requestedLabels = q.getAll("fields[]");
  if (requestedLabels.length) {
    const cols = ["legacy_id"];
    if (cfg.links || cfg.reverseLinks) cols.push("id");
    for (const label of requestedLabels) {
      const col = cfg.fields[label] || (cfg.computed || {})[label];
      if (col) cols.push(col);
      else if (cfg.links && cfg.links[label]) cols.push(cfg.links[label].column);
    }
    params.set("select", cols.join(","));
  } else {
    params.set("select", "*");
  }
  let formula = q.get("filterByFormula");
  if (formula) {
    try {
      formula = await preResolveLinkTerms(formula, cfg, env);
      applyFilter(formula, filterFieldMap(cfg), params);
    } catch (e) {
      if (e instanceof UnsupportedFilter) {
        console.warn(`[facade] unsupported filter on ${cfg.name}: ${e.message}`);
        return jsonError("Unsupported query for this table", 422, origin, env);
      }
      throw e;
    }
  }
  const orderParts = [];
  for (let i = 0; q.has(`sort[${i}][field]`); i++) {
    const label = q.get(`sort[${i}][field]`);
    const dir = q.get(`sort[${i}][direction]`) === "desc" ? "desc" : "asc";
    const col = cfg.fields[label];
    if (col) orderParts.push(`${col}.${dir}`);
  }
  if (orderParts.length) params.set("order", orderParts.join(","));
  const pageSize = Math.min(parseInt(q.get("pageSize"), 10) || MAX_PAGE, MAX_PAGE);
  const startOffset = parseInt(q.get("offset"), 10) || 0;
  params.set("limit", String(pageSize + 1));
  params.set("offset", String(startOffset));
  let rows;
  try {
    ({ rows } = await dbSelectRaw(env, readRelation(cfg), params));
  } catch (e) {
    console.error(`GET facade ${cfg.name}`, e.message);
    return jsonError("Failed to load data", 500, origin, env);
  }
  let nextOffset = null;
  if (rows.length > pageSize) {
    rows = rows.slice(0, pageSize);
    nextOffset = String(startOffset + pageSize);
  }
  const colToLabel = columnToLabel(cfg);
  const records = rows.map((r) => toAirtableRecord(r, colToLabel));
  if (cfg.links) {
    try {
      const linkFieldsByRow = await resolveLinksOnRead(env, dbSelectRaw, rows, cfg.links);
      rows.forEach((row, i) => {
        const extra = linkFieldsByRow.get(row);
        if (extra) Object.assign(records[i].fields, extra);
      });
    } catch (e) {
      console.error(`GET facade ${cfg.name} link-resolve`, e.message);
      return jsonError("Failed to load data", 500, origin, env);
    }
  }
  if (cfg.reverseLinks) {
    try {
      const revByRow = await resolveReverseLinksOnRead(env, dbSelectRaw, rows, cfg.reverseLinks);
      rows.forEach((row, i) => {
        const extra = revByRow.get(row);
        if (extra) Object.assign(records[i].fields, extra);
      });
    } catch (e) {
      console.error(`GET facade ${cfg.name} reverse-link-resolve`, e.message);
      return jsonError("Failed to load data", 500, origin, env);
    }
  }
  const payload = { records };
  if (nextOffset) payload.offset = nextOffset;
  return jsonOk(payload, origin, env);
}
__name(handleFacadeGet, "handleFacadeGet");
async function preResolveLinkTerms(formula, cfg, env) {
  if (!cfg.links) return formula;
  let out = formula.replace(
    /COUNTA\(\s*\{([^}]+)\}\s*\)\s*>\s*0/gi,
    (m, label) => cfg.links[label.trim()] ? `{__col:${cfg.links[label.trim()].column}}!=BLANK()` : m
  );
  out = out.replace(
    /\{([^}]+)\}\s*(!?=)\s*(?:BLANK\(\)|''|"")/gi,
    (m, label, op) => cfg.links[label.trim()] ? `{__col:${cfg.links[label.trim()].column}}${op}BLANK()` : m
  );
  const findRe = /FIND\(\s*"(rec[A-Za-z0-9]+)"\s*,\s*ARRAYJOIN\(\s*\{([^}]+)\}\s*(?:,\s*"[^"]*"\s*)?\)\s*\)\s*(?:>\s*0)?/gi;
  const wanted = [];
  for (const m of out.matchAll(findRe)) {
    const link = cfg.links[m[2].trim()];
    if (link) wanted.push({ match: m[0], recid: m[1], link });
  }
  if (wanted.length) {
    const byTable = /* @__PURE__ */ new Map();
    for (const w of wanted) {
      const set = byTable.get(w.link.table) || /* @__PURE__ */ new Set();
      set.add(w.recid);
      byTable.set(w.link.table, set);
    }
    const resolved = /* @__PURE__ */ new Map();
    for (const [table, set] of byTable) {
      resolved.set(table, await resolveLegacyToIds(env, dbSelectRaw, table, [...set]));
    }
    for (const w of wanted) {
      const id = resolved.get(w.link.table)?.get(w.recid);
      out = out.replace(w.match, `{__col:${w.link.column}}="${id != null ? id : -1}"`);
    }
  }
  return out;
}
__name(preResolveLinkTerms, "preResolveLinkTerms");
async function authorizeWrite(request, tableId, method, origin, env) {
  const caller = await getCaller(request, env);
  if (!caller) return { res: jsonError("Unauthorized", 401, origin, env) };
  const cfg = tableConfig(tableId);
  if (!cfg) return { res: jsonError("Table not available on this backend", 404, origin, env) };
  if (!can(caller.role, cfg.pg, method)) {
    return { res: jsonError("Forbidden", 403, origin, env) };
  }
  return { caller, cfg };
}
__name(authorizeWrite, "authorizeWrite");
async function buildWriteRow(cfg, fields, origin, env) {
  if (cfg.linkAliases && fields && typeof fields === "object") {
    for (const [aliasLabel, linkLabel] of Object.entries(cfg.linkAliases)) {
      const v = fields[aliasLabel];
      if (typeof v === "string" && v && fields[linkLabel] === void 0) {
        fields = { ...fields, [linkLabel]: [v] };
      }
    }
  }
  const row = fieldsToColumns(cfg, fields);
  if (cfg.links) {
    let fkColumns, unknownLinks;
    try {
      ({ fkColumns, unknownLinks } = await resolveLinksOnWrite(env, dbSelectRaw, fields, cfg.links));
    } catch (e) {
      console.error(`write facade ${cfg.name} link-resolve`, e.message);
      return { error: jsonError("Failed to process request", 500, origin, env) };
    }
    if (unknownLinks.length) {
      console.warn(`[facade] ${cfg.name} unknown links: ${unknownLinks.map((u) => `${u.label}=${u.recid}`).join(", ")}`);
      return { error: jsonError("Unknown linked record in request", 400, origin, env) };
    }
    Object.assign(row, fkColumns);
  }
  return { row };
}
__name(buildWriteRow, "buildWriteRow");
async function shapeOneWithLinks(row, cfg, env) {
  const colToLabel = columnToLabel(cfg);
  const record = toAirtableRecord(row, colToLabel);
  if (cfg.computed && row?.legacy_id) {
    try {
      const params = new URLSearchParams();
      params.set("select", ["legacy_id", ...Object.values(cfg.computed)].join(","));
      params.set("legacy_id", `eq.${row.legacy_id}`);
      params.set("limit", "1");
      const { rows: viewRows } = await dbSelectRaw(env, readRelation(cfg), params);
      if (viewRows?.[0]) {
        for (const [label, column] of Object.entries(cfg.computed)) {
          const v = viewRows[0][column];
          if (v !== null && v !== void 0) record.fields[label] = v;
        }
      }
    } catch (e) {
      console.error(`write facade ${cfg.name} computed re-read`, e.message);
    }
  }
  if (cfg.links) {
    try {
      const byRow = await resolveLinksOnRead(env, dbSelectRaw, [row], cfg.links);
      const extra = byRow.get(row);
      if (extra) Object.assign(record.fields, extra);
    } catch (e) {
      console.error(`write facade ${cfg.name} response link-resolve`, e.message);
    }
  }
  return record;
}
__name(shapeOneWithLinks, "shapeOneWithLinks");
async function handleFacadeCreate(request, tableId, origin, env) {
  const { res, caller, cfg } = await authorizeWrite(request, tableId, "POST", origin, env);
  if (res) return res;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request", 400, origin, env);
  }
  if (Array.isArray(body.records)) {
    return facadeBatchCreate(body.records, cfg, caller, origin, env);
  }
  const { row, error } = await buildWriteRow(cfg, body.fields, origin, env);
  if (error) return error;
  if (Object.keys(row).length === 0) {
    return jsonError("No writable fields in request", 400, origin, env);
  }
  row.legacy_id = mintLegacyId();
  let created;
  try {
    created = await dbInsert(env, cfg.pg, row);
  } catch (e) {
    console.error(`POST facade ${cfg.name}`, e.message);
    return jsonError("Failed to create record", 500, origin, env);
  }
  await audit(env, {
    actor: caller.sub,
    role: caller.role,
    action: "create",
    table: cfg.pg,
    recordId: created?.legacy_id || null,
    after: created
  });
  const record = await shapeOneWithLinks(created, cfg, env);
  return jsonOk(record, origin, env, 201);
}
__name(handleFacadeCreate, "handleFacadeCreate");
async function facadeBatchCreate(entries, cfg, caller, origin, env) {
  if (entries.length === 0) return jsonError("Empty records array", 400, origin, env);
  if (entries.length > 10) return jsonError("Batch too large (max 10 records)", 422, origin, env);
  const rows = [];
  for (const entry of entries) {
    const { row, error } = await buildWriteRow(cfg, entry?.fields, origin, env);
    if (error) return error;
    if (Object.keys(row).length === 0) {
      return jsonError("No writable fields in request", 400, origin, env);
    }
    row.legacy_id = mintLegacyId();
    rows.push(row);
  }
  const records = [];
  for (const row of rows) {
    let created;
    try {
      created = await dbInsert(env, cfg.pg, row);
    } catch (e) {
      console.error(`POST batch facade ${cfg.name}`, e.message);
      return jsonError("Failed to create record", 500, origin, env);
    }
    await audit(env, {
      actor: caller.sub,
      role: caller.role,
      action: "create",
      table: cfg.pg,
      recordId: created?.legacy_id || null,
      after: created
    });
    records.push(await shapeOneWithLinks(created, cfg, env));
  }
  return jsonOk({ records }, origin, env);
}
__name(facadeBatchCreate, "facadeBatchCreate");
async function handleFacadeBatchUpdate(request, tableId, origin, env) {
  const { res, caller, cfg } = await authorizeWrite(request, tableId, "PATCH", origin, env);
  if (res) return res;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request", 400, origin, env);
  }
  if (!Array.isArray(body.records)) {
    return jsonError("Batch PATCH requires a records array", 400, origin, env);
  }
  if (body.records.length === 0) return jsonError("Empty records array", 400, origin, env);
  if (body.records.length > 10) return jsonError("Batch too large (max 10 records)", 422, origin, env);
  const patches = [];
  for (const entry of body.records) {
    if (!entry?.id) return jsonError("Each batch record needs an id", 400, origin, env);
    const { row: patch, error } = await buildWriteRow(cfg, entry.fields, origin, env);
    if (error) return error;
    if (Object.keys(patch).length === 0) {
      return jsonError("No writable fields in request", 400, origin, env);
    }
    patches.push({ recId: entry.id, patch });
  }
  const records = [];
  for (const { recId, patch } of patches) {
    let updated;
    try {
      updated = await dbUpdate(env, cfg.pg, "legacy_id", recId, patch);
    } catch (e) {
      console.error(`PATCH batch facade ${cfg.name}`, e.message);
      return jsonError("Failed to update record", 500, origin, env);
    }
    if (!updated) return jsonError(`Record not found: ${recId}`, 404, origin, env);
    await audit(env, {
      actor: caller.sub,
      role: caller.role,
      action: "update",
      table: cfg.pg,
      recordId: recId,
      after: updated
    });
    records.push(await shapeOneWithLinks(updated, cfg, env));
  }
  return jsonOk({ records }, origin, env);
}
__name(handleFacadeBatchUpdate, "handleFacadeBatchUpdate");
async function handleFacadeGetOne(request, tableId, recId, origin, env) {
  const caller = await getCaller(request, env);
  if (!caller) return jsonError("Unauthorized", 401, origin, env);
  const cfg = tableConfig(tableId);
  if (!cfg) return jsonError("Table not available on this backend", 404, origin, env);
  if (!can(caller.role, cfg.pg, "GET")) return jsonError("Forbidden", 403, origin, env);
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("legacy_id", `eq.${recId}`);
  params.set("deleted_at", "is.null");
  params.set("limit", "1");
  let rows;
  try {
    ({ rows } = await dbSelectRaw(env, readRelation(cfg), params));
  } catch (e) {
    console.error(`GET-one facade ${cfg.name}`, e.message);
    return jsonError("Failed to load data", 500, origin, env);
  }
  if (!rows.length) return jsonError("Record not found", 404, origin, env);
  const record = toAirtableRecord(rows[0], columnToLabel(cfg));
  if (cfg.links) {
    try {
      const byRow = await resolveLinksOnRead(env, dbSelectRaw, rows, cfg.links);
      const extra = byRow.get(rows[0]);
      if (extra) Object.assign(record.fields, extra);
    } catch (e) {
      console.error(`GET-one facade ${cfg.name} link-resolve`, e.message);
      return jsonError("Failed to load data", 500, origin, env);
    }
  }
  if (cfg.reverseLinks) {
    try {
      const revByRow = await resolveReverseLinksOnRead(env, dbSelectRaw, rows, cfg.reverseLinks);
      const extra = revByRow.get(rows[0]);
      if (extra) Object.assign(record.fields, extra);
    } catch (e) {
      console.error(`GET-one facade ${cfg.name} reverse-link-resolve`, e.message);
      return jsonError("Failed to load data", 500, origin, env);
    }
  }
  return jsonOk(record, origin, env);
}
__name(handleFacadeGetOne, "handleFacadeGetOne");
async function handleFacadeUpdate(request, tableId, recId, origin, env) {
  const { res, caller, cfg } = await authorizeWrite(request, tableId, "PATCH", origin, env);
  if (res) return res;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request", 400, origin, env);
  }
  const { row: patch, error } = await buildWriteRow(cfg, body.fields, origin, env);
  if (error) return error;
  if (Object.keys(patch).length === 0) {
    return jsonError("No writable fields in request", 400, origin, env);
  }
  let updated;
  try {
    updated = await dbUpdate(env, cfg.pg, "legacy_id", recId, patch);
  } catch (e) {
    console.error(`PATCH facade ${cfg.name}`, e.message);
    return jsonError("Failed to update record", 500, origin, env);
  }
  if (!updated) {
    return jsonError("Record not found", 404, origin, env);
  }
  await audit(env, {
    actor: caller.sub,
    role: caller.role,
    action: "update",
    table: cfg.pg,
    recordId: recId,
    after: updated
  });
  const record = await shapeOneWithLinks(updated, cfg, env);
  return jsonOk(record, origin, env);
}
__name(handleFacadeUpdate, "handleFacadeUpdate");
async function handleFacadeDelete(request, tableId, recId, origin, env) {
  const { res, caller, cfg } = await authorizeWrite(request, tableId, "DELETE", origin, env);
  if (res) return res;
  let deleted;
  try {
    deleted = await dbUpdate(env, cfg.pg, "legacy_id", recId, {
      deleted_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (e) {
    console.error(`DELETE facade ${cfg.name}`, e.message);
    return jsonError("Failed to delete record", 500, origin, env);
  }
  if (!deleted) {
    return jsonError("Record not found", 404, origin, env);
  }
  await audit(env, {
    actor: caller.sub,
    role: caller.role,
    action: "delete",
    table: cfg.pg,
    recordId: recId,
    before: deleted
    // the row as it was when soft-deleted
  });
  return jsonOk({ id: recId, deleted: true }, origin, env);
}
__name(handleFacadeDelete, "handleFacadeDelete");
async function handleOrderCascadeDelete(request, tableId, recId, origin, env) {
  const caller = await getCaller(request, env);
  if (!caller) return jsonError("Unauthorized", 401, origin, env);
  const cfg = tableConfig(tableId);
  if (!cfg) return jsonError("Table not available on this backend", 404, origin, env);
  if (!can(caller.role, cfg.pg, "PATCH")) {
    return jsonError("Forbidden", 403, origin, env);
  }
  let summary;
  try {
    summary = await dbRpc(env, "delete_order_cascade", { p_order_legacy_id: recId });
  } catch (e) {
    console.error(`cascade-delete ORDERS ${recId}`, e.message);
    return jsonError("Failed to delete order", 500, origin, env);
  }
  if (!summary || summary.order_found === false) {
    return jsonError("Record not found", 404, origin, env);
  }
  await audit(env, {
    actor: caller.sub,
    role: caller.role,
    action: "cascade_delete",
    table: cfg.pg,
    recordId: recId,
    after: summary
    // per-step counts, the accountable record of what the cascade touched
  });
  return jsonOk({ id: recId, deleted: true, cascade: summary }, origin, env);
}
__name(handleOrderCascadeDelete, "handleOrderCascadeDelete");

// src/index.js
var FACADE_PATH = /^\/v0\/[^/]+\/([^/]+)(?:\/([^/]+))?\/?$/;
// src/routes/costs.js — COSTS Φ1 (2026-08-10, COSTS_ARCHITECTURE §5/§6)
// RT create/close/list · manual cost lines (net+VAT) · PnL read (OWNER ONLY)
var CT_CATEGORIES = ["fuel", "reefer_fuel", "tolls", "dkv", "adblue", "driver_pay", "cash_m", "spedition", "accommodation", "ferry_train", "fines", "partner_rate", "fixed_alloc", "other"];
var COSTS_PERMS = {
  owner: { settings: ["GET", "PATCH"], rt: ["GET", "POST", "PATCH"], lines: ["GET", "POST"], pnl: ["GET"], lookups: ["GET"] },
  accountant: { settings: ["GET"], rt: ["GET", "POST"], lines: ["GET", "POST"], lookups: ["GET"] },
  dispatcher: { rt: ["GET", "POST", "PATCH"], lookups: ["GET"] },
  management: {},
  warehouse: {}
};
function ctCan(role, resource, method) {
  const r = COSTS_PERMS[role];
  return !!(r && r[resource] && r[resource].includes(method));
}
async function ctDbPatch(env, table, filter, patch) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(patch)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ctDbPatch ${table} ${res.status}: ${detail.slice(0, 200)}`);
  }
  const rows = await res.json();
  return rows[0] || null;
}
function ctPick(body, fields) {
  const row = {};
  for (const f of fields) {
    if (body[f] === void 0 || body[f] === null || body[f] === "") continue;
    row[f] = typeof body[f] === "string" ? body[f].trim() : body[f];
  }
  return row;
}
async function handleCosts(request, url, origin, env) {
  const caller = await getCaller(request, env);
  if (!caller) return jsonError("Unauthorized", 401, origin, env);
  const seg = url.pathname.split("/").filter(Boolean);
  const resource = seg[1] || "";
  const recId = seg[2] || null;
  const method = request.method;
  if (!ctCan(caller.role, resource, method)) {
    return jsonError("Forbidden", 403, origin, env);
  }
  try {
    // ---- GET /costs/lookups  (ids + labels για dropdowns/ονόματα) ----
    if (resource === "lookups" && method === "GET") {
      const [trucks, trailers, drivers, partners] = await Promise.all([
        dbSelect(env, "trucks", { select: "id,license_plate,active", order: "license_plate.asc", limit: 300 }),
        dbSelect(env, "trailers", { select: "id,license_plate,active", order: "license_plate.asc", limit: 300 }),
        dbSelect(env, "drivers", { select: "id,full_name,active", order: "full_name.asc", limit: 300 }),
        dbSelect(env, "partners", { select: "id,company_name,active", order: "company_name.asc", limit: 500 })
      ]);
      return jsonOk({ trucks, trailers, drivers, partners }, origin, env);
    }
    // ---- GET /costs/settings ----
    if (resource === "settings" && method === "GET") {
      const rows = await dbSelect(env, "ct_settings", { select: "key,value,updated_at", order: "key.asc" });
      return jsonOk({ records: rows }, origin, env);
    }
    // ---- PATCH /costs/settings  {key, value} (owner) ----
    if (resource === "settings" && method === "PATCH") {
      const body = await request.json().catch(() => null);
      if (!body || !body.key || typeof body.value !== "number") {
        return jsonError("key + numeric value required", 400, origin, env);
      }
      const before = await dbSelectRaw(env, "ct_settings", new URLSearchParams({ key: `eq.${body.key}`, select: "*" }));
      if (!before.rows.length) return jsonError("Unknown setting", 404, origin, env);
      const updated = await ctDbPatch(env, "ct_settings", `key=eq.${encodeURIComponent(body.key)}`, { value: body.value, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
      await audit(env, { actor: caller.sub, role: caller.role, action: "update", table: "ct_settings", recordId: body.key, before: before.rows[0], after: updated });
      return jsonOk({ record: updated }, origin, env);
    }
    // ---- POST /costs/rt  (planners auto ή manual modal) ----
    if (resource === "rt" && method === "POST" && !recId) {
      const body = await request.json().catch(() => null);
      if (!body) return jsonError("Invalid request", 400, origin, env);
      const row = ctPick(body, ["scope", "trip_type", "truck_id", "trailer_id", "driver_id", "partner_id", "date_start", "date_end", "total_km", "source"]);
      if (!row.scope || !row.trip_type || !row.date_start) {
        return jsonError("scope, trip_type, date_start required", 400, origin, env);
      }
      row.created_by = caller.sub;
      const created = await dbInsert(env, "ct_round_trips", row);
      const legs = Array.isArray(body.legs) ? body.legs : [];
      const createdLegs = [];
      for (const leg of legs.slice(0, 20)) {
        const legRow = ctPick(leg, ["direction", "order_id", "nat_load_id"]);
        if (!legRow.direction || legRow.order_id === void 0 && legRow.nat_load_id === void 0) continue;
        legRow.rt_id = created.id;
        createdLegs.push(await dbInsert(env, "ct_rt_legs", legRow));
      }
      await audit(env, { actor: caller.sub, role: caller.role, action: "create", table: "ct_round_trips", recordId: String(created.id), after: { ...created, legs: createdLegs } });
      return jsonOk({ record: created, legs: createdLegs }, origin, env, 201);
    }
    // ---- GET /costs/rt  (λίστα ΧΩΡΙΣ αποτελέσματα PnL) ----
    if (resource === "rt" && method === "GET") {
      const q = url.searchParams;
      const params = new URLSearchParams();
      params.set("select", "*,ct_rt_legs(id,direction,order_id,nat_load_id)");
      params.set("order", "date_start.desc");
      params.set("limit", "200");
      if (q.get("from")) params.append("date_start", `gte.${q.get("from")}`);
      if (q.get("to")) params.append("date_start", `lte.${q.get("to")}`);
      if (q.get("truck_id")) params.append("truck_id", `eq.${q.get("truck_id")}`);
      if (q.get("status")) params.append("status", `eq.${q.get("status")}`);
      const { rows } = await dbSelectRaw(env, "ct_round_trips", params);
      return jsonOk({ records: rows }, origin, env);
    }
    // ---- PATCH /costs/rt/:id  (κλείσιμο/διόρθωση — fallback του data event) ----
    if (resource === "rt" && method === "PATCH" && recId) {
      const body = await request.json().catch(() => null);
      if (!body) return jsonError("Invalid request", 400, origin, env);
      const patch = ctPick(body, ["status", "date_start", "date_end", "total_km", "truck_id", "trailer_id", "driver_id", "closed_at"]);
      if (!Object.keys(patch).length) return jsonError("Nothing to update", 400, origin, env);
      if (patch.status === "closed" && !patch.closed_at) patch.closed_at = (/* @__PURE__ */ new Date()).toISOString();
      patch.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      const before = await dbSelectRaw(env, "ct_round_trips", new URLSearchParams({ id: `eq.${recId}`, select: "*" }));
      if (!before.rows.length) return jsonError("Not found", 404, origin, env);
      const updated = await ctDbPatch(env, "ct_round_trips", `id=eq.${encodeURIComponent(recId)}`, patch);
      await audit(env, { actor: caller.sub, role: caller.role, action: "update", table: "ct_round_trips", recordId: String(recId), before: before.rows[0], after: updated });
      return jsonOk({ record: updated }, origin, env);
    }
    // ---- POST /costs/lines  (Shape B/C — net + VAT ΧΩΡΙΣΤΑ) ----
    if (resource === "lines" && method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body) return jsonError("Invalid request", 400, origin, env);
      if (!CT_CATEGORIES.includes(body.category)) {
        return jsonError("Unknown category", 400, origin, env);
      }
      const row = ctPick(body, ["rt_id", "category", "toll_country", "net", "vat", "line_date", "plate_raw", "truck_id", "km_reading", "liters", "station", "note"]);
      if (typeof row.net !== "number" && typeof row.vat !== "number") {
        return jsonError("net or vat amount required", 400, origin, env);
      }
      row.alloc_status = row.rt_id ? "allocated" : "unallocated";
      row.created_by = caller.sub;
      const created = await dbInsert(env, "ct_cost_lines", row);
      await audit(env, { actor: caller.sub, role: caller.role, action: "create", table: "ct_cost_lines", recordId: String(created.id), after: created });
      return jsonOk({ record: created }, origin, env, 201);
    }
    // ---- GET /costs/lines?rt_id= | alloc_status= ----
    if (resource === "lines" && method === "GET") {
      const q = url.searchParams;
      const params = new URLSearchParams();
      params.set("select", "*");
      params.set("order", "line_date.desc,id.desc");
      params.set("limit", "300");
      if (q.get("rt_id")) params.append("rt_id", `eq.${q.get("rt_id")}`);
      if (q.get("alloc_status")) params.append("alloc_status", `eq.${q.get("alloc_status")}`);
      let { rows } = await dbSelectRaw(env, "ct_cost_lines", params);
      if (caller.role !== "owner") {
        rows = rows.filter((r) => r.category !== "cash_m");
      }
      return jsonOk({ records: rows }, origin, env);
    }
    // ---- GET /costs/pnl  (ΑΠΟΤΕΛΕΣΜΑΤΑ — ΜΟΝΟ OWNER, spec §10.2.11) ----
    if (resource === "pnl" && method === "GET") {
      const q = url.searchParams;
      const params = new URLSearchParams();
      params.set("select", "*");
      params.set("order", "margin_worst_pct.asc.nullsfirst");
      params.set("limit", "300");
      if (q.get("from")) params.append("date_start", `gte.${q.get("from")}`);
      if (q.get("to")) params.append("date_start", `lte.${q.get("to")}`);
      if (q.get("scope")) params.append("scope", `eq.${q.get("scope")}`);
      if (q.get("truck_id")) params.append("truck_id", `eq.${q.get("truck_id")}`);
      const { rows } = await dbSelectRaw(env, "ct_v_rt_pnl", params);
      return jsonOk({ records: rows }, origin, env);
    }
    return jsonError("Not found", 404, origin, env);
  } catch (e) {
    console.error(`COSTS ${method} ${url.pathname}`, e.message);
    return jsonError("Costs request failed", 500, origin, env);
  }
}
__name(handleCosts, "handleCosts");

var ORDERS_TABLE_ID = "tblgHlNmLBH3JTdIM";
var index_default = {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    const allowlist = (env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim());
    if (origin && !allowlist.includes(origin)) {
      return jsonError("Origin not allowed", 403, origin, env);
    }
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok", ts: Date.now() }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/auth/login" && request.method === "POST") {
      return handleLogin(request, origin, env);
    }
    if (url.pathname === "/audit" && request.method === "GET") {
      return handleAuditGet(request, origin, env);
    }
    if (url.pathname === "/app-errors") {
      if (request.method === "POST") return handleAppErrorPost(request, origin, env);
      if (request.method === "GET") return handleAppErrorsGet(request, origin, env);
    }
    if (url.pathname === "/v1/ai/messages" && request.method === "POST") {
      return handleAiMessages(request, origin, env);
    }
    if (url.pathname === "/api/locations") {
      if (request.method === "GET") return handleGetLocations(request, origin, env);
      if (request.method === "POST") return handleCreateLocation(request, origin, env);
    }
    if (url.pathname.startsWith("/costs/")) {
      return handleCosts(request, url, origin, env);
    }
    const facadeMatch = url.pathname.match(FACADE_PATH);
    if (facadeMatch) {
      const tableId = facadeMatch[1];
      const recId = facadeMatch[2] || null;
      if (!recId) {
        if (request.method === "GET") return handleFacadeGet(request, tableId, origin, env);
        if (request.method === "POST") return handleFacadeCreate(request, tableId, origin, env);
        if (request.method === "PATCH") return handleFacadeBatchUpdate(request, tableId, origin, env);
      } else {
        if (request.method === "GET") return handleFacadeGetOne(request, tableId, recId, origin, env);
        if (request.method === "PATCH") return handleFacadeUpdate(request, tableId, recId, origin, env);
        if (request.method === "DELETE") {
          if (tableId === ORDERS_TABLE_ID) return handleOrderCascadeDelete(request, tableId, recId, origin, env);
          return handleFacadeDelete(request, tableId, recId, origin, env);
        }
      }
    }
    return jsonError("Not found", 404, origin, env);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
