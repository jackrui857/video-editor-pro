import { execFile } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  addProjectAsset: vi.fn(),
  getProjectAsset: vi.fn(),
  getVideoProject: vi.fn(),
}));
vi.mock("./storage", () => ({
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
}));
vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn(),
}));

import { addProjectAsset, getProjectAsset, getVideoProject } from "./db";
import { renderVideoProject, transcribeProjectVideo } from "./mediaProcessing";
import { storageGetSignedUrl, storagePut } from "./storage";
import { transcribeAudio } from "./_core/voiceTranscription";

const execFileAsync = (file: string, args: string[]) => new Promise<void>((resolve, reject) => {
  execFile(file, args, error => error ? reject(error) : resolve());
});

const projectId = 31;
const assetId = 17;
const userId = 9;
let sourceBytes: Buffer;

const editorState = {
  clips: [{ id: "retry-source", assetId, startMs: 0, endMs: 300, trimStartMs: 0, trimEndMs: 300, transition: "none" }],
  textLayers: [],
  subtitles: [],
  color: { exposure: 0, brightness: 0, contrast: 0, saturation: 0 },
};

function configureProject() {
  vi.mocked(getVideoProject).mockResolvedValue({
    id: projectId,
    name: "recovery-test",
    aspectRatio: "16:9",
    outputQuality: "1080p",
    editorState: JSON.stringify(editorState),
  } as never);
  vi.mocked(getProjectAsset).mockResolvedValue({
    id: assetId,
    projectId,
    kind: "video",
    storageKey: "videos/recovery-source.mp4",
    originalName: "recovery-source.mp4",
  } as never);
  vi.mocked(storageGetSignedUrl).mockResolvedValue("https://storage.example/recovery-source.mp4");
}

function configureTransientSourceFetch() {
  return vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response(sourceBytes, {
      status: 200,
      headers: { "content-length": String(sourceBytes.length), "content-type": "video/mp4" },
    }));
}

beforeAll(async () => {
  const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "clipflow-recovery-fixture-"));
  const fixturePath = path.join(fixtureDirectory, "source.mp4");
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "testsrc=size=64x64:rate=15",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000",
      "-t", "0.3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", fixturePath,
    ]);
    sourceBytes = await readFile(fixturePath);
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  configureProject();
});

afterAll(() => vi.restoreAllMocks());

describe("media processing recovery", () => {
  it("returns Whisper subtitles after a transient source-media 503", async () => {
    const fetchMock = configureTransientSourceFetch();
    vi.mocked(storagePut).mockResolvedValue({ key: "audio/recovery.mp3", url: "/manus-storage/audio/recovery.mp3" });
    vi.mocked(addProjectAsset).mockResolvedValue(77 as never);
    vi.mocked(transcribeAudio).mockResolvedValue({
      task: "transcribe", language: "zh", duration: 0.3, text: "測試字幕",
      segments: [{ id: 0, seek: 0, start: 0, end: 0.3, text: "測試字幕", tokens: [], temperature: 0, avg_logprob: 0, compression_ratio: 0, no_speech_prob: 0 }],
    });

    const result = await transcribeProjectVideo(userId, projectId, assetId, "zh");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(transcribeAudio).toHaveBeenCalledTimes(1);
    expect(result.subtitles).toEqual([expect.objectContaining({ text: "測試字幕" })]);
    fetchMock.mockRestore();
  }, 15_000);

  it("creates an output MP4 after a transient source-media 503", async () => {
    const fetchMock = configureTransientSourceFetch();
    vi.mocked(storagePut).mockResolvedValue({ key: "renders/recovery.mp4", url: "/manus-storage/renders/recovery.mp4" });
    vi.mocked(addProjectAsset).mockResolvedValue(88 as never);

    const result = await renderVideoProject(userId, projectId);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storagePut).toHaveBeenCalledWith(expect.stringContaining("recovery-test"), expect.any(Buffer), "video/mp4");
    expect(result).toEqual(expect.objectContaining({ assetId: 88, url: "/manus-storage/renders/recovery.mp4" }));
    fetchMock.mockRestore();
  }, 25_000);
});
