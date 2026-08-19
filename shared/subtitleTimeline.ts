import type { SubtitleCue, TimelineClip } from "./editorTypes";
import { DEFAULT_SUBTITLE_POSITION } from "./subtitlePosition";

/** Converts source-media Whisper timestamps to the selected timeline clip's visible range. */
export function alignSubtitlesToClip(cues: SubtitleCue[], clip: TimelineClip): SubtitleCue[] {
  return cues.flatMap(cue => {
    const startMs = Math.max(clip.startMs, clip.startMs + cue.startMs - clip.trimStartMs);
    const endMs = Math.min(clip.endMs, clip.startMs + cue.endMs - clip.trimStartMs);
    if (endMs <= startMs || !cue.text.trim()) return [];
    return [{
      ...cue,
      startMs,
      endMs,
      x: cue.x ?? DEFAULT_SUBTITLE_POSITION.x,
      y: cue.y ?? DEFAULT_SUBTITLE_POSITION.y,
    }];
  });
}
