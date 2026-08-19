import { describe, expect, it, vi } from "vitest";
import { getRetryButtonLabel, invokeRetryAction } from "../shared/retryAction";

describe("字幕與影片輸出的手動重試控制", () => {
  it("只會在可重試動作存在時顯示相對應的按鈕文案", () => {
    expect(getRetryButtonLabel(null)).toBeNull();
    expect(getRetryButtonLabel("captions")).toBe("重試辨識");
    expect(getRetryButtonLabel("render")).toBe("重新輸出");
  });

  it("點擊重試後會重新呼叫字幕辨識或影片輸出的原始動作", async () => {
    const captions = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const render = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(invokeRetryAction("captions", { captions, render })).resolves.toBe(true);
    await expect(invokeRetryAction("render", { captions, render })).resolves.toBe(true);
    await expect(invokeRetryAction(null, { captions, render })).resolves.toBe(false);

    expect(captions).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
