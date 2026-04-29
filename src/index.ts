import { createClient } from '@supabase/supabase-js';
import { fetchBootstrap, _resetBootstrapCache } from './bootstrap.js';
import { createProxyUrl } from './proxyUrl.js';
import { createMailClient } from './mail.js';
import type {
  BootstrapConfig,
  InitOptions,
  InitResult,
} from './types.js';

export type {
  BootstrapConfig,
  InitOptions,
  InitResult,
  SendMailInput,
  SendMailResult,
  MailClient,
  CreateMailClientOptions,
} from './types.js';
export { createProxyUrl } from './proxyUrl.js';
export { fetchBootstrap, _resetBootstrapCache } from './bootstrap.js';
export { createMailClient } from './mail.js';

function defaultStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    // Some browsing modes (Safari private, embedded iframes with strict
    // partitioning) throw on localStorage access. Fall back to in-memory.
    return undefined;
  }
}

function buildClient(
  config: BootstrapConfig,
  clientOptions?: InitOptions['clientOptions']
) {
  const storage = defaultStorage();
  const inBrowser = typeof window !== 'undefined';
  const client = createClient(config.proxyDomain, config.anonKey, {
    auth: {
      persistSession: inBrowser,
      autoRefreshToken: inBrowser,
      ...(storage ? { storage } : {}),
      ...(clientOptions?.auth ?? {}),
    },
    ...clientOptions,
  });

  // Repoint supabase.functions at the Functions proxy domain when one is
  // configured. supabase-js derives its FunctionsClient URL from
  // supabaseUrl (`<supabaseUrl>/functions/v1`), so without this override
  // functions.invoke() would hit the data proxy instead of the Functions
  // proxy. We overwrite the url on the already-constructed instance —
  // FunctionsClient's `url` is `protected` in the type declarations but
  // remains a normal mutable string at runtime, and supabase-js's auth-
  // refresh flow only calls setAuth() on the same instance (doesn't
  // recreate it), so the URL override survives session changes.
  // Headers (apikey + Authorization) were already populated from
  // createClient(); webhook callers (Netcash etc.) hit the proxy URL
  // directly without going through this client at all.
  if (config.functionsDomain) {
    (client.functions as unknown as { url: string }).url = config.functionsDomain;
  }

  return client;
}

/**
 * Async entrypoint. Fetches bootstrap config from the proxy hub and
 * returns a fully configured Supabase client + proxyUrl helper +
 * mail client.
 *
 * Use with top-level await:
 * ```ts
 * export const { supabase, proxyUrl, mail } = await initProxiedSupabase({
 *   dev: { projectRef: 'abc', proxyDomain: 'http://localhost:54321', anonKey: '...' },
 * });
 * ```
 */
export async function initProxiedSupabase(
  options: InitOptions = {}
): Promise<InitResult> {
  const config = await fetchBootstrap(options);
  return {
    supabase: buildClient(config, options.clientOptions),
    proxyUrl: createProxyUrl(config),
    mail: createMailClient({
      bootstrapUrl: options.bootstrapUrl,
      mailUrl: options.mailUrl,
      fetch: options.fetch,
    }),
    config,
  };
}

/**
 * Synchronous variant for callers that already know the proxy config
 * (tests, SSR, or hardcoded "Pattern A" deployments). Skips the bootstrap
 * fetch entirely.
 *
 * For mail to work, callers should pass a `mailUrl` (or rely on
 * `window.location.origin/api/mail/send`).
 */
export function createProxiedSupabase(
  config: BootstrapConfig,
  clientOptions?: InitOptions['clientOptions'],
  mailOptions?: { mailUrl?: string; fetch?: typeof fetch }
): InitResult {
  return {
    supabase: buildClient(config, clientOptions),
    proxyUrl: createProxyUrl(config),
    mail: createMailClient({
      mailUrl: mailOptions?.mailUrl,
      fetch: mailOptions?.fetch,
    }),
    config,
  };
}
