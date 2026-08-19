import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  ApiResponseError,
  shouldRetryApiRequest,
} from "../client/src/lib/safeApiResponse";
import { invokeRetryAction } from "../shared/retryAction";

describe("transient API failure recovery", () => {
  it.each([502, 503, 504])("reissues a QueryClient request after HTTP %i and restores data", async status => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: shouldRetryApiRequest, retryDelay: 0 },
      },
    });
    let attempts = 0;

    const data = await client.fetchQuery({
      queryKey: ["recovery", status],
      queryFn: async () => {
        attempts += 1;
        if (attempts < 3) throw new ApiResponseError(status, "Gateway error", "Service Unavailable");
        return { status: "ready" };
      },
    });

    expect(attempts).toBe(3);
    expect(data).toEqual({ status: "ready" });
    expect(client.getQueryData(["recovery", status])).toEqual({ status: "ready" });
    client.clear();
  });

  it("runs the selected manual retry action for captioning and rendering", async () => {
    const calls: string[] = [];
    const handlers = {
      captions: async () => { calls.push("captions"); },
      render: async () => { calls.push("render"); },
    };

    await expect(invokeRetryAction("captions", handlers)).resolves.toBe(true);
    await expect(invokeRetryAction("render", handlers)).resolves.toBe(true);
    await expect(invokeRetryAction(null, handlers)).resolves.toBe(false);
    expect(calls).toEqual(["captions", "render"]);
  });
});
