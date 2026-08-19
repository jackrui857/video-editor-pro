import { describe, expect, it } from "vitest";
import type { TimelineClip } from "../shared/editorTypes";
import { alignSubtitlesToClip } from "../shared/subtitleTimeline";

const clip: TimelineClip = {
  id: "clip-1", label: "sample", sourceUrl: "https://example.com/video.mp4", assetId: 1,
  startMs: 12_000, endMs: 18_000, trimStartMs: 4_000, trimEndMs: 10_000, transition: "none",
};

describe("Whisper字幕時間軸對齊", () => {
  it("將來源時間戳對齊到片段起點並保留預設預覽位置", () => {
    const result = alignSubtitlesToClip([{ id: "cue", startMs: 4_500, endMs: 6_000, text: "辨識字幕" }], clip);
    expect(result).toEqual([{ id: "cue", startMs: 12_500, endMs: 14_000, text: "辨識字幕", x: 50, y: 86 }]);
  });

  it("裁切掉落在可見片段外的字幕區段", () => {
    const result = alignSubtitlesToClip([{ id: "cue", startMs: 2_000, endMs: 4_600, text: "片段開頭" }], clip);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ startMs: 12_000, endMs: 12_600 });
  });
});
