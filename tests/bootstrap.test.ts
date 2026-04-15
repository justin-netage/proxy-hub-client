import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchBootstrap, _resetBootstrapCache } from '../src/bootstrap.js';
import type { BootstrapConfig } from '../src/types.js';

const validConfig: BootstrapConfig = {
  projectRef: 'abc123',
  proxyDomain: 'https://data-afhco.gogee.ai',
  anonKey: 'anon-key',
};

beforeEach(() => {
  _resetBootstrapCache();
});

describe('fetchBootstrap', () => {
  it('returns the parsed bootstrap response', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validConfig), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const config = await fetchBootstrap({
      bootstrapUrl: 'https://example.com/api/bootstrap',
      fetch: fakeFetch as unknown as typeof fetch,
    });
    expect(config).toEqual(validConfig);
    expect(fakeFetch).toHaveBeenCalledWith(
      'https://example.com/api/bootstrap',
      { credentials: 'omit' }
    );
  });

  it('memoizes concurrent calls into a single fetch', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validConfig), { status: 200 })
    );
    const [a, b] = await Promise.all([
      fetchBootstrap({ bootstrapUrl: 'x', fetch: fakeFetch as unknown as typeof fetch }),
      fetchBootstrap({ bootstrapUrl: 'x', fetch: fakeFetch as unknown as typeof fetch }),
    ]);
    expect(a).toEqual(validConfig);
    expect(b).toEqual(validConfig);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('throws on non-2xx response when no dev fallback is provided', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 404, statusText: 'Not Found' })
    );
    await expect(
      fetchBootstrap({
        bootstrapUrl: 'x',
        fetch: fakeFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(/Bootstrap fetch failed: 404/);
  });

  it('falls back to dev config on network error', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('network down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = await fetchBootstrap({
      bootstrapUrl: 'x',
      dev: validConfig,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    expect(config).toEqual(validConfig);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rejects malformed bootstrap responses', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ projectRef: 'abc' }), { status: 200 })
    );
    await expect(
      fetchBootstrap({
        bootstrapUrl: 'x',
        fetch: fakeFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(/missing required fields/);
  });

  it('clears cache on rejection so next call can retry', async () => {
    const fakeFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validConfig), { status: 200 })
      );

    await expect(
      fetchBootstrap({
        bootstrapUrl: 'x',
        fetch: fakeFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(/first failure/);

    const config = await fetchBootstrap({
      bootstrapUrl: 'x',
      fetch: fakeFetch as unknown as typeof fetch,
    });
    expect(config).toEqual(validConfig);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });
});
