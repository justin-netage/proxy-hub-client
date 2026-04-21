import { describe, it, expect, vi } from 'vitest';
import { createMailClient } from '../src/mail.js';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
}

describe('createMailClient', () => {
  it('derives the mail URL from a bootstrapUrl', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, messageId: 'msg-1' })
    );
    const mail = createMailClient({
      bootstrapUrl: 'https://afhco.gogee.ai/api/bootstrap',
      fetch: fetchSpy as unknown as typeof fetch,
    });
    const result = await mail.sendMail({ subject: 'hi', html: '<p>hi</p>' });
    expect(result).toEqual({ ok: true, messageId: 'msg-1' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://afhco.gogee.ai/api/mail/send',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('honors an explicit mailUrl over bootstrapUrl', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true })
    );
    const mail = createMailClient({
      bootstrapUrl: 'https://afhco.gogee.ai/api/bootstrap',
      mailUrl: 'https://override.example.com/send',
      fetch: fetchSpy as unknown as typeof fetch,
    });
    await mail.sendMail({ subject: 's', html: 'h' });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://override.example.com/send'
    );
  });

  it('serializes the input as the JSON request body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const mail = createMailClient({
      bootstrapUrl: 'https://afhco.gogee.ai/api/bootstrap',
      fetch: fetchSpy as unknown as typeof fetch,
    });
    await mail.sendMail({
      subject: 'Test',
      html: '<p>body</p>',
      to: 'someone@example.com',
      replyTo: 'reply@example.com',
      formType: 'contact',
      pageUrl: '/contact',
    });
    const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
    expect(body).toEqual({
      subject: 'Test',
      html: '<p>body</p>',
      to: 'someone@example.com',
      replyTo: 'reply@example.com',
      formType: 'contact',
      pageUrl: '/contact',
    });
    // The hub pins the from address — the client must never send one.
    expect(body.from).toBeUndefined();
  });

  it('returns ok:false with the server error message on a non-2xx', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Recipient not in allowlist' }, { status: 400 })
    );
    const mail = createMailClient({
      bootstrapUrl: 'https://afhco.gogee.ai/api/bootstrap',
      fetch: fetchSpy as unknown as typeof fetch,
    });
    const result = await mail.sendMail({ subject: 's', html: 'h' });
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Recipient not in allowlist (HTTP 400)',
    });
  });

  it('returns ok:false when the server returns 200 but ok:false', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse({ ok: false, error: 'Mail disabled for site' })
    );
    const mail = createMailClient({
      bootstrapUrl: 'https://afhco.gogee.ai/api/bootstrap',
      fetch: fetchSpy as unknown as typeof fetch,
    });
    const result = await mail.sendMail({ subject: 's', html: 'h' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Mail disabled for site');
    }
  });

  it('aborts and returns a timeout error after timeoutMs', async () => {
    // Resolve only after the abort fires, so the test exercises the
    // AbortError path rather than racing against a real network.
    const fetchSpy = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );
    const mail = createMailClient({
      bootstrapUrl: 'https://afhco.gogee.ai/api/bootstrap',
      fetch: fetchSpy as unknown as typeof fetch,
      timeoutMs: 10,
    });
    const result = await mail.sendMail({ subject: 's', html: 'h' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/timed out after 10ms/);
    }
  });

  it('throws synchronously when no bootstrapUrl/mailUrl and no window', () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = undefined;
    try {
      expect(() =>
        createMailClient({
          fetch: vi.fn() as unknown as typeof fetch,
        })
      ).toThrow(/No window\.location available/);
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});
