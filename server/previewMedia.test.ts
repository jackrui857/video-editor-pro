import { describe, expect, it } from "vitest";
import { getPreviewSource, getVideoPlaybackErrorMessage } from "../shared/previewMedia";

describe("preview media behavior", () => {
  it("prefers the local blob source immediately after upload", () => {
    expect(getPreviewSource("/manus-storage/videos/cloud.mp4", "blob:https://clipflow.local/preview")).toBe("blob:https://clipflow.local/preview");
  });

  it("uses the durable cloud source when a local preview is unavailable", () => {
    expect(getPreviewSource("/manus-storage/videos/cloud.mp4")).toBe("/manus-storage/videos/cloud.mp4");
  });

  it("gives a codec-specific message for unsupported video sources", () => {
    expect(getVideoPlaybackErrorMessage(4)).toContain("H.264/AAC");
    expect(getVideoPlaybackErrorMessage(2)).toContain("預覽影片載入失敗");
  });
});
