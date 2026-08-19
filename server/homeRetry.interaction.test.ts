// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiResponseError } from "../client/src/lib/safeApiResponse";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  saveProject: vi.fn(),
  transcribe: vi.fn(),
  render: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, name: "測試使用者" },
    loading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("@/const", () => ({ startLogin: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    projects: {
      list: { useQuery: () => ({ data: [projectFixture], refetch: mocks.refetch }) },
      create: { useMutation: () => ({ mutateAsync: mocks.createProject, isPending: false }) },
      save: { useMutation: () => ({ mutateAsync: mocks.saveProject, isPending: false }) },
    },
    captions: { transcribe: { useMutation: () => ({ mutateAsync: mocks.transcribe, isPending: false }) } },
    renders: { create: { useMutation: () => ({ mutateAsync: mocks.render, isPending: false }) } },
  },
}));

const projectFixture = {
  id: 7,
  name: "Retry test",
  aspectRatio: "16:9" as const,
  outputQuality: "1080p" as const,
  editorState: JSON.stringify({
    clips: [{
      id: "clip-1", assetId: 11, label: "sample.mp4", sourceUrl: "/sample.mp4",
      startMs: 0, endMs: 5_000, trimStartMs: 0, trimEndMs: 5_000, transition: "none",
    }],
    textLayers: [], subtitles: [], color: { brightness: 0, contrast: 0, saturation: 0, exposure: 0 },
  }),
};

import Home from "../client/src/pages/Home";

function retryableError() {
  return new ApiResponseError(503, "Service Unavailable", "Service Unavailable");
}

function enabledButton(name: RegExp) {
  return screen.getAllByRole("button", { name }).find(button => !button.hasAttribute("disabled"));
}

describe("Home影音動作的手動重試", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createProject.mockResolvedValue({ id: 7 });
    mocks.saveProject.mockResolvedValue(undefined);
  });

  it("字幕辨識服務失敗後會顯示重試辨識，點擊後重新發送辨識請求", async () => {
    mocks.transcribe.mockRejectedValueOnce(retryableError()).mockResolvedValueOnce({ subtitles: [] });
    render(createElement(Home));

    fireEvent.click(screen.getByRole("button", { name: "字幕" }));
    const startButton = await waitFor(() => enabledButton(/開始辨識/));
    expect(startButton).toBeTruthy();
    fireEvent.click(startButton!);

    const retryButton = await screen.findByRole("button", { name: "重試辨識" });
    fireEvent.click(retryButton);

    await waitFor(() => expect(mocks.transcribe).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "重試辨識" })).toBeNull();
  });

  it("影片輸出服務失敗後會顯示重新輸出，點擊後重新發送渲染請求", async () => {
    mocks.render.mockRejectedValueOnce(retryableError()).mockResolvedValueOnce({ url: "/rendered.mp4" });
    render(createElement(Home));

    fireEvent.click(screen.getAllByRole("button", { name: "輸出" })[0]);
    const startButton = await waitFor(() => enabledButton(/開始輸出/));
    expect(startButton).toBeTruthy();
    fireEvent.click(startButton!);

    const retryButton = await screen.findByRole("button", { name: "重新輸出" });
    fireEvent.click(retryButton);

    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "重新輸出" })).toBeNull();
  });
});
