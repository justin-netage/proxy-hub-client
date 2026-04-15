import type { BootstrapConfig } from './types.js';

/**
 * Build a render-time URL rewriter for a given proxy config.
 *
 * Rewrites any URL of the form `https://<projectRef>.supabase.co/<rest>`
 * into `<proxyDomain>/<rest>`. Useful for legacy database rows that store
 * the original Supabase storage URL — you can wrap them in `proxyUrl()`
 * at render time without backfilling the table.
 *
 * Falsy inputs (null/undefined/'') return ''.
 * Non-matching URLs pass through unchanged.
 * If `projectRef` is empty (self-hosted Supabase), the rewriter is a no-op.
 */
export function createProxyUrl(config: BootstrapConfig) {
  const trimmedDomain = config.proxyDomain.replace(/\/+$/, '');
  const supabaseHost = config.projectRef
    ? `https://${config.projectRef}.supabase.co`
    : null;

  return function proxyUrl(url: string | null | undefined): string {
    if (!url) return '';
    if (!supabaseHost) return url;
    if (url.startsWith(supabaseHost)) {
      return trimmedDomain + url.slice(supabaseHost.length);
    }
    return url;
  };
}
