import { describe, expect, it } from "vitest";
import { createStorageRequestHeaders, getMediaResponseHeaders } from "./storageProxy";

describe("storage media proxy helpers", () => {
  it("forwards a browser Range header to the storage provider", () => {
    expect(createStorageRequestHeaders("bytes=0-1023")).toEqual({ Range: "bytes=0-1023" });
    expect(createStorageRequestHeaders()).toEqual({});
  });

  it("keeps the media headers required for seeking and decoding", () => {
    const headers = new Headers({
      "Content-Type": "video/mp4",
      "Content-Length": "1024",
      "Content-Range": "bytes 0-1023/4096",
      "Accept-Ranges": "bytes",
    });

    expect(getMediaResponseHeaders(headers)).toMatchObject({
      "content-type": "video/mp4",
      "content-length": "1024",
      "content-range": "bytes 0-1023/4096",
      "accept-ranges": "bytes",
    });
  });
});
