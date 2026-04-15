import { describe, it, expect } from 'vitest';
import { createProxyUrl } from '../src/proxyUrl.js';
import type { BootstrapConfig } from '../src/types.js';

const config: BootstrapConfig = {
  projectRef: 'abc123',
  proxyDomain: 'https://data-afhco.gogee.ai',
  anonKey: 'anon',
};

describe('createProxyUrl', () => {
  const proxyUrl = createProxyUrl(config);

  it('rewrites a full storage URL', () => {
    expect(
      proxyUrl('https://abc123.supabase.co/storage/v1/object/public/img/x.png')
    ).toBe(
      'https://data-afhco.gogee.ai/storage/v1/object/public/img/x.png'
    );
  });

  it('rewrites the bare host with no path', () => {
    expect(proxyUrl('https://abc123.supabase.co')).toBe(
      'https://data-afhco.gogee.ai'
    );
  });

  it('strips trailing slashes from proxyDomain', () => {
    const p = createProxyUrl({ ...config, proxyDomain: 'https://x.com///' });
    expect(p('https://abc123.supabase.co/foo')).toBe('https://x.com/foo');
  });

  it('passes through URLs that target a different project ref', () => {
    expect(proxyUrl('https://other.supabase.co/x')).toBe(
      'https://other.supabase.co/x'
    );
  });

  it('passes through unrelated URLs', () => {
    expect(proxyUrl('https://example.com/y')).toBe('https://example.com/y');
    expect(proxyUrl('/relative/path')).toBe('/relative/path');
  });

  it('returns empty string for falsy input', () => {
    expect(proxyUrl(null)).toBe('');
    expect(proxyUrl(undefined)).toBe('');
    expect(proxyUrl('')).toBe('');
  });

  it('is a no-op when projectRef is empty (self-hosted Supabase)', () => {
    const p = createProxyUrl({ ...config, projectRef: '' });
    expect(p('https://abc123.supabase.co/x')).toBe(
      'https://abc123.supabase.co/x'
    );
    expect(p('https://anything.com/y')).toBe('https://anything.com/y');
  });
});
