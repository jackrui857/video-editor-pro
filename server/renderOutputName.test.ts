import { describe, expect, it } from "vitest";
import { buildRenderFilename, buildRenderStorageKey } from "../shared/renderOutputName";

describe("render output naming", () => {
  it("converts a Chinese-only project title to an ASCII-safe fallback filename", () => {
    const filename = buildRenderFilename("我的影片專案", "9:16", "1080p");

    expect(filename).toBe("clipflow-9x16-1080p.mp4");
    expect(/^[\x20-\x7E]+$/.test(filename)).toBe(true);
  });

  it("normalizes accented and punctuation-heavy project titles in the storage key", () => {
    const filename = buildRenderFilename("Café：夏日剪輯!", "16:9", "2160p");
    const key = buildRenderStorageKey(24, 78, filename);

    expect(filename).toBe("cafe-16x9-2160p.mp4");
    expect(key).toBe("video-editor/24/78/render-cafe-16x9-2160p.mp4");
    expect(/^[\x20-\x7E]+$/.test(key)).toBe(true);
  });
});
