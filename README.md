# @justin-netage/supabase-proxy-client

Transparent Supabase proxy client for the [Netage Proxy Hub](https://github.com/justin-netage/netage-proxy-hub). Lets a Lovable-hosted (or any Vite/React) frontend route Supabase traffic through a per-site reverse proxy, with **zero per-project configuration**. Each site's config (Supabase project ref, anon key, proxy custom domain) is fetched at runtime from the proxy hub based on the current hostname.

## Why

Lovable's build pipeline strips or overrides custom Vite env vars (`VITE_SUPABASE_URL_OG`, `VITE_SUPABASE_PROJECT_ID`, sometimes user-set `VITE_SUPABASE_URL`). An env-driven proxy rewrite silently no-ops in deployed bundles. Lovable "Secrets" are Supabase Edge Function env vars, not injected into the client. So client config has to come from a runtime API call — which is what this package does.

## Architecture

```
┌─────────────┐   1. GET /api/bootstrap     ┌─────────────────┐
│  customer    │ ────────────────────▶ │  netage-        │
│  site (SPA)  │                             │  proxy-hub      │
│              │ ◀──────────────────── │                 │
│              │   2. { projectRef, anonKey, │  looks up site  │
│              │       proxyDomain,          │  by Host header │
│              │       functionsDomain? }    │                 │
│              │                             └─────────────────┘
│              │
│              │ 3. createClient(proxyDomain, anonKey)
│              │ 4. all subsequent Supabase REST/Auth/Storage → proxy-hub
│              │ 5. supabase.functions.invoke() → functionsDomain (if set)
└─────────────┘
```

## Install

This package is published to **GitHub Packages** (private). Consumers need a `.npmrc` with a token that has `read:packages` scope:

```
@justin-netage:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```sh
npm install @justin-netage/supabase-proxy-client @supabase/supabase-js
```

If Lovable's build doesn't honor `.npmrc`, fall back to a git-URL install:

```sh
npm install git+https://github.com/justin-netage/proxy-hub-client.git#v1.0.0
```

## Usage

Drop this in `src/lib/supabase.ts` — identical across every Lovable project:

```ts
import { initProxiedSupabase } from '@justin-netage/supabase-proxy-client';

export const { supabase, proxyUrl } = await initProxiedSupabase({
  // Optional: used as a fallback when bootstrap fetch fails (localhost dev).
  dev: {
    projectRef: 'abc123',
    proxyDomain: 'http://localhost:54321',
    anonKey: 'eyJ...',
  },
});
```

Use `proxyUrl()` to rewrite stored Supabase URLs (e.g. legacy `getPublicUrl()` results persisted to a row) at render time:

```tsx
<img src={proxyUrl(row.image_url)} alt={row.title} />
```

### Calling Supabase Functions

When the hub is configured with a `functionsCustomDomain` for the site, the client automatically points `supabase.functions.invoke()` at that domain — no extra setup required:

```ts
const { data, error } = await supabase.functions.invoke('hello', {
  body: { name: 'world' },
});
// → POST https://api.example.com/hello
```

For payment-gateway webhooks (Netcash, Stripe, etc.), the gateway POSTs directly to the same hostname and the proxy passes the Authorization header through unchanged. The upstream Function **must** be deployed with `verify_jwt = false` so it accepts unauthenticated callbacks:

```toml
# supabase/functions/netcash-notify/config.toml
verify_jwt = false
```

```
Netcash → POST https://api.example.com/netcash-notify
        → proxy hub (Host: api.example.com → site lookup → functions_url)
        → https://<ref>.functions.supabase.co/netcash-notify
```

### Synchronous variant (Pattern A)

If you'd rather hardcode config and skip the bootstrap fetch:

```ts
import { createProxiedSupabase } from '@justin-netage/supabase-proxy-client';

export const { supabase, proxyUrl } = createProxiedSupabase({
  projectRef: 'abc123',
  proxyDomain: 'https://data-afhco.gogee.ai',
  functionsDomain: 'https://api.afhco.gogee.ai', // optional
  anonKey: 'eyJ...',
});
```

## API

### `initProxiedSupabase(options?)`

Fetches `/api/bootstrap` from the current origin (or from `options.bootstrapUrl`), constructs a Supabase client pointed at the proxy domain, and returns `{ supabase, proxyUrl, config }`.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `bootstrapUrl` | `string` | `${location.origin}/api/bootstrap` | Where to fetch the runtime config |
| `dev` | `BootstrapConfig` | — | Inline fallback used if the fetch throws |
| `clientOptions` | `SupabaseClientOptions` | — | Forwarded to `createClient` |
| `fetch` | `typeof fetch` | global `fetch` | Inject for tests |

### `createProxiedSupabase(config, clientOptions?)`

Synchronous. Skips the network round-trip.

### `proxyUrl(url)`

Returned from both init functions. Rewrites `https://<projectRef>.supabase.co/<rest>` to `<proxyDomain>/<rest>`. Falsy input → `''`. Non-matching input passes through.

## Server contract

The proxy hub's `GET /api/bootstrap` endpoint returns:

```json
{
  "projectRef": "abc123",
  "proxyDomain": "https://data-afhco.gogee.ai",
  "functionsDomain": "https://api.afhco.gogee.ai",
  "anonKey": "eyJ..."
}
```

- Looked up by the request's `Host` header against `sites.custom_domain`, `sites.data_custom_domain`, or `sites.functions_custom_domain`.
- All values are public-by-design — safe to ship to the browser.
- `functionsDomain` is `null` when the site has no Functions proxy configured; older hub deployments omit the field entirely.
- Cached for ~30s via `Cache-Control: public, max-age=30, stale-while-revalidate=60`.
- Rate-limited per IP (60 requests / 15 minutes).

## Development

```sh
npm install
npm test
npm run build
```

Publish a new version by tagging:

```sh
npm version patch  # or minor / major
git push --follow-tags
```

The `publish.yml` workflow handles the GitHub Packages upload.
