# TMS API Proxy — Cloudflare Worker

Proxies Airtable API requests so the PAT stays server-side.
Includes JWT authentication — browser must log in to get a token before making API calls.

## Deploy

```bash
# 1. Install Wrangler CLI
npm install -g wrangler

# 2. Log in to Cloudflare
wrangler login

# 3. Set secrets
cd worker/
wrangler secret put AIRTABLE_TOKEN
# Paste: patpPJXnFYnxdgoK3.a2162b09fbb2...

wrangler secret put JWT_SECRET
# Paste a strong random string (32+ chars), e.g.:
#   openssl rand -hex 32

# 4. Deploy
wrangler deploy
```

The worker will be live at `https://tms-api-proxy.<your-subdomain>.workers.dev`.

## Enable in TMS

Edit `config.js`:

```js
const USE_PROXY = true;
const PROXY_URL = 'https://tms-api-proxy.<your-subdomain>.workers.dev';
```

Once confirmed working, remove `AT_TOKEN` from `config.js`.

## Auth Flow

1. **Login**: Browser POSTs `{ username, passwordHash }` to `/auth/login`
   - `passwordHash` is the SHA-256 hex hash of the plaintext password (hashed client-side)
   - Worker validates against hardcoded user list (same users as `index.html`)
   - Returns a signed JWT token (HS256, 8h expiry) + user info

2. **API Calls**: Browser sends `Authorization: Bearer <jwt>` on all `/v0/*` requests
   - Worker validates JWT signature and expiry
   - Adds `X-User-Role` and `X-User-Name` headers to the Airtable request (for future server-side permission checks)
   - Swaps the JWT for the real Airtable PAT before forwarding

3. **Token Expiry**: JWT expires after 8 hours (matches session TTL)
   - On 401 response, the client clears session and redirects to login

## Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /health` | None | Health check, active/queued counts |
| `POST /auth/login` | None | Login, returns JWT |
| `* /v0/*` | JWT | Proxied Airtable API calls |

## How it works

- Browser sends `GET /v0/{baseId}/{tableId}?params` to the worker with JWT
- Worker validates JWT, then adds `Authorization: Bearer <airtable-pat>` and forwards to `api.airtable.com`
- CORS locked to `https://dimitrispetras21-del.github.io`
- Server-side rate limiting: max 4 concurrent requests to Airtable, overflow queued (max 20 queued, then 429)
