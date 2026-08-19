import { describe, expect, it } from "vitest";
import {
  ApiResponseError,
  assertJsonApiResponse,
  createSafeApiFetch,
  parseApiJson,
  shouldRetryApiRequest,
} from "../client/src/lib/safeApiResponse";

describe("safe API response parsing", () => {
  it("maps a plain-text Service Unavailable response to an actionable error", async () => {
    const response = new Response("Service Unavailable", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "content-type": "text/plain" },
    });

    await expect(assertJsonApiResponse(response)).rejects.toThrow(
      "服務暫時不可用，請稍候後再試一次。",
    );
  });

  it("does not block a valid JSON API error response", async () => {
    const response = new Response(JSON.stringify({ error: { message: "render failed" } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });

    await expect(assertJsonApiResponse(response)).resolves.toBe(response);
  });

  it("safely consumes direct media API JSON and rejects a 503 text body", async () => {
    const success = new Response(JSON.stringify({ publicUrl: "/manus-storage/video.mp4" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const unavailable = new Response("Service Unavailable", {
      status: 503,
      headers: { "content-type": "text/plain" },
    });

    await expect(parseApiJson<{ publicUrl: string }>(success)).resolves.toEqual({
      publicUrl: "/manus-storage/video.mp4",
    });
    await expect(parseApiJson(unavailable)).rejects.toThrow("服務暫時不可用");
  });

  it("checks fetched responses before a JSON client receives them", async () => {
    const safeFetch = createSafeApiFetch(async () =>
      new Response("Service Unavailable", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(safeFetch("/api/trpc")).rejects.toThrow("服務暫時不可用");
  });

  it.each([502, 503, 504])("retries transient gateway status %i at most twice", status => {
    const error = new ApiResponseError(status, "Gateway failure", "Service Unavailable");

    expect(shouldRetryApiRequest(0, error)).toBe(true);
    expect(shouldRetryApiRequest(1, error)).toBe(true);
    expect(shouldRetryApiRequest(2, error)).toBe(false);
  });
});
