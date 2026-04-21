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
   * Override where sendMail() POSTs. Defaults to deriving from
   * `bootstrapUrl` (replacing `/api/bootstrap` with `/api/mail/send`),
   * or `${window.location.origin}/api/mail/send` if neither is set.
   * The hub looks the site up by Host header, so this URL must point
   * at the same origin a user would see the site on.
   */
  mailUrl?: string;
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
  /**
   * Mail sender pointed at the hub's /api/mail/send route for this site.
   * The hub identifies the site by Host header and enforces the
   * configured from-address, recipient allowlist, and rate limits — the
   * caller only supplies the subject/html and optional recipient.
   */
  mail: MailClient;
  /** The bootstrap config used to construct the client. */
  config: BootstrapConfig;
}

/**
 * Body of a sendMail() call. The hub pins the from-address per-site, so
 * the caller never controls it. `to` is optional — if omitted, the hub
 * routes to the site's configured default recipient.
 */
export interface SendMailInput {
  subject: string;
  html: string;
  text?: string;
  to?: string;
  replyTo?: string;
  /**
   * Free-form tag identifying which form on the site triggered the
   * send. The hub validates it against the site's allowlist and stores
   * it in mail_log for deliverability auditing.
   */
  formType?: string;
  /** Path the form was submitted from. Stored in mail_log for context. */
  pageUrl?: string;
}

export type SendMailResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string; status?: number };

export interface MailClient {
  sendMail(input: SendMailInput): Promise<SendMailResult>;
}

export interface CreateMailClientOptions {
  /**
   * URL of the hub's /api/mail/send endpoint. If omitted, derived from
   * `bootstrapUrl` by replacing `/api/bootstrap` with `/api/mail/send`,
   * or falls back to `${window.location.origin}/api/mail/send`.
   */
  mailUrl?: string;
  /** Used only for URL derivation when `mailUrl` isn't given. */
  bootstrapUrl?: string;
  /** Inject a fetch implementation. Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /**
   * Per-request timeout in milliseconds. Defaults to 15000. The bootstrap
   * fetch has no timeout because it can fall back to a dev config — but
   * sendMail is a write path with no fallback, so a hung connection has
   * to surface as an error rather than freezing form submission.
   */
  timeoutMs?: number;
}
