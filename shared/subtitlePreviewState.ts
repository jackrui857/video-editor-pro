import type { SubtitleCue } from "./editorTypes";
import { getSubtitlePreviewPosition } from "./subtitlePosition";

export function getVisibleSubtitles(cues: SubtitleCue[], currentMs: number) {
  return cues.filter(cue => currentMs >= cue.startMs && currentMs <= cue.endMs);
}

export function getSubtitlePreviewStyle(cue: SubtitleCue) {
  const position = getSubtitlePreviewPosition(cue);
  return { left: `${position.x}%`, top: `${position.y}%` };
}

export function updateSubtitleTiming(cue: SubtitleCue, changes: Partial<Pick<SubtitleCue, "startMs" | "endMs">>) {
  const startMs = Math.max(0, Math.round(changes.startMs ?? cue.startMs));
  const requestedEnd = Math.round(changes.endMs ?? cue.endMs);
  return { ...cue, startMs, endMs: Math.max(startMs + 100, requestedEnd) };
}
