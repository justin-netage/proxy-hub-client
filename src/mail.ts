import type {
  CreateMailClientOptions,
  MailClient,
  SendMailInput,
  SendMailResult,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 15_000;

function resolveMailUrl(opts: CreateMailClientOptions): string {
  if (opts.mailUrl) return opts.mailUrl;
  if (opts.bootstrapUrl) {
    // Derive the mail URL from the bootstrap URL by swapping the path.
    // This lets a caller configure a single `bootstrapUrl` and have the
    // mail route follow automatically — the hub mounts both at the same
    // origin (the customer's own hostname).
    if (opts.bootstrapUrl.includes('/api/bootstrap')) {
      return opts.bootstrapUrl.replace('/api/bootstrap', '/api/mail/send');
    }
    // Fall back to appending if bootstrapUrl doesn't include the
    // expected path (e.g. someone passed a bare origin).
    const trimmed = opts.bootstrapUrl.replace(/\/+$/, '');
    return `${trimmed}/api/mail/send`;
  }
  if (typeof window === 'undefined' || !window.location) {
    throw new Error(
      '[supabase-proxy-client] No window.location available. ' +
        'Pass options.mailUrl or options.bootstrapUrl when running outside a browser.'
    );
  }
  return `${window.location.origin}/api/mail/send`;
}

function parseErrorBody(body: unknown): string {
  if (body && typeof body === 'object') {
    const v = body as Record<string, unknown>;
    if (typeof v.error === 'string') return v.error;
    if (typeof v.message === 'string') return v.message;
  }
  return 'Unknown error';
}

export function createMailClient(
  options: CreateMailClientOptions = {}
): MailClient {
  const fetchImpl =
    options.fetch ?? (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchImpl) {
    throw new Error(
      '[supabase-proxy-client] No fetch implementation available. ' +
        'Pass options.fetch or run in an environment with a global fetch.'
    );
  }
  const mailUrl = resolveMailUrl(options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async sendMail(input: SendMailInput): Promise<SendMailResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(mailUrl, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          signal: controller.signal,
        });
        let body: unknown = null;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          body = await res.json().catch(() => null);
        }
        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            error: parseErrorBody(body) + ` (HTTP ${res.status})`,
          };
        }
        const ok =
          body && typeof body === 'object' && (body as { ok?: unknown }).ok;
        if (!ok) {
          return {
            ok: false,
            status: res.status,
            error: parseErrorBody(body),
          };
        }
        const messageId = (body as { messageId?: unknown }).messageId;
        return {
          ok: true,
          messageId: typeof messageId === 'string' ? messageId : undefined,
        };
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          return {
            ok: false,
            error: `Mail send timed out after ${timeoutMs}ms`,
          };
        }
        return {
          ok: false,
          error: (err as Error)?.message || String(err),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
