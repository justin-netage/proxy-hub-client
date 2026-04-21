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
  return createClient(config.proxyDomain, config.anonKey, {
    auth: {
      persistSession: inBrowser,
      autoRefreshToken: inBrowser,
      ...(storage ? { storage } : {}),
      ...(clientOptions?.auth ?? {}),
    },
    ...clientOptions,
  });
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
