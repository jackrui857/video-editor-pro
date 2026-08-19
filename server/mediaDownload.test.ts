import { describe, expect, it, vi } from "vitest";
import { downloadMediaBytes } from "./mediaProcessing";

describe("downloadMediaBytes", () => {
  it("recovers from a temporary media storage failure before returning source bytes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-length": "3", "content-type": "video/mp4" },
      }));

    const bytes = await downloadMediaBytes("https://storage.example/source.mp4");

    expect([...bytes]).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});
