import type { Express } from "express";
import { Readable } from "node:stream";
import { ENV } from "./env";

const MEDIA_RESPONSE_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"] as const;

export function createStorageRequestHeaders(range?: string): Record<string, string> {
  return range ? { Range: range } : {};
}

export function getMediaResponseHeaders(headers: Headers) {
  return Object.fromEntries(
    MEDIA_RESPONSE_HEADERS.flatMap(name => {
      const value = headers.get(name);
      return value ? [[name, value]] : [];
    }),
  );
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      const upstream = await fetch(url, {
        headers: createStorageRequestHeaders(req.header("range") || undefined),
      });
      if (!upstream.ok) {
        const body = await upstream.text().catch(() => "");
        console.error(`[StorageProxy] media read error: ${upstream.status} ${body.slice(0, 240)}`);
        res.status(502).send("Storage media read error");
        return;
      }

      for (const [name, value] of Object.entries(getMediaResponseHeaders(upstream.headers))) res.set(name, value);
      res.set("Cache-Control", "private, max-age=300");
      res.status(upstream.status);
      if (!upstream.body) {
        res.end();
        return;
      }
      Readable.fromWeb(upstream.body as import("stream/web").ReadableStream).pipe(res);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
