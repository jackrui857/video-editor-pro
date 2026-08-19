import { describe, expect, it } from "vitest";
import { getPreviewPosition } from "../shared/previewPosition";

describe("preview text position", () => {
  const bounds = { left: 100, top: 200, width: 800, height: 400 };

  it("converts pointer coordinates into preview percentages", () => {
    expect(getPreviewPosition(500, 300, bounds)).toEqual({ x: 50, y: 25 });
  });

  it("keeps dragged text inside the visible preview range", () => {
    expect(getPreviewPosition(-20, 900, bounds)).toEqual({ x: 0, y: 100 });
    expect(getPreviewPosition(2_000, -10, bounds)).toEqual({ x: 100, y: 0 });
  });
});
