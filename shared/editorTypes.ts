export type AspectRatio = "16:9" | "9:16";
export type OutputQuality = "1080p" | "2160p";
export type AssetKind = "video" | "audio" | "font" | "render";
export type TransitionKind = "none" | "fade" | "slide" | "zoom";

export type ColorAdjustments = {
  exposure: number;
  brightness: number;
  contrast: number;
  saturation: number;
};

export type TimelineClip = {
  id: string;
  assetId?: number;
  label: string;
  sourceUrl: string;
  startMs: number;
  endMs: number;
  trimStartMs: number;
  trimEndMs: number;
  transition: TransitionKind;
};

export type TextLayer = {
  id: string;
  content: string;
  fontFamily: string;
  fontUrl?: string;
  fontAssetId?: number;
  fontSize: number;
  color: string;
  x: number;
  y: number;
  startMs: number;
  endMs: number;
};

export type SubtitleCue = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type EditorState = {
  clips: TimelineClip[];
  textLayers: TextLayer[];
  subtitles: SubtitleCue[];
  color: ColorAdjustments;
};

export const DEFAULT_COLOR_ADJUSTMENTS: ColorAdjustments = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

export function createEmptyEditorState(): EditorState {
  return { clips: [], textLayers: [], subtitles: [], color: { ...DEFAULT_COLOR_ADJUSTMENTS } };
}

export function clampFontSize(value: number): number {
  return Math.min(50, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(-100, Math.round(Number.isFinite(value) ? value : 0)));
}
