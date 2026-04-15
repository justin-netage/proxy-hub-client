import type { BootstrapConfig, InitOptions } from './types.js';

// Module-scoped memoization: concurrent callers (e.g. multiple top-level
// awaits across modules during app startup) share a single in-flight
// request. We rely on the server's Cache-Control headers for any longer-
// lived caching — no localStorage, no IndexedDB.
let inflight: Promise<BootstrapConfig> | null = null;

function defaultBootstrapUrl(): string {
  if (typeof window === 'undefined' || !window.location) {
    throw new Error(
      '[supabase-proxy-client] No window.location available. ' +
        'Pass options.bootstrapUrl or options.dev when running outside a browser.'
    );
  }
  return `${window.location.origin}/api/bootstrap`;
}

function isValidConfig(value: unknown): value is BootstrapConfig {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.projectRef === 'string' &&
    typeof v.proxyDomain === 'string' &&
    typeof v.anonKey === 'string' &&
    v.proxyDomain.length > 0 &&
    v.anonKey.length > 0
  );
}

export async function fetchBootstrap(
  options: InitOptions = {}
): Promise<BootstrapConfig> {
  if (inflight) return inflight;

  const fetchImpl =
    options.fetch ?? (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchImpl) {
    throw new Error(
      '[supabase-proxy-client] No fetch implementation available. ' +
        'Pass options.fetch or run in an environment with a global fetch.'
    );
  }

  const url = options.bootstrapUrl ?? defaultBootstrapUrl();

  const promise = (async () => {
    try {
      const res = await fetchImpl(url, { credentials: 'omit' });
      if (!res.ok) {
        throw new Error(
          `Bootstrap fetch failed: ${res.status} ${res.statusText}`
        );
      }
      const body = (await res.json()) as unknown;
      if (!isValidConfig(body)) {
        throw new Error(
          'Bootstrap response is missing required fields (projectRef, proxyDomain, anonKey)'
        );
      }
      return body;
    } catch (err) {
      if (options.dev && isValidConfig(options.dev)) {
        // eslint-disable-next-line no-console
        console.warn(
          '[supabase-proxy-client] Bootstrap fetch failed, using dev fallback config:',
          err
        );
        return options.dev;
      }
      throw err;
    }
  })();

  inflight = promise;
  try {
    return await promise;
  } catch (err) {
    // Don't poison the cache with a rejected promise — a future call
    // (e.g. after a network blip) should be allowed to retry.
    inflight = null;
    throw err;
  }
}

/** Test-only hook to reset the memoized bootstrap promise. */
export function _resetBootstrapCache(): void {
  inflight = null;
}
