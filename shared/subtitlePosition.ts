import type { SubtitleCue } from "./editorTypes";

export const DEFAULT_SUBTITLE_POSITION = { x: 50, y: 86 } as const;

function clampPreviewPercent(value: number, fallback: number) {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : fallback)));
}

export function getSubtitlePreviewPosition(cue: Pick<SubtitleCue, "x" | "y">) {
  return {
    x: clampPreviewPercent(cue.x ?? DEFAULT_SUBTITLE_POSITION.x, DEFAULT_SUBTITLE_POSITION.x),
    y: clampPreviewPercent(cue.y ?? DEFAULT_SUBTITLE_POSITION.y, DEFAULT_SUBTITLE_POSITION.y),
  };
}

/** Converts the preview percentage coordinate into a centre-anchored ASS subtitle override. */
export function getSubtitleAssPosition(cue: Pick<SubtitleCue, "x" | "y">, width: number, height: number) {
  const position = getSubtitlePreviewPosition(cue);
  const x = Math.round((position.x / 100) * width);
  const y = Math.round((position.y / 100) * height);
  return `\\an5\\pos(${x},${y})`;
}
