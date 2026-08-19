import type { SubtitleCue } from "../shared/editorTypes";

export function formatSrtTimestamp(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const millis = total % 1_000;
  return [hours, minutes, seconds].map(unit => String(unit).padStart(2, "0")).join(":") + `,${String(millis).padStart(3, "0")}`;
}

export function generateSrt(cues: SubtitleCue[]): string {
  return cues
    .filter(cue => cue.text.trim() && cue.endMs > cue.startMs)
    .sort((a, b) => a.startMs - b.startMs)
    .map((cue, index) => `${index + 1}\n${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}\n${cue.text.trim()}`)
    .join("\n\n") + (cues.length ? "\n" : "");
}
