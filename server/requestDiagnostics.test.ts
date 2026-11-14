import { describe, expect, it, vi } from "vitest";
import { logApiRequest } from "./_core/requestDiagnostics";

describe("logApiRequest", () => {
  it("records API path and status when the response finishes", () => {
    const listeners: Record<string, () => void> = {};
    const request = { path: "/api/trpc/auth.me", method: "GET", originalUrl: "/api/trpc/auth.me" } as never;
    const response = { statusCode: 503, on: vi.fn((event: string, handler: () => void) => { listeners[event] = handler; }) } as never;
    const next = vi.fn();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logApiRequest(request, response, next);
    listeners.finish?.();

    expect(next).toHaveBeenCalledOnce();
    expect(response.on).toHaveBeenCalledWith("finish", expect.any(Function));
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/\[API\] GET \/api\/trpc\/auth\.me -> 503/));
    info.mockRestore();
  });

  it("does not attach logging for non-API assets", () => {
    const response = { on: vi.fn() } as never;
    const next = vi.fn();
    logApiRequest({ path: "/", method: "GET", originalUrl: "/" } as never, response, next);
    expect(response.on).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});
