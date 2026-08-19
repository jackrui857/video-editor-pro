import { describe, expect, it, vi } from "vitest";
import { fetchWithUpstreamRetry } from "./upstreamRetry";

describe("fetchWithUpstreamRetry", () => {
  it("retries temporary 503 responses and returns the first successful response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithUpstreamRetry("https://service.example/test", undefined, { sleep });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it("does not retry a permanent 400 response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Bad Request", { status: 400 }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithUpstreamRetry("https://service.example/test", undefined, { sleep });

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("retries a transient network failure before succeeding", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchWithUpstreamRetry("https://service.example/test", undefined, { sleep: vi.fn().mockResolvedValue(undefined) });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});
