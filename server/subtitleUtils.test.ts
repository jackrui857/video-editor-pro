import { describe, expect, it } from "vitest";
import { generateSrt, formatSrtTimestamp } from "./subtitleUtils";

describe("subtitleUtils", () => {
  it("formats positive and negative millisecond values for SRT", () => {
    expect(formatSrtTimestamp(3_723_045)).toBe("01:02:03,045");
    expect(formatSrtTimestamp(-25)).toBe("00:00:00,000");
  });

  it("sorts valid subtitle cues and omits invalid content", () => {
    const srt = generateSrt([
      { id: "late", startMs: 3_000, endMs: 4_100, text: "第二句" },
      { id: "empty", startMs: 100, endMs: 200, text: "  " },
      { id: "first", startMs: 1_000, endMs: 2_500, text: "第一句" },
    ]);

    expect(srt).toBe("1\n00:00:01,000 --> 00:00:02,500\n第一句\n\n2\n00:00:03,000 --> 00:00:04,100\n第二句\n");
  });
});
