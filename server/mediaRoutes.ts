import type { Express, Request, Response } from "express";
import express from "express";
import { addProjectAsset, getVideoProject } from "./db";
import { sdk } from "./_core/sdk";
import { storagePut } from "./storage";

const MAX_UPLOAD_BYTES = 90 * 1024 * 1024;
const allowedKinds = new Set(["video", "audio", "font"]);
const allowedVideoTypes = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]);
const allowedAudioTypes = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mp4", "audio/m4a"]);
const allowedFontTypes = new Set(["font/ttf", "font/otf", "font/woff", "font/woff2", "application/font-sfnt", "application/x-font-ttf", "application/vnd.ms-fontobject"]);

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-()\u4e00-\u9fff]/g, "_").slice(0, 160) || "upload.bin";
}

function hasAllowedMimeType(kind: string, mimeType: string) {
  if (kind === "video") return allowedVideoTypes.has(mimeType);
  if (kind === "audio") return allowedAudioTypes.has(mimeType);
  return allowedFontTypes.has(mimeType);
}

async function uploadMedia(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "請先登入後再上傳媒體檔案。" });
      return;
    }

    const projectId = Number(req.query.projectId);
    const kind = String(req.query.kind || "");
    const originalName = sanitizeFileName(String(req.headers["x-file-name"] || "upload.bin"));
    const mimeType = String(req.headers["content-type"] || "application/octet-stream").split(";")[0].trim();

    if (!Number.isInteger(projectId) || projectId < 1) {
      res.status(400).json({ error: "缺少有效的專案識別碼。" });
      return;
    }
    if (!allowedKinds.has(kind) || !hasAllowedMimeType(kind, mimeType)) {
      res.status(415).json({ error: "不支援此檔案格式。請上傳影片、音訊或 TTF／OTF／WOFF 字型。" });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "上傳內容為空。" });
      return;
    }
    if (req.body.length > MAX_UPLOAD_BYTES) {
      res.status(413).json({ error: "單一檔案不得超過 90 MB。" });
      return;
    }

    const project = await getVideoProject(user.id, projectId);
    if (!project) {
      res.status(404).json({ error: "找不到此影片專案，或您沒有存取權。" });
      return;
    }

    const { key, url } = await storagePut(`video-editor/${user.id}/${projectId}/${kind}-${originalName}`, req.body, mimeType);
    const assetId = await addProjectAsset({
      projectId,
      userId: user.id,
      kind: kind as "video" | "audio" | "font",
      originalName,
      storageKey: key,
      publicUrl: url,
      mimeType,
    });
    res.status(201).json({ id: assetId, projectId, kind, originalName, storageKey: key, publicUrl: url, mimeType });
  } catch (error) {
    console.error("[Media upload] Failed:", error);
    res.status(500).json({ error: "媒體上傳失敗，請稍後重試。" });
  }
}

export function registerMediaRoutes(app: Express) {
  app.post("/api/media/upload", express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), uploadMedia);
}
