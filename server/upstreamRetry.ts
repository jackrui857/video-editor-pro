const TRANSIENT_UPSTREAM_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export function isTransientUpstreamStatus(status: number): boolean {
  return TRANSIENT_UPSTREAM_STATUS_CODES.has(status);
}

function getRetryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? undefined : Math.max(0, retryAt - Date.now());
}

function backoffDelay(attempt: number, baseDelayMs: number, retryAfterMs?: number): number {
  const exponential = Math.min(baseDelayMs * 2 ** attempt, 4_000);
  return Math.min(Math.max(exponential, retryAfterMs ?? 0), 4_000);
}

/**
 * Retries only temporary gateway/upstream failures. Callers still receive the
 * final Response for their existing status-specific validation and messaging.
 */
export async function fetchWithUpstreamRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 350;
  const sleep = options.sleep ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok || !isTransientUpstreamStatus(response.status) || attempt === maxRetries) return response;

      const retryAfterMs = getRetryAfterMilliseconds(response.headers.get("retry-after"));
      await response.body?.cancel().catch(() => undefined);
      await sleep(backoffDelay(attempt, baseDelayMs, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) throw error;
      await sleep(backoffDelay(attempt, baseDelayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("上游服務重試後仍無法使用。");
}
