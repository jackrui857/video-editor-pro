import { describe, expect, it } from "vitest";
import { DEFAULT_SUBTITLE_POSITION, getSubtitleAssPosition, getSubtitlePreviewPosition } from "../shared/subtitlePosition";

describe("字幕預覽與輸出座標", () => {
  it("對舊版未儲存座標的字幕使用底部置中後備位置", () => {
    expect(getSubtitlePreviewPosition({})).toEqual(DEFAULT_SUBTITLE_POSITION);
    expect(getSubtitleAssPosition({}, 1920, 1080)).toBe("\\an5\\pos(960,929)");
  });

  it("將拖曳後座標限制在畫面範圍並轉為相對應的ASS位置", () => {
    expect(getSubtitlePreviewPosition({ x: -10, y: 120 })).toEqual({ x: 0, y: 100 });
    expect(getSubtitleAssPosition({ x: 25, y: 72 }, 1080, 1920)).toBe("\\an5\\pos(270,1382)");
  });
});
