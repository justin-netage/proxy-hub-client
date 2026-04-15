import { createClient } from '@supabase/supabase-js';
import { fetchBootstrap, _resetBootstrapCache } from './bootstrap.js';
import { createProxyUrl } from './proxyUrl.js';
import type {
  BootstrapConfig,
  InitOptions,
  InitResult,
} from './types.js';

export type { BootstrapConfig, InitOptions, InitResult } from './types.js';
export { createProxyUrl } from './proxyUrl.js';
export { fetchBootstrap, _resetBootstrapCache } from './bootstrap.js';

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
 * returns a fully configured Supabase client + proxyUrl helper.
 *
 * Use with top-level await:
 * ```ts
 * export const { supabase, proxyUrl } = await initProxiedSupabase({
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
    config,
  };
}

/**
 * Synchronous variant for callers that already know the proxy config
 * (tests, SSR, or hardcoded "Pattern A" deployments). Skips the bootstrap
 * fetch entirely.
 */
export function createProxiedSupabase(
  config: BootstrapConfig,
  clientOptions?: InitOptions['clientOptions']
): InitResult {
  return {
    supabase: buildClient(config, clientOptions),
    proxyUrl: createProxyUrl(config),
    config,
  };
}
