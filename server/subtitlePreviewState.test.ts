import { describe, expect, it } from "vitest";
import type { SubtitleCue } from "../shared/editorTypes";
import { getSubtitlePreviewStyle, getVisibleSubtitles, updateSubtitleTiming } from "../shared/subtitlePreviewState";

const cue: SubtitleCue = { id: "preview-cue", startMs: 1_000, endMs: 2_000, text: "預覽字幕", x: 25, y: 72 };

describe("字幕預覽狀態", () => {
  it("僅在播放時間落於字幕區間時顯示字幕，並套用拖曳後的位置", () => {
    expect(getVisibleSubtitles([cue], 999)).toEqual([]);
    expect(getVisibleSubtitles([cue], 1_500)).toEqual([cue]);
    expect(getSubtitlePreviewStyle(cue)).toEqual({ left: "25%", top: "72%" });
  });

  it("直接編輯時間時維持非負開始時間與至少100毫秒的有效區間", () => {
    expect(updateSubtitleTiming(cue, { startMs: -20, endMs: 0 })).toMatchObject({ startMs: 0, endMs: 100 });
    expect(updateSubtitleTiming(cue, { startMs: 1_800, endMs: 1_700 })).toMatchObject({ startMs: 1_800, endMs: 1_900 });
  });
});
