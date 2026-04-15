import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';

/**
 * Per-site config returned by the proxy hub's GET /api/bootstrap endpoint.
 * All three values are public-by-design.
 */
export interface BootstrapConfig {
  /**
   * The customer's Supabase project ref (subdomain of supabase.co), or
   * an empty string for self-hosted Supabase. Used by `proxyUrl()` to
   * rewrite URLs that point at the original Supabase host.
   */
  projectRef: string;
  /**
   * Fully-qualified proxy origin, e.g. "https://data-afhco.gogee.ai".
   * Passed to createClient() as the Supabase URL so all client traffic
   * flows through the proxy.
   */
  proxyDomain: string;
  /** Supabase anon key. Public; safe to ship to the browser. */
  anonKey: string;
}

export interface InitOptions {
  /**
   * Override where bootstrap is fetched from. Defaults to
   * `${window.location.origin}/api/bootstrap`. Required when running
   * outside a browser unless `dev` is provided.
   */
  bootstrapUrl?: string;
  /**
   * Inline config used when the bootstrap fetch throws (typically
   * localhost dev where the proxy hub isn't reachable). Production
   * always prefers the network response.
   */
  dev?: BootstrapConfig;
  /**
   * Forwarded to `createClient(_, _, options)`. Anything you set here
   * wins over the package's defaults except `auth.storage`, which is
   * preserved if you don't override it.
   */
  clientOptions?: SupabaseClientOptions<'public'>;
  /**
   * Inject a fetch implementation. Defaults to the global `fetch`. Used
   * primarily by tests; production callers shouldn't need this.
   */
  fetch?: typeof fetch;
}

export interface InitResult {
  /** Configured Supabase client pointed at the proxy. */
  supabase: SupabaseClient;
  /**
   * Render-time URL rewriter. Use it on any URL that may have been
   * stored in the database with the original Supabase host (e.g. public
   * storage URLs returned by `getPublicUrl()` and persisted to a row).
   */
  proxyUrl: (url: string | null | undefined) => string;
  /** The bootstrap config used to construct the client. */
  config: BootstrapConfig;
}
