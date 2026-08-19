import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clampFontSize, clampPercent, createEmptyEditorState, DEFAULT_COLOR_ADJUSTMENTS, type AspectRatio, type ColorAdjustments, type EditorState, type OutputQuality, type SubtitleCue, type TextLayer, type TimelineClip, type TransitionKind } from "@shared/editorTypes";
import { trpc } from "@/lib/trpc";
import { Check, ChevronDown, Clapperboard, Clock3, Contrast, Crop, Download, FileText, Film, FolderOpen, Layers3, Loader2, Maximize2, Mic2, Minus, Moon, MousePointer2, Palette, Pause, Play, Plus, Scissors, SlidersHorizontal, Sparkles, Split, Subtitles, SunMedium, Trash2, Type, Upload, WandSparkles, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Tool = "media" | "text" | "captions" | "color" | "export";

const toolItems: { id: Tool; label: string; icon: typeof Film }[] = [
  { id: "media", label: "媒體", icon: Film },
  { id: "text", label: "文字", icon: Type },
  { id: "captions", label: "字幕", icon: Subtitles },
  { id: "color", label: "調色", icon: Palette },
  { id: "export", label: "輸出", icon: Download },
];

const TRANSITIONS: { value: TransitionKind; label: string; hint: string }[] = [
  { value: "none", label: "無轉場", hint: "直接切換" },
  { value: "fade", label: "淡入淡出", hint: "柔和交疊" },
  { value: "slide", label: "滑動", hint: "水平進場" },
  { value: "zoom", label: "縮放", hint: "鏡頭推進" },
];

const initialState = createEmptyEditorState();

function parseEditorState(raw: string | null | undefined): EditorState {
  if (!raw) return createEmptyEditorState();
  try {
    const parsed = JSON.parse(raw) as Partial<EditorState>;
    return {
      clips: Array.isArray(parsed.clips) ? parsed.clips : [],
      textLayers: Array.isArray(parsed.textLayers) ? parsed.textLayers : [],
      subtitles: Array.isArray(parsed.subtitles) ? parsed.subtitles : [],
      color: { ...DEFAULT_COLOR_ADJUSTMENTS, ...(parsed.color ?? {}) },
    };
  } catch {
    return createEmptyEditorState();
  }
}

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const video = document.createElement("video");
    const source = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(source);
      resolve(Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 10_000);
    };
    video.onerror = () => {
      URL.revokeObjectURL(source);
      resolve(10_000);
    };
    video.src = source;
  });
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function buildSrt(cues: SubtitleCue[]) {
  const format = (value: number) => {
    const ms = Math.max(0, Math.round(value));
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1_000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1_000).padStart(3, "0")}`;
  };
  return cues.filter(cue => cue.text.trim() && cue.endMs > cue.startMs).sort((a, b) => a.startMs - b.startMs).map((cue, index) => `${index + 1}\n${format(cue.startMs)} --> ${format(cue.endMs)}\n${cue.text.trim()}`).join("\n\n");
}

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const projectsQuery = trpc.projects.list.useQuery(undefined, { enabled: isAuthenticated });
  const createProject = trpc.projects.create.useMutation();
  const saveProjectMutation = trpc.projects.save.useMutation();
  const transcribeCaptions = trpc.captions.transcribe.useMutation();
  const renderProject = trpc.renders.create.useMutation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [activeTool, setActiveTool] = useState<Tool>("media");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("未命名影片專案");
  const [editorState, setEditorState] = useState<EditorState>(initialState);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [outputQuality, setOutputQuality] = useState<OutputQuality>("1080p");
  const [currentMs, setCurrentMs] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1.2);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggingClip, setDraggingClip] = useState<string | null>(null);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);

  const timelineDurationMs = useMemo(() => Math.max(15_000, ...editorState.clips.map(clip => clip.endMs + 2_000)), [editorState.clips]);
  const pixelsPerSecond = 54 * timelineZoom;
  const timelineWidth = Math.max(860, Math.ceil((timelineDurationMs / 1_000) * pixelsPerSecond));
  const selectedClip = editorState.clips.find(clip => clip.id === selectedClipId) ?? null;
  const selectedText = editorState.textLayers.find(layer => layer.id === selectedTextId) ?? null;
  const activeClip = useMemo(() => editorState.clips.find(clip => currentMs >= clip.startMs && currentMs <= clip.endMs) ?? editorState.clips[0] ?? null, [currentMs, editorState.clips]);
  const activeSource = activeClip?.sourceUrl ?? "";
  const displayText = editorState.textLayers.filter(layer => currentMs >= layer.startMs && currentMs <= layer.endMs);
  const visibleSubtitle = editorState.subtitles.find(cue => currentMs >= cue.startMs && currentMs <= cue.endMs);
  const videoFilter = `brightness(${Math.max(0, 1 + (editorState.color.brightness + editorState.color.exposure) / 100)}) contrast(${Math.max(0, 1 + editorState.color.contrast / 100)}) saturate(${Math.max(0, 1 + editorState.color.saturation / 100)})`;

  useEffect(() => {
    if (!projectsQuery.data?.length || projectId) return;
    const latest = projectsQuery.data[0];
    setProjectId(latest.id);
    setProjectName(latest.name);
    setAspectRatio(latest.aspectRatio);
    setOutputQuality(latest.outputQuality);
    setEditorState(parseEditorState(latest.editorState));
  }, [projectId, projectsQuery.data]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip) return;
    const relativeMs = Math.max(0, currentMs - activeClip.startMs + activeClip.trimStartMs);
    if (Math.abs(video.currentTime * 1000 - relativeMs) > 400) video.currentTime = relativeMs / 1000;
  }, [activeClip?.id, activeSource]);

  const ensureProject = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error("請先登入，才能將影片安全上傳至雲端。");
      startLogin();
      throw new Error("AUTH_REQUIRED");
    }
    if (projectId) return projectId;
    const project = await createProject.mutateAsync({ name: projectName.trim() || "未命名影片專案" });
    if (!project) throw new Error("PROJECT_CREATE_FAILED");
    setProjectId(project.id);
    return project.id;
  }, [createProject, isAuthenticated, projectId, projectName]);

  const uploadAsset = useCallback(async (file: File, kind: "video" | "font") => {
    const currentProjectId = await ensureProject();
    const response = await fetch(`/api/media/upload?projectId=${currentProjectId}&kind=${kind}`, {
      method: "POST",
      headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) },
      body: file,
    });
    const data = await response.json() as { id?: number; publicUrl?: string; error?: string };
    if (!response.ok || !data.publicUrl) throw new Error(data.error || "媒體上傳失敗。");
    return { assetId: data.id, publicUrl: data.publicUrl };
  }, [ensureProject]);

  const handleVideoUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("請選擇 MP4、WebM、MOV 或 MKV 影片檔。 ");
      return;
    }
    if (file.size > 90 * 1024 * 1024) {
      toast.error("目前單一檔案上限為 90 MB。請先壓縮影片後再上傳。 ");
      return;
    }
    setUploading(true);
    try {
      const duration = await getVideoDuration(file);
      const localUrl = URL.createObjectURL(file);
      const uploaded = await uploadAsset(file, "video");
      const startMs = editorState.clips.length ? Math.max(...editorState.clips.map(clip => clip.endMs)) : 0;
      const clip: TimelineClip = {
        id: makeId("clip"), assetId: uploaded.assetId, label: file.name, sourceUrl: uploaded.publicUrl || localUrl,
        startMs, endMs: startMs + duration, trimStartMs: 0, trimEndMs: duration, transition: editorState.clips.length ? "fade" : "none",
      };
      setEditorState(state => ({ ...state, clips: [...state.clips, clip] }));
      setSelectedClipId(clip.id);
      setCurrentMs(startMs);
      toast.success("影片已上傳至雲端並加入主影片軌。 ");
    } catch (error) {
      if (error instanceof Error && error.message !== "AUTH_REQUIRED") toast.error(error.message || "影片上傳失敗。 ");
    } finally {
      setUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const handleFontUpload = async (file?: File) => {
    if (!file) return;
    const supported = ["font/ttf", "font/otf", "font/woff", "font/woff2", "application/font-sfnt", "application/x-font-ttf", "application/vnd.ms-fontobject"];
    if (!supported.includes(file.type)) {
      toast.error("請上傳 TTF、OTF、WOFF 或 WOFF2 字型檔。 ");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("自訂字型檔案上限為 15 MB。請選擇較小的字型檔後再試。 ");
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadAsset(file, "font");
      const family = `Custom-${file.name.replace(/\.[^.]+$/, "").replace(/\W/g, "") || "Font"}`;
      const style = document.createElement("style");
      style.textContent = `@font-face { font-family: '${family}'; src: url('${uploaded.publicUrl}'); font-display: swap; }`;
      document.head.appendChild(style);
      setEditorState(state => ({ ...state, textLayers: state.textLayers.map(layer => layer.id === selectedTextId ? { ...layer, fontFamily: family, fontUrl: uploaded.publicUrl, fontAssetId: uploaded.assetId } : layer) }));
      toast.success("自訂字型已上傳並套用至目前文字圖層。 ");
    } catch (error) {
      if (error instanceof Error && error.message !== "AUTH_REQUIRED") toast.error(error.message || "字型上傳失敗。 ");
    } finally {
      setUploading(false);
      if (fontInputRef.current) fontInputRef.current.value = "";
    }
  };

  const updateState = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setEditorState(state => ({ ...state, [key]: value }));

  const addTextLayer = () => {
    const layer: TextLayer = { id: makeId("text"), content: "輸入標題", fontFamily: "Noto Sans TC", fontSize: 32, color: "#ffffff", x: 50, y: 50, startMs: currentMs, endMs: Math.min(timelineDurationMs, currentMs + 5_000) };
    setEditorState(state => ({ ...state, textLayers: [...state.textLayers, layer] }));
    setSelectedTextId(layer.id);
    setActiveTool("text");
  };

  const updateTextLayer = (patch: Partial<TextLayer>) => {
    if (!selectedText) return;
    updateState("textLayers", editorState.textLayers.map(layer => layer.id === selectedText.id ? { ...layer, ...patch } : layer));
  };

  const updateColor = (key: keyof ColorAdjustments, value: number) => {
    updateState("color", { ...editorState.color, [key]: clampPercent(value) });
  };

  const resetColor = () => updateState("color", { ...DEFAULT_COLOR_ADJUSTMENTS });

  const seekTo = (nextMs: number) => {
    const value = Math.max(0, Math.min(timelineDurationMs, nextMs));
    setCurrentMs(value);
    const clip = editorState.clips.find(item => value >= item.startMs && value <= item.endMs);
    if (clip) {
      setSelectedClipId(clip.id);
      if (videoRef.current) videoRef.current.currentTime = Math.max(0, value - clip.startMs + clip.trimStartMs) / 1000;
    }
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video || !activeClip) return;
    if (playing) { video.pause(); setPlaying(false); return; }
    if (currentMs < activeClip.startMs || currentMs > activeClip.endMs) seekTo(activeClip.startMs);
    try { await video.play(); setPlaying(true); } catch { toast.error("瀏覽器無法播放這支影片。 "); }
  };

  const handleVideoTime = () => {
    const video = videoRef.current;
    if (!video || !activeClip) return;
    const next = activeClip.startMs + video.currentTime * 1000 - activeClip.trimStartMs;
    if (next >= activeClip.endMs - 15) {
      video.pause();
      setPlaying(false);
      const nextClip = editorState.clips.find(clip => clip.startMs >= activeClip.endMs - 10 && clip.id !== activeClip.id);
      if (nextClip) seekTo(nextClip.startMs);
      else setCurrentMs(activeClip.endMs);
      return;
    }
    setCurrentMs(next);
  };

  const splitClip = () => {
    if (!selectedClip || currentMs <= selectedClip.startMs + 200 || currentMs >= selectedClip.endMs - 200) {
      toast.error("請先將播放頭移至片段中間，再執行分割。 ");
      return;
    }
    const first: TimelineClip = { ...selectedClip, endMs: currentMs, trimEndMs: selectedClip.trimStartMs + (currentMs - selectedClip.startMs) };
    const second: TimelineClip = { ...selectedClip, id: makeId("clip"), startMs: currentMs, trimStartMs: first.trimEndMs, transition: "none" };
    updateState("clips", editorState.clips.flatMap(clip => clip.id === selectedClip.id ? [first, second] : [clip]));
    setSelectedClipId(second.id);
    toast.success("已在播放頭位置分割片段。 ");
  };

  const removeSelectedClip = () => {
    if (!selectedClip) return;
    updateState("clips", editorState.clips.filter(clip => clip.id !== selectedClip.id));
    setSelectedClipId(null);
    toast.success("已刪除選取的影片片段。 ");
  };

  const trimSelectedClip = (edge: "start" | "end", seconds: number) => {
    if (!selectedClip || !Number.isFinite(seconds)) return;
    const nextValue = Math.max(0, Math.round(seconds * 1_000));
    const trimStartMs = edge === "start" ? Math.min(nextValue, selectedClip.trimEndMs - 100) : selectedClip.trimStartMs;
    const trimEndMs = edge === "end" ? Math.max(nextValue, selectedClip.trimStartMs + 100) : selectedClip.trimEndMs;
    updateState("clips", editorState.clips.map(clip => clip.id === selectedClip.id ? { ...clip, trimStartMs, trimEndMs, endMs: clip.startMs + trimEndMs - trimStartMs } : clip));
  };

  const moveClip = (event: React.PointerEvent<HTMLButtonElement>, clip: TimelineClip) => {
    if (draggingClip !== clip.id || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const nextStart = Math.max(0, ((event.clientX - rect.left) / pixelsPerSecond) * 1_000 - (clip.endMs - clip.startMs) / 2);
    const duration = clip.endMs - clip.startMs;
    updateState("clips", editorState.clips.map(item => item.id === clip.id ? { ...item, startMs: Math.round(nextStart / 100) * 100, endMs: Math.round(nextStart / 100) * 100 + duration } : item));
  };

  const createSubtitle = () => {
    const cue: SubtitleCue = { id: makeId("sub"), startMs: currentMs, endMs: Math.min(timelineDurationMs, currentMs + 2_500), text: "在此輸入字幕" };
    updateState("subtitles", [...editorState.subtitles, cue]);
    setActiveTool("captions");
  };

  const updateSubtitle = (id: string, patch: Partial<SubtitleCue>) => updateState("subtitles", editorState.subtitles.map(cue => cue.id === id ? { ...cue, ...patch } : cue));

  const downloadSrt = () => {
    const content = buildSrt(editorState.subtitles);
    if (!content) { toast.error("請先建立至少一條有效字幕。 "); return; }
    const url = URL.createObjectURL(new Blob([content], { type: "application/x-subrip;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${projectName || "subtitles"}.srt`; link.click(); URL.revokeObjectURL(url);
    toast.success("字幕 SRT 檔案已下載。 ");
  };

  const recognizeCaptions = async () => {
    const source = selectedClip?.assetId ? selectedClip : editorState.clips.find(clip => clip.assetId);
    if (!source?.assetId) { toast.error("請先上傳並選取一段影片素材。 "); return; }
    try {
      const id = await ensureProject();
      const result = await transcribeCaptions.mutateAsync({ projectId: id, assetId: source.assetId, language: "zh" });
      setEditorState(state => ({ ...state, subtitles: result.subtitles }));
      toast.success(`Whisper 已辨識 ${result.subtitles.length} 段字幕，您可直接逐句編輯。`);
    } catch (error) {
      if (error instanceof Error && error.message !== "AUTH_REQUIRED") toast.error(error.message || "字幕辨識失敗，請確認影片包含可用語音。 ");
    }
  };

  const beginRender = async () => {
    if (!editorState.clips.length) return;
    try {
      const id = await ensureProject();
      await saveProjectMutation.mutateAsync({ projectId: id, name: projectName.trim() || "未命名影片專案", aspectRatio, outputQuality, durationMs: timelineDurationMs, state: editorState });
      const result = await renderProject.mutateAsync({ projectId: id });
      setRenderUrl(result.url);
      toast.success("影片已完成 FFmpeg 雲端渲染，可立即下載。 ");
    } catch (error) {
      if (error instanceof Error && error.message !== "AUTH_REQUIRED") toast.error(error.message || "影片渲染失敗，請縮短時間軸後再試。 ");
    }
  };

  const saveProject = async () => {
    try {
      setSaving(true);
      const id = await ensureProject();
      await saveProjectMutation.mutateAsync({ projectId: id, name: projectName.trim() || "未命名影片專案", aspectRatio, outputQuality, durationMs: timelineDurationMs, state: editorState });
      toast.success("專案已儲存至雲端。 ");
      projectsQuery.refetch();
    } catch (error) {
      if (error instanceof Error && error.message !== "AUTH_REQUIRED") toast.error("儲存失敗，請稍後再試。 ");
    } finally { setSaving(false); }
  };

  const renderControl = (label: string, value: keyof ColorAdjustments, icon: typeof SunMedium) => {
    const Icon = icon;
    return <label className="grid gap-2 rounded-xl bg-white/[0.035] p-3"><span className="flex items-center justify-between text-xs text-zinc-300"><span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-indigo-300" />{label}</span><b className="font-mono text-[11px] text-white">{editorState.color[value] > 0 ? "+" : ""}{editorState.color[value]}</b></span><input aria-label={label} type="range" min="-100" max="100" value={editorState.color[value]} onChange={event => updateColor(value, Number(event.target.value))} className="editor-range" /></label>;
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#0b0b10] text-zinc-300"><Loader2 className="h-5 w-5 animate-spin" /> <span className="ml-3">正在載入剪輯工作區</span></div>;

  return (
    <div className="min-h-screen overflow-hidden bg-[#0b0b10] text-zinc-100 selection:bg-indigo-500/40">
      <header className="flex h-14 items-center justify-between border-b border-white/[0.08] bg-[#111119] px-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 shadow-lg shadow-indigo-500/20"><Clapperboard className="h-4 w-4 text-white" /></div><div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300">ClipFlow Studio</div><Input value={projectName} onChange={event => setProjectName(event.target.value)} aria-label="專案名稱" className="h-5 w-48 border-0 bg-transparent px-0 text-sm font-medium text-white shadow-none focus-visible:ring-0 md:w-72" /></div></div>
        <div className="flex items-center gap-1.5"><span className="hidden text-xs text-zinc-500 lg:block">{isAuthenticated ? `${user?.name ?? "已登入"} 的工作區` : "本機試用模式"}</span>{!isAuthenticated && <Button variant="outline" size="sm" onClick={startLogin} className="border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]">登入並同步</Button>}<Button size="sm" onClick={saveProject} disabled={saving} className="bg-indigo-500 text-white hover:bg-indigo-400">{saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}儲存</Button><Button size="sm" onClick={() => setActiveTool("export")} className="bg-white text-zinc-950 hover:bg-zinc-200"><Download className="mr-1.5 h-3.5 w-3.5" />輸出</Button></div>
      </header>

      <main className="grid min-h-[calc(100vh-3.5rem)] grid-cols-[64px_minmax(0,1fr)] md:grid-cols-[72px_minmax(0,1fr)]">
        <aside className="z-20 flex flex-col items-center gap-2 border-r border-white/[0.08] bg-[#101016] py-3">
          {toolItems.map(item => { const Icon = item.icon; const active = item.id === activeTool; return <button key={item.id} onClick={() => setActiveTool(item.id)} className={`group flex w-[54px] flex-col items-center gap-1 rounded-xl py-2 text-[10px] transition ${active ? "bg-indigo-500/15 text-indigo-200" : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"}`}><Icon className={`h-[18px] w-[18px] ${active ? "text-indigo-300" : ""}`} /><span>{item.label}</span></button>; })}
          <div className="mt-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">{user?.name?.slice(0, 1) ?? "G"}</div>
        </aside>

        <div className="grid min-w-0 grid-rows-[minmax(420px,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_310px] xl:grid-rows-[minmax(0,1fr)_300px]">
          <section className="relative flex min-h-[420px] min-w-0 flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#202039_0%,#12121b_42%,#0d0d12_72%)] p-4 xl:col-start-1 xl:row-start-1">
            <div className="absolute left-5 top-4 flex items-center gap-2 text-[11px] text-zinc-400"><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-emerald-300">即時預覽</span><span>{aspectRatio}・{outputQuality}</span></div>
            <div className="relative max-h-[calc(100%-4rem)] max-w-full overflow-hidden rounded-2xl bg-[#050507] shadow-[0_28px_70px_rgba(0,0,0,0.55)]" style={{ aspectRatio: aspectRatio === "16:9" ? "16 / 9" : "9 / 16", height: aspectRatio === "16:9" ? "min(52vw, 470px)" : "min(52vh, 470px)" }}>
              {activeSource ? <video ref={videoRef} key={activeSource} src={activeSource} onTimeUpdate={handleVideoTime} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, currentMs - (activeClip?.startMs ?? 0) + (activeClip?.trimStartMs ?? 0)) / 1000; }} className="h-full w-full object-contain" style={{ filter: videoFilter }} playsInline crossOrigin="anonymous" /> : <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[linear-gradient(135deg,#1a1a2c_0%,#0c0c10_60%)] text-center"><div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/15"><Film className="h-7 w-7 text-indigo-300" /><div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-violet-400" /></div><div><p className="text-sm font-medium text-white">從媒體庫開始建立影片</p><p className="mt-1 text-xs text-zinc-500">上傳影片後，剪輯結果會在此即時呈現</p></div><Button onClick={() => videoInputRef.current?.click()} className="bg-indigo-500 hover:bg-indigo-400"><Upload className="mr-1.5 h-4 w-4" />匯入影片</Button></div>}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {displayText.map(layer => <div key={layer.id} className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap text-center font-bold leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,.9)] ${selectedTextId === layer.id ? "outline outline-1 outline-indigo-400/80 outline-offset-4" : ""}`} style={{ left: `${layer.x}%`, top: `${layer.y}%`, color: layer.color, fontSize: `${layer.fontSize}px`, fontFamily: `'${layer.fontFamily}', sans-serif` }}>{layer.content}</div>)}
                {visibleSubtitle && <div className="absolute bottom-[7%] left-1/2 max-w-[82%] -translate-x-1/2 rounded bg-black/70 px-3 py-1.5 text-center text-xs font-medium leading-relaxed text-white shadow-lg md:text-sm">{visibleSubtitle.text}</div>}
              </div>
              {activeSource && <button aria-label={playing ? "暫停" : "播放"} onClick={togglePlayback} className="absolute bottom-4 left-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-indigo-500">{playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}</button>}
            </div>
            <div className="mt-4 flex items-center gap-3 text-xs text-zinc-400"><span className="font-mono text-zinc-200">{formatTime(currentMs)}</span><input aria-label="播放位置" type="range" min="0" max={timelineDurationMs} value={Math.round(currentMs)} onChange={event => seekTo(Number(event.target.value))} className="editor-range w-40 md:w-64" /><span className="font-mono">{formatTime(timelineDurationMs)}</span></div>
          </section>

          <aside className="z-10 min-w-0 overflow-y-auto border-l border-white/[0.08] bg-[#111118] xl:col-start-2 xl:row-start-1">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.07] bg-[#111118]/95 px-4 py-3 backdrop-blur"><div className="flex items-center gap-2"><div className="rounded-lg bg-indigo-400/10 p-1.5 text-indigo-300">{activeTool === "media" ? <FolderOpen className="h-4 w-4" /> : activeTool === "text" ? <Type className="h-4 w-4" /> : activeTool === "captions" ? <Subtitles className="h-4 w-4" /> : activeTool === "color" ? <SlidersHorizontal className="h-4 w-4" /> : <Download className="h-4 w-4" />}</div><h2 className="text-sm font-semibold">{activeTool === "media" ? "媒體與片段" : activeTool === "text" ? "文字設計" : activeTool === "captions" ? "字幕工作室" : activeTool === "color" ? "色彩校正" : "輸出設定"}</h2></div><ChevronDown className="h-4 w-4 text-zinc-500" /></div>
            <div className="p-4">
              {activeTool === "media" && <div className="space-y-4"><button onClick={() => videoInputRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-400/35 bg-indigo-500/[0.06] px-4 py-6 text-center transition hover:bg-indigo-500/[0.12]"><Upload className="h-5 w-5 text-indigo-300" /><span className="text-sm font-medium text-zinc-100">{uploading ? "正在上傳媒體…" : "上傳影片素材"}</span><span className="text-[11px] text-zinc-500">MP4、WebM、MOV、MKV・90 MB 內</span></button><input ref={videoInputRef} className="hidden" type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska" onChange={event => handleVideoUpload(event.target.files?.[0])} />
                <div><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-zinc-300">影片片段</span><span className="text-[11px] text-zinc-500">{editorState.clips.length} 個</span></div><div className="space-y-2">{editorState.clips.length ? editorState.clips.map((clip, index) => <button key={clip.id} onClick={() => { setSelectedClipId(clip.id); seekTo(clip.startMs); }} className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left transition ${selectedClipId === clip.id ? "border-indigo-400/50 bg-indigo-400/10" : "border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.06]"}`}><div className="flex h-9 w-12 shrink-0 items-center justify-center rounded bg-gradient-to-br from-violet-500/40 to-indigo-800/60"><Film className="h-4 w-4 text-indigo-100" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-zinc-200">{clip.label}</p><p className="mt-0.5 font-mono text-[10px] text-zinc-500">{formatTime(clip.endMs - clip.startMs)} · {index === 0 ? "起始片段" : TRANSITIONS.find(item => item.value === clip.transition)?.label}</p></div></button>) : <p className="rounded-lg bg-white/[0.025] p-3 text-center text-xs leading-5 text-zinc-500">尚未有素材。上傳第一支影片開始剪輯。</p>}</div></div>
                {selectedClip && <div className="space-y-3 rounded-xl border border-white/[0.07] bg-black/15 p-3"><div className="flex items-center justify-between"><span className="text-xs font-medium text-zinc-200">片段調整</span><Button variant="ghost" size="icon" onClick={removeSelectedClip} className="h-7 w-7 text-zinc-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></Button></div><label className="grid gap-1.5 text-[11px] text-zinc-400">片段起點 <input type="number" min="0" value={Math.round(selectedClip.startMs / 1000)} onChange={event => { const next = Number(event.target.value) * 1000; const duration = selectedClip.endMs - selectedClip.startMs; updateState("clips", editorState.clips.map(clip => clip.id === selectedClip.id ? { ...clip, startMs: next, endMs: next + duration } : clip)); }} className="h-8 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white" /></label><label className="grid gap-1.5 text-[11px] text-zinc-400">轉場效果<select value={selectedClip.transition} onChange={event => updateState("clips", editorState.clips.map(clip => clip.id === selectedClip.id ? { ...clip, transition: event.target.value as TransitionKind } : clip))} className="h-8 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white">{TRANSITIONS.map(option => <option key={option.value} value={option.value}>{option.label} · {option.hint}</option>)}</select></label></div>}</div>}
              {activeTool === "text" && <div className="space-y-4"><Button onClick={addTextLayer} className="w-full bg-indigo-500 hover:bg-indigo-400"><Plus className="mr-1.5 h-4 w-4" />新增文字圖層</Button><div className="space-y-2">{editorState.textLayers.length ? editorState.textLayers.map(layer => <button key={layer.id} onClick={() => setSelectedTextId(layer.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${selectedTextId === layer.id ? "border-indigo-400/50 bg-indigo-400/10" : "border-white/[0.07] bg-white/[0.025]"}`}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-400/10 text-violet-200"><Type className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs text-zinc-200">{layer.content || "空白文字"}</span><span className="block text-[10px] text-zinc-500">{layer.fontSize}px · {formatTime(layer.startMs)}–{formatTime(layer.endMs)}</span></span></button>) : <p className="rounded-lg bg-white/[0.025] p-3 text-center text-xs text-zinc-500">建立文字圖層後即可在預覽畫面同步檢視。</p>}</div>
                {selectedText && <div className="space-y-3 rounded-xl border border-white/[0.07] bg-black/15 p-3"><label className="grid gap-1.5 text-[11px] text-zinc-400">內容<textarea value={selectedText.content} onChange={event => updateTextLayer({ content: event.target.value })} rows={3} className="resize-none rounded-md border border-white/10 bg-white/[0.04] p-2 text-xs text-white outline-none focus:border-indigo-400" /></label><label className="grid gap-2 text-[11px] text-zinc-400"><span className="flex justify-between"><span>字體大小</span><b className="font-mono text-indigo-200">{selectedText.fontSize} / 50</b></span><input aria-label="字體大小" type="range" min="0" max="50" value={selectedText.fontSize} onChange={event => updateTextLayer({ fontSize: clampFontSize(Number(event.target.value)) })} className="editor-range" /></label><div className="grid grid-cols-2 gap-2"><label className="grid gap-1.5 text-[11px] text-zinc-400">文字顏色<input type="color" value={selectedText.color} onChange={event => updateTextLayer({ color: event.target.value })} className="h-9 w-full rounded border border-white/10 bg-transparent p-1" /></label><label className="grid gap-1.5 text-[11px] text-zinc-400">字型<select value={selectedText.fontFamily} onChange={event => updateTextLayer({ fontFamily: event.target.value, fontUrl: undefined })} className="h-9 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white"><option>Noto Sans TC</option><option>serif</option><option>monospace</option></select></label></div><Button variant="outline" size="sm" onClick={() => fontInputRef.current?.click()} className="w-full border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"><Upload className="mr-1.5 h-3.5 w-3.5" />上傳自訂字型</Button><input ref={fontInputRef} className="hidden" type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" onChange={event => handleFontUpload(event.target.files?.[0])} /><div className="grid grid-cols-2 gap-2"><label className="grid gap-1.5 text-[11px] text-zinc-400">水平位置<input type="number" min="0" max="100" value={selectedText.x} onChange={event => updateTextLayer({ x: Math.min(100, Math.max(0, Number(event.target.value))) })} className="h-8 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white" /></label><label className="grid gap-1.5 text-[11px] text-zinc-400">垂直位置<input type="number" min="0" max="100" value={selectedText.y} onChange={event => updateTextLayer({ y: Math.min(100, Math.max(0, Number(event.target.value))) })} className="h-8 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-white" /></label></div></div>}</div>}
              {activeTool === "captions" && <div className="space-y-4"><div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.06] p-3"><div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" /><div><h3 className="text-xs font-medium text-violet-100">AI 一鍵字幕</h3><p className="mt-1 text-[11px] leading-4 text-zinc-400">Whisper 會從處理過的音訊產生可編輯、帶時間戳的字幕。</p></div></div><Button size="sm" disabled={!editorState.clips.length || transcribeCaptions.isPending} onClick={recognizeCaptions} className="mt-3 w-full bg-violet-500 text-white hover:bg-violet-400">{transcribeCaptions.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mic2 className="mr-1.5 h-3.5 w-3.5" />}{transcribeCaptions.isPending ? "Whisper 辨識中" : "開始辨識"}</Button></div><div className="flex items-center justify-between"><span className="text-xs font-medium text-zinc-300">字幕片段</span><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={createSubtitle} className="h-7 w-7 text-zinc-300 hover:bg-white/10"><Plus className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={downloadSrt} className="h-7 w-7 text-zinc-300 hover:bg-white/10"><FileText className="h-3.5 w-3.5" /></Button></div></div><div className="space-y-2">{editorState.subtitles.length ? editorState.subtitles.map((cue, index) => <div key={cue.id} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5"><div className="mb-2 flex items-center justify-between"><span className="font-mono text-[10px] text-indigo-300">{String(index + 1).padStart(2, "0")} · {formatTime(cue.startMs)}</span><button onClick={() => updateState("subtitles", editorState.subtitles.filter(item => item.id !== cue.id))} className="text-zinc-600 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button></div><textarea value={cue.text} onChange={event => updateSubtitle(cue.id, { text: event.target.value })} rows={2} className="w-full resize-none border-0 bg-transparent text-xs leading-5 text-zinc-200 outline-none" /><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] text-zinc-500">開始<input type="number" min="0" value={Math.round(cue.startMs / 1000)} onChange={event => updateSubtitle(cue.id, { startMs: Number(event.target.value) * 1000 })} className="mt-1 h-7 w-full rounded border border-white/10 bg-black/20 px-1.5 text-xs text-zinc-300" /></label><label className="text-[10px] text-zinc-500">結束<input type="number" min="0" value={Math.round(cue.endMs / 1000)} onChange={event => updateSubtitle(cue.id, { endMs: Number(event.target.value) * 1000 })} className="mt-1 h-7 w-full rounded border border-white/10 bg-black/20 px-1.5 text-xs text-zinc-300" /></label></div></div>) : <p className="rounded-lg bg-white/[0.025] p-4 text-center text-xs text-zinc-500">尚未建立字幕。可使用 AI 辨識，或按「＋」手動新增。</p>}</div><Button variant="outline" onClick={downloadSrt} className="w-full border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"><Download className="mr-1.5 h-3.5 w-3.5" />下載 SRT 字幕檔</Button></div>}
              {activeTool === "color" && <div className="space-y-4"><div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><div className="flex items-center justify-between"><div><p className="text-xs font-medium text-zinc-200">快速校色</p><p className="mt-1 text-[11px] text-zinc-500">調整結果立即反映於播放器</p></div><Button variant="ghost" size="sm" onClick={resetColor} className="h-7 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-white">重設</Button></div><Button size="sm" onClick={() => { updateState("color", { exposure: 8, brightness: 4, contrast: 10, saturation: 8 }); toast.success("已套用自然增強校色。 "); }} className="mt-3 w-full bg-indigo-500/90 hover:bg-indigo-400"><WandSparkles className="mr-1.5 h-3.5 w-3.5" />一鍵自然增強</Button></div>{renderControl("曝光", "exposure", SunMedium)}{renderControl("亮度", "brightness", Moon)}{renderControl("對比度", "contrast", Contrast)}{renderControl("飽和度", "saturation", Palette)}<p className="rounded-lg border border-indigo-400/10 bg-indigo-400/[0.04] p-3 text-[11px] leading-5 text-zinc-400">預覽使用瀏覽器即時濾鏡；輸出作業會把相同數值傳給伺服器端 FFmpeg 濾鏡。</p></div>}
              {activeTool === "export" && <div className="space-y-4"><div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-xs font-medium text-zinc-200">畫面比例</p><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setAspectRatio("16:9")} className={`rounded-lg border p-3 text-center ${aspectRatio === "16:9" ? "border-indigo-400 bg-indigo-400/15 text-indigo-100" : "border-white/10 bg-black/10 text-zinc-400"}`}><div className="mx-auto mb-2 h-5 w-9 rounded-sm border border-current" /><span className="text-xs font-medium">橫式 16:9</span></button><button onClick={() => setAspectRatio("9:16")} className={`rounded-lg border p-3 text-center ${aspectRatio === "9:16" ? "border-indigo-400 bg-indigo-400/15 text-indigo-100" : "border-white/10 bg-black/10 text-zinc-400"}`}><div className="mx-auto mb-2 h-8 w-4 rounded-sm border border-current" /><span className="text-xs font-medium">直式 9:16</span></button></div></div><div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-xs font-medium text-zinc-200">輸出畫質</p><div className="mt-3 grid grid-cols-2 gap-2">{(["1080p", "2160p"] as OutputQuality[]).map(quality => <button key={quality} onClick={() => setOutputQuality(quality)} className={`rounded-lg border p-3 text-left ${outputQuality === quality ? "border-indigo-400 bg-indigo-400/15" : "border-white/10 bg-black/10"}`}><p className="text-xs font-semibold text-white">{quality === "2160p" ? "4K · 2160p" : "Full HD · 1080p"}</p><p className="mt-1 text-[10px] text-zinc-500">{quality === "2160p" ? "3840 × 2160 / 2160 × 3840" : "1920 × 1080 / 1080 × 1920"}</p></button>)}</div></div><div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-3 text-[11px] leading-5 text-zinc-400"><span className="font-medium text-amber-200">渲染提示：</span>輸出會由伺服器端 FFmpeg 依據您的時間軸、文字、字幕、調色與畫面設定合成，完成後會提供下載檔案與進度狀態。</div>{renderUrl ? <a href={renderUrl} className="flex w-full items-center justify-center rounded-md bg-emerald-400 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-300"><Download className="mr-1.5 h-4 w-4" />下載已完成 MP4</a> : <Button disabled={!editorState.clips.length || renderProject.isPending} onClick={beginRender} className="w-full bg-white text-zinc-950 hover:bg-zinc-200">{renderProject.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Clapperboard className="mr-1.5 h-4 w-4" />}{renderProject.isPending ? "正在雲端渲染" : "開始渲染輸出"}</Button>}</div>}
            </div>
          </aside>

          <section className="min-w-0 overflow-hidden border-t border-white/[0.08] bg-[#0e0e14] xl:col-span-2 xl:row-start-2">
            {selectedClip && activeTool === "media" && <div className="flex items-center gap-2 border-b border-white/[0.07] bg-indigo-500/[0.035] px-3 py-1.5 text-[11px] text-zinc-400"><Crop className="h-3.5 w-3.5 text-indigo-300" /><span>快速裁切</span><Button variant="ghost" size="sm" onClick={() => trimSelectedClip("start", selectedClip.trimStartMs / 1_000 + 0.1)} className="h-7 px-2 text-[11px] text-zinc-300 hover:bg-white/10">起點 +0.1 秒</Button><Button variant="ghost" size="sm" onClick={() => trimSelectedClip("end", selectedClip.trimEndMs / 1_000 - 0.1)} className="h-7 px-2 text-[11px] text-zinc-300 hover:bg-white/10">終點 −0.1 秒</Button></div>}
            {activeTool === "captions" && <div className="flex items-center justify-between border-b border-violet-400/15 bg-violet-500/[0.045] px-3 py-1.5"><span className="flex items-center gap-2 text-[11px] text-violet-100"><Sparkles className="h-3.5 w-3.5 text-violet-300" />Whisper AI 會從目前素材擷取語音與時間戳</span><Button size="sm" disabled={!editorState.clips.length || transcribeCaptions.isPending} onClick={recognizeCaptions} className="h-7 bg-violet-500 px-2.5 text-[11px] hover:bg-violet-400">{transcribeCaptions.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mic2 className="mr-1.5 h-3.5 w-3.5" />}{transcribeCaptions.isPending ? "辨識中" : "開始辨識"}</Button></div>}
            {activeTool === "export" && <div className="flex items-center justify-between border-b border-emerald-400/15 bg-emerald-500/[0.045] px-3 py-1.5"><span className="flex items-center gap-2 text-[11px] text-emerald-100"><Clapperboard className="h-3.5 w-3.5 text-emerald-300" />使用 FFmpeg 依目前時間軸完成雲端輸出</span>{renderUrl ? <a href={renderUrl} className="flex h-7 items-center rounded bg-emerald-400 px-2.5 text-[11px] font-semibold text-emerald-950 hover:bg-emerald-300"><Download className="mr-1.5 h-3.5 w-3.5" />下載 MP4</a> : <Button size="sm" disabled={!editorState.clips.length || renderProject.isPending} onClick={beginRender} className="h-7 bg-emerald-400 px-2.5 text-[11px] text-emerald-950 hover:bg-emerald-300">{renderProject.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}{renderProject.isPending ? "渲染中" : "開始輸出"}</Button>}</div>}
            <div className="flex min-h-11 items-center justify-between border-b border-white/[0.07] px-3 md:px-4"><div className="flex items-center gap-1"><Button variant="ghost" size="icon" onClick={() => seekTo(0)} className="h-8 w-8 text-zinc-400 hover:bg-white/10 hover:text-white"><MousePointer2 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={splitClip} disabled={!selectedClip} className="h-8 text-zinc-300 hover:bg-white/10"><Split className="mr-1.5 h-3.5 w-3.5" />分割</Button><Button variant="ghost" size="icon" onClick={removeSelectedClip} disabled={!selectedClip} className="h-8 w-8 text-zinc-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></Button><span className="mx-2 h-4 w-px bg-white/10" /><Button variant="ghost" size="icon" onClick={() => setTimelineZoom(value => Math.max(0.6, value - 0.2))} className="h-8 w-8 text-zinc-400 hover:bg-white/10"><ZoomOut className="h-3.5 w-3.5" /></Button><span className="w-8 text-center font-mono text-[10px] text-zinc-500">{Math.round(timelineZoom * 100)}%</span><Button variant="ghost" size="icon" onClick={() => setTimelineZoom(value => Math.min(3, value + 0.2))} className="h-8 w-8 text-zinc-400 hover:bg-white/10"><ZoomIn className="h-3.5 w-3.5" /></Button></div><div className="flex items-center gap-2 text-[10px] text-zinc-500"><Layers3 className="h-3.5 w-3.5" /><span>多軌時間軸</span></div></div>
            <div className="h-[250px] overflow-auto editor-scroll"><div ref={timelineRef} className="relative min-h-[220px]" style={{ width: timelineWidth }} onPointerDown={event => { if (event.currentTarget === event.target) seekTo((event.nativeEvent.offsetX / pixelsPerSecond) * 1000); }}>
              <div className="relative h-8 border-b border-white/[0.08] bg-[#111119]">{Array.from({ length: Math.ceil(timelineDurationMs / 5_000) + 1 }, (_, index) => <div key={index} className="absolute top-0 h-full border-l border-white/[0.1] pl-1 pt-2 font-mono text-[10px] text-zinc-600" style={{ left: `${(index * 5_000 / 1_000) * pixelsPerSecond}px` }}>{formatTime(index * 5_000)}</div>)}</div>
              {[{ label: "影片", icon: Film, tone: "from-indigo-500/60 to-violet-500/50", key: "video" }, { label: "文字", icon: Type, tone: "from-fuchsia-500/45 to-violet-500/45", key: "text" }, { label: "字幕", icon: Subtitles, tone: "from-cyan-500/40 to-blue-500/40", key: "caption" }].map(track => { const Icon = track.icon; return <div key={track.key} className="relative flex h-[60px] border-b border-white/[0.06]"><div className="sticky left-0 z-10 flex w-[88px] shrink-0 items-center gap-2 border-r border-white/[0.08] bg-[#12121a] px-3 text-[11px] text-zinc-500"><Icon className="h-3.5 w-3.5" />{track.label}</div><div className="relative flex-1">{track.key === "video" && editorState.clips.map(clip => <button key={clip.id} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setDraggingClip(clip.id); setSelectedClipId(clip.id); }} onPointerMove={event => moveClip(event, clip)} onPointerUp={() => setDraggingClip(null)} onClick={() => { setSelectedClipId(clip.id); seekTo(clip.startMs); }} className={`absolute top-2 h-[43px] overflow-hidden rounded-md border text-left transition ${selectedClipId === clip.id ? "border-indigo-200 ring-2 ring-indigo-400/35" : "border-indigo-200/20"} bg-gradient-to-r ${track.tone}`} style={{ left: `${88 + (clip.startMs / 1_000) * pixelsPerSecond}px`, width: `${Math.max(42, ((clip.endMs - clip.startMs) / 1_000) * pixelsPerSecond)}px` }}><span className="block truncate px-2 pt-1 text-[10px] font-medium text-white">{clip.label}</span><span className="absolute bottom-1 right-1 rounded bg-black/25 px-1 font-mono text-[8px] text-white/70">{clip.transition !== "none" ? clip.transition : "clip"}</span></button>)}{track.key === "text" && editorState.textLayers.map(layer => <button key={layer.id} onClick={() => { setSelectedTextId(layer.id); setActiveTool("text"); seekTo(layer.startMs); }} className={`absolute top-3 h-8 rounded-md border px-2 text-left text-[10px] font-medium text-white ${selectedTextId === layer.id ? "border-fuchsia-100 ring-2 ring-fuchsia-400/35" : "border-fuchsia-100/25"} bg-gradient-to-r ${track.tone}`} style={{ left: `${88 + (layer.startMs / 1_000) * pixelsPerSecond}px`, width: `${Math.max(40, ((layer.endMs - layer.startMs) / 1_000) * pixelsPerSecond)}px` }}><span className="block truncate">T&nbsp; {layer.content}</span></button>)}{track.key === "caption" && editorState.subtitles.map(cue => <button key={cue.id} onClick={() => { setActiveTool("captions"); seekTo(cue.startMs); }} className={`absolute top-3 h-8 rounded-md border border-cyan-100/25 bg-gradient-to-r ${track.tone} px-2 text-left text-[10px] text-white`} style={{ left: `${88 + (cue.startMs / 1_000) * pixelsPerSecond}px`, width: `${Math.max(40, ((cue.endMs - cue.startMs) / 1_000) * pixelsPerSecond)}px` }}><span className="block truncate">{cue.text}</span></button>)}</div></div>; })}
              <div className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.85)]" style={{ left: `${88 + (currentMs / 1_000) * pixelsPerSecond}px` }}><span className="absolute -left-1.5 -top-0 h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-rose-400" /></div>
            </div></div>
          </section>
        </div>
      </main>
    </div>
  );
}
