export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);

export class ApiResponseError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number, statusText: string, body: string) {
    super(describeApiResponseError(status, statusText, body));
    this.name = "ApiResponseError";
    this.status = status;
    this.retryable = RETRYABLE_STATUS_CODES.has(status) || body.toLowerCase().includes("service unavailable");
  }
}

function isJsonContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes("application/json");
}

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function describeApiResponseError(
  status: number,
  statusText: string,
  body: string,
): string {
  const normalizedBody = body.trim().toLowerCase();

  if (status === 503 || normalizedBody.includes("service unavailable")) {
    return "服務暫時不可用，請稍候後再試一次。若問題持續，請重新整理頁面後重試。";
  }

  if (status === 502 || status === 504) {
    return "影音服務暫時沒有回應，請稍候後重試。";
  }

  return `伺服器回應無法處理（HTTP ${status}${statusText ? ` ${statusText}` : ""}），請稍後重試。`;
}

export function isRetryableApiError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let candidate: unknown = error;

  // tRPC can wrap a rejected fetch in a client error. Inspect its cause chain
  // and HTTP metadata so a temporary gateway response still exposes retry UI.
  while (candidate && typeof candidate === "object" && !visited.has(candidate)) {
    visited.add(candidate);
    if (candidate instanceof ApiResponseError) return candidate.retryable;

    const value = candidate as {
      status?: unknown;
      message?: unknown;
      cause?: unknown;
      data?: { httpStatus?: unknown; status?: unknown };
    };
    const status = typeof value.status === "number" ? value.status
      : typeof value.data?.httpStatus === "number" ? value.data.httpStatus
        : typeof value.data?.status === "number" ? value.data.status : undefined;
    if (status !== undefined && RETRYABLE_STATUS_CODES.has(status)) return true;
    if (typeof value.message === "string" && value.message.toLowerCase().includes("service unavailable")) return true;
    candidate = value.cause;
  }

  return false;
}

/** Queries can retry transient gateway failures twice; mutations stay user-triggered to avoid duplicate renders. */
export function shouldRetryApiRequest(failureCount: number, error: unknown): boolean {
  return isRetryableApiError(error) && failureCount < 2;
}

/**
 * tRPC 預期取得 JSON；閘道在服務暫時不可用時可能回傳純文字或HTML。
 * 在交給 tRPC 解析前先檢查，避免使用者看見「Unexpected token」例外。
 */
export async function assertJsonApiResponse(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.clone().text().catch(() => "");
  const validJson = isValidJson(body);

  // 有效的JSON錯誤回應仍交由tRPC轉換為原始的業務錯誤；成功回應也須驗證，
  // 以涵蓋閘道誤以200回傳純文字錯誤頁面的情況。
  if (isJsonContentType(contentType) && validJson) return response;

  throw new ApiResponseError(response.status, response.statusText, body);
}

/** Safely consumes a JSON API response for non-tRPC calls such as media upload. */
export async function parseApiJson<T>(response: Response): Promise<T> {
  await assertJsonApiResponse(response);
  return JSON.parse(await response.text()) as T;
}

export function createSafeApiFetch(fetchImplementation: FetchImplementation): FetchImplementation {
  return async (input, init) => {
    const response = await fetchImplementation(input, init);
    return assertJsonApiResponse(response);
  };
}
