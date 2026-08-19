import { spawn } from "child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { addProjectAsset, getProjectAsset, getVideoProject } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import { transcribeAudio } from "./_core/voiceTranscription";
import { type EditorState, type SubtitleCue, type TimelineClip } from "../shared/editorTypes";
import { getSubtitleAssPosition } from "../shared/subtitlePosition";
import { buildRenderFilename, buildRenderStorageKey } from "../shared/renderOutputName";

const MAX_RENDER_DURATION_MS = 60_000;
const MAX_4K_DURATION_MS = 30_000;
const MAX_RENDER_SOURCE_BYTES = 180 * 1024 * 1024;
const MAX_TRANSCRIPTION_AUDIO_BYTES = 16 * 1024 * 1024;

type RenderSettings = { aspectRatio: "16:9" | "9:16"; outputQuality: "1080p" | "2160p" };

function runBinary(binary: string, args: string[], timeoutMs = 155_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      process.kill("SIGKILL");
      reject(new Error(`${binary} 處理時間超過可用限制。請縮短影片後再輸出。`));
    }, timeoutMs);
    process.stderr.on("data", data => { stderr += data.toString(); });
    process.on("error", error => { clearTimeout(timer); reject(error); });
    process.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${binary} 失敗：${stderr.slice(-900) || `結束代碼 ${code}`}`));
    });
  });
}

function assetExtension(originalName: string, fallback: string) {
  const extension = path.extname(originalName).replace(/[^.a-zA-Z0-9]/g, "");
  return extension || fallback;
}

async function downloadAsset(storageKey: string, localPath: string) {
  const signedUrl = await storageGetSignedUrl(storageKey);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("無法讀取雲端媒體檔案。請重新上傳後再試。 ");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_RENDER_SOURCE_BYTES) throw new Error("來源檔案過大，請將素材縮小後再處理。 ");
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > MAX_RENDER_SOURCE_BYTES) throw new Error("來源檔案過大，請將素材縮小後再處理。 ");
  await writeFile(localPath, data);
  return data.length;
}

function parseProjectState(raw: string): EditorState {
  try {
    const value = JSON.parse(raw) as EditorState;
    return {
      clips: Array.isArray(value.clips) ? value.clips : [],
      textLayers: Array.isArray(value.textLayers) ? value.textLayers : [],
      subtitles: Array.isArray(value.subtitles) ? value.subtitles : [],
      color: value.color ?? { exposure: 0, brightness: 0, contrast: 0, saturation: 0 },
    };
  } catch {
    throw new Error("影片專案資料無法讀取。請在編輯器中重新儲存後再試。 ");
  }
}

function getTargetSize(settings: RenderSettings) {
  const landscape = settings.outputQuality === "2160p" ? [3840, 2160] : [1920, 1080];
  return settings.aspectRatio === "16:9" ? { width: landscape[0], height: landscape[1] } : { width: landscape[1], height: landscape[0] };
}

function buildVisualFilter(state: EditorState, width: number, height: number) {
  const brightness = Math.min(1, Math.max(-1, (state.color.brightness + state.color.exposure) / 100));
  const contrast = Math.min(2, Math.max(0, 1 + state.color.contrast / 100));
  const saturation = Math.min(3, Math.max(0, 1 + state.color.saturation / 100));
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation},setsar=1`;
}

async function hasAudioStream(filePath: string) {
  return new Promise<boolean>(resolve => {
    const probe = spawn("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", filePath]);
    let output = "";
    probe.stdout.on("data", data => { output += data.toString(); });
    probe.on("close", code => resolve(code === 0 && Boolean(output.trim())));
    probe.on("error", () => resolve(false));
  });
}

function assTime(milliseconds: number) {
  const totalCs = Math.max(0, Math.round(milliseconds / 10));
  const h = Math.floor(totalCs / 360_000);
  const m = Math.floor((totalCs % 360_000) / 6_000);
  const s = Math.floor((totalCs % 6_000) / 100);
  const cs = totalCs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function assText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\r?\n/g, "\\N");
}

function assColor(hex: string) {
  const valid = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] || "FFFFFF";
  return `&H00${valid.slice(4, 6)}${valid.slice(2, 4)}${valid.slice(0, 2)}`;
}

export function buildAss(state: EditorState, width: number, height: number, fontFamilies: Record<string, string>) {
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,Noto Sans CJK TC,28,&H00FFFFFF,&H000000FF,&HAA000000,&H66000000,0,0,0,0,100,100,0,0,1,2,1,2,24,24,38,1\nStyle: Caption,Noto Sans CJK TC,34,&H00FFFFFF,&H000000FF,&HAA000000,&H66000000,1,0,0,0,100,100,0,0,1,2.4,1,2,32,32,78,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
  const textLines = state.textLayers.filter(layer => layer.content.trim() && layer.endMs > layer.startMs).map(layer => {
    const x = Math.round((layer.x / 100) * width);
    const y = Math.round((layer.y / 100) * height);
    const size = Math.max(1, Math.round((layer.fontSize / 50) * Math.max(20, Math.min(width, height) / 10)));
    const family = fontFamilies[layer.fontFamily] || layer.fontFamily || "Noto Sans CJK TC";
    return `Dialogue: 1,${assTime(layer.startMs)},${assTime(layer.endMs)},Default,,0,0,0,,{\\an5\\pos(${x},${y})\\fs${size}\\fn${family}\\c${assColor(layer.color)}}${assText(layer.content)}`;
  });
  const subtitleLines = state.subtitles.filter(cue => cue.text.trim() && cue.endMs > cue.startMs).map(cue => `Dialogue: 2,${assTime(cue.startMs)},${assTime(cue.endMs)},Caption,,0,0,0,,{${getSubtitleAssPosition(cue, width, height)}}${assText(cue.text)}`);
  return header + [...textLines, ...subtitleLines].join("\n") + "\n";
}

async function getFontFamily(fontPath: string) {
  return new Promise<string | null>(resolve => {
    const probe = spawn("fc-scan", ["--format=%{family}", fontPath]);
    let output = "";
    probe.stdout.on("data", data => { output += data.toString(); });
    probe.on("close", code => resolve(code === 0 && output.trim() ? output.split(",")[0].trim() : null));
    probe.on("error", () => resolve(null));
  });
}

async function prepareCustomFonts(userId: number, state: EditorState, workspace: string) {
  const fontsDirectory = path.join(workspace, "fonts");
  const fontFamilies: Record<string, string> = {};
  for (const layer of state.textLayers.filter(item => item.fontAssetId)) {
    if (!layer.fontAssetId || fontFamilies[layer.fontFamily]) continue;
    const asset = await getProjectAsset(userId, layer.fontAssetId);
    if (!asset || asset.kind !== "font") continue;
    await mkdir(fontsDirectory, { recursive: true });
    const fontPath = path.join(fontsDirectory, `${layer.fontAssetId}${assetExtension(asset.originalName, ".ttf")}`);
    await downloadAsset(asset.storageKey, fontPath);
    const actualName = await getFontFamily(fontPath);
    if (actualName) fontFamilies[layer.fontFamily] = actualName;
  }
  return { fontsDirectory, fontFamilies };
}

async function prepareClip(inputPath: string, outputPath: string, clip: TimelineClip, state: EditorState, settings: RenderSettings) {
  const { width, height } = getTargetSize(settings);
  const duration = Math.max(0.05, (clip.trimEndMs - clip.trimStartMs) / 1_000);
  const audioPresent = await hasAudioStream(inputPath);
  const args = ["-y", "-ss", String(Math.max(0, clip.trimStartMs / 1_000)), "-t", String(duration), "-i", inputPath];
  if (!audioPresent) args.push("-f", "lavfi", "-t", String(duration), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  args.push("-map", "0:v:0", "-map", audioPresent ? "0:a:0" : "1:a:0", "-vf", buildVisualFilter(state, width, height), "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", settings.outputQuality === "2160p" ? "20" : "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-b:a", "160k", "-movflags", "+faststart", outputPath);
  await runBinary("ffmpeg", args);
  return duration;
}

function ffmpegTransition(transition: TimelineClip["transition"]) {
  if (transition === "slide") return "slideleft";
  if (transition === "zoom") return "zoomin";
  return "fade";
}

async function joinClips(paths: string[], clips: TimelineClip[], durations: number[], outputPath: string) {
  if (paths.length === 1) {
    await runBinary("ffmpeg", ["-y", "-i", paths[0], "-c", "copy", outputPath]);
    return;
  }
  const transitionSeconds = 0.45;
  let filter = "";
  let lastVideo = "0:v";
  let lastAudio = "0:a";
  let currentDuration = durations[0];
  for (let index = 1; index < paths.length; index += 1) {
    const duration = Math.min(transitionSeconds, Math.max(0.08, durations[index] / 3), Math.max(0.08, currentDuration / 3));
    const suffix = index === paths.length - 1 ? "final" : String(index);
    filter += `[${lastVideo}][${index}:v]xfade=transition=${ffmpegTransition(clips[index].transition)}:duration=${duration}:offset=${Math.max(0, currentDuration - duration)}[v${suffix}];`;
    filter += `[${lastAudio}][${index}:a]acrossfade=d=${duration}:c1=tri:c2=tri[a${suffix}];`;
    lastVideo = `v${suffix}`;
    lastAudio = `a${suffix}`;
    currentDuration += durations[index] - duration;
  }
  const args = paths.flatMap(item => ["-i", item]);
  args.push("-filter_complex", filter.slice(0, -1), "-map", `[${lastVideo}]`, "-map", `[${lastAudio}]`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-movflags", "+faststart", outputPath);
  await runBinary("ffmpeg", args);
}

export async function renderVideoProject(userId: number, projectId: number) {
  const project = await getVideoProject(userId, projectId);
  if (!project) throw new Error("找不到影片專案。 ");
  const state = parseProjectState(project.editorState);
  const clips = [...state.clips].filter(clip => clip.assetId && clip.endMs > clip.startMs).sort((a, b) => a.startMs - b.startMs);
  if (!clips.length) throw new Error("請先加入至少一段已上傳的影片素材。 ");
  const fullDuration = clips.reduce((sum, clip) => sum + (clip.trimEndMs - clip.trimStartMs), 0);
  if (fullDuration > MAX_RENDER_DURATION_MS) throw new Error("目前雲端渲染僅支援合計 60 秒內的影片。請縮短時間軸後再試。 ");
  if (project.outputQuality === "2160p" && fullDuration > MAX_4K_DURATION_MS) throw new Error("4K 輸出目前僅支援合計 30 秒內的影片，以確保可以在伺服器逾時前完成。 ");
  const settings: RenderSettings = { aspectRatio: project.aspectRatio, outputQuality: project.outputQuality };
  const workspace = await mkdtemp(path.join(tmpdir(), "clipflow-render-"));
  try {
    let consumedBytes = 0;
    const prepared: string[] = [];
    const durations: number[] = [];
    for (let index = 0; index < clips.length; index += 1) {
      const asset = await getProjectAsset(userId, clips[index].assetId!);
      if (!asset || asset.kind !== "video") throw new Error("時間軸包含不存在或未授權的影片素材。 ");
      const inputPath = path.join(workspace, `source-${index}${assetExtension(asset.originalName, ".mp4")}`);
      consumedBytes += await downloadAsset(asset.storageKey, inputPath);
      if (consumedBytes > MAX_RENDER_SOURCE_BYTES) throw new Error("此專案選取的來源素材總量過大，請拆分為較短的輸出。 ");
      const preparedPath = path.join(workspace, `clip-${index}.mp4`);
      durations.push(await prepareClip(inputPath, preparedPath, clips[index], state, settings));
      prepared.push(preparedPath);
    }
    const joinedPath = path.join(workspace, "joined.mp4");
    await joinClips(prepared, clips, durations, joinedPath);
    const { width, height } = getTargetSize(settings);
    const fontSetup = await prepareCustomFonts(userId, state, workspace);
    const ass = buildAss(state, width, height, fontSetup.fontFamilies);
    const finalPath = path.join(workspace, "final.mp4");
    if (state.textLayers.length || state.subtitles.length) {
      const assPath = path.join(workspace, "overlay.ass");
      await writeFile(assPath, ass);
      const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
      await runBinary("ffmpeg", ["-y", "-i", joinedPath, "-vf", `subtitles='${escape(assPath)}':fontsdir='${escape(fontSetup.fontsDirectory)}'`, "-c:v", "libx264", "-preset", "veryfast", "-crf", settings.outputQuality === "2160p" ? "20" : "22", "-c:a", "copy", "-movflags", "+faststart", finalPath]);
    } else {
      await runBinary("ffmpeg", ["-y", "-i", joinedPath, "-c", "copy", finalPath]);
    }
    const output = await readFile(finalPath);
    const maxOutput = 220 * 1024 * 1024;
    if (output.length > maxOutput) throw new Error("輸出檔案超過可下載大小限制。請選擇 1080p 或縮短影片。 ");
    const filename = buildRenderFilename(project.name, project.aspectRatio, project.outputQuality);
    const stored = await storagePut(buildRenderStorageKey(userId, projectId, filename), output, "video/mp4");
    const assetId = await addProjectAsset({ projectId, userId, kind: "render", originalName: filename, storageKey: stored.key, publicUrl: stored.url, mimeType: "video/mp4" });
    return { assetId, url: stored.url, filename, bytes: output.length };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function transcribeProjectVideo(userId: number, projectId: number, assetId: number, language?: string) {
  const project = await getVideoProject(userId, projectId);
  if (!project) throw new Error("找不到影片專案。 ");
  const asset = await getProjectAsset(userId, assetId);
  if (!asset || asset.projectId !== projectId || asset.kind !== "video") throw new Error("請選擇此專案內已上傳的影片素材。 ");
  const workspace = await mkdtemp(path.join(tmpdir(), "clipflow-caption-"));
  try {
    const sourcePath = path.join(workspace, `source${assetExtension(asset.originalName, ".mp4")}`);
    await downloadAsset(asset.storageKey, sourcePath);
    const audioPath = path.join(workspace, "speech.mp3");
    await runBinary("ffmpeg", ["-y", "-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audioPath], 80_000);
    const audioSize = (await stat(audioPath)).size;
    if (audioSize > MAX_TRANSCRIPTION_AUDIO_BYTES) throw new Error("影片音訊超過字幕辨識的 16 MB 上限。請先裁切成較短片段。 ");
    const audio = await readFile(audioPath);
    const stored = await storagePut(`video-editor/${userId}/${projectId}/transcription-${Date.now()}.mp3`, audio, "audio/mpeg");
    const audioAssetId = await addProjectAsset({ projectId, userId, kind: "audio", originalName: "transcription-audio.mp3", storageKey: stored.key, publicUrl: stored.url, mimeType: "audio/mpeg" });
    const signedUrl = await storageGetSignedUrl(stored.key);
    const result = await transcribeAudio({ audioUrl: signedUrl, language: language || "zh", prompt: "請辨識影片語音，保留自然的繁體中文標點與句子切分。" });
    if ("error" in result) throw new Error(result.details ? `${result.error}：${result.details}` : result.error);
    const subtitles: SubtitleCue[] = result.segments.map(segment => ({ id: `whisper-${segment.id}-${Math.round(segment.start * 1000)}`, startMs: Math.round(segment.start * 1000), endMs: Math.max(Math.round(segment.end * 1000), Math.round(segment.start * 1000) + 100), text: segment.text.trim() })).filter(cue => cue.text);
    return { language: result.language, text: result.text, subtitles, audioAssetId };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
