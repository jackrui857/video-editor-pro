import { describe, expect, it } from "vitest";
import { buildAss, FFMPEG_RENDER_PRESET } from "./mediaProcessing";
import type { EditorState } from "../shared/editorTypes";

const state: EditorState = {
  clips: [],
  textLayers: [],
  subtitles: [{ id: "sub-1", startMs: 0, endMs: 1_800, text: "可移動字幕", x: 25, y: 72 }],
  color: { exposure: 0, brightness: 0, contrast: 0, saturation: 0 },
};

describe("FFmpeg字幕ASS輸出", () => {
  it("將預覽拖曳後的字幕百分比座標寫入ASS的pos覆寫", () => {
    const ass = buildAss(state, 1080, 1920, {});
    expect(ass).toContain("{\\an5\\pos(270,1382)}可移動字幕");
  });

  it("使用快速編碼預設避免同步雲端渲染超過閘道等待時間", () => {
    expect(FFMPEG_RENDER_PRESET).toBe("ultrafast");
  });
});
