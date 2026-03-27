# TMS API Proxy — Cloudflare Worker

Proxies Airtable API requests so the PAT stays server-side.

## Deploy

```bash
# 1. Install Wrangler CLI
npm install -g wrangler

# 2. Log in to Cloudflare
wrangler login

# 3. Set the Airtable PAT as a secret
cd worker/
wrangler secret put AIRTABLE_TOKEN
# Paste: patpPJXnFYnxdgoK3.a2162b09fbb2...

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

## How it works

- Browser sends `GET /v0/{baseId}/{tableId}?params` to the worker
- Worker adds `Authorization: Bearer <secret>` and forwards to `api.airtable.com`
- CORS locked to `https://dimitrispetras21-del.github.io`
- Server-side rate limiting: max 4 concurrent requests to Airtable, overflow queued (max 20 queued, then 429)
