function toAsciiSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function buildRenderFilename(projectName: string, aspectRatio: "16:9" | "9:16", outputQuality: "1080p" | "2160p") {
  const safeProjectName = toAsciiSlug(projectName).slice(0, 48) || "clipflow";
  return `${safeProjectName}-${aspectRatio.replace(":", "x")}-${outputQuality}.mp4`;
}

export function buildRenderStorageKey(userId: number, projectId: number, filename: string) {
  return `video-editor/${userId}/${projectId}/render-${filename}`;
}
