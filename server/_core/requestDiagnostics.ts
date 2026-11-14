import type { NextFunction, Request, Response } from "express";

export function logApiRequest(request: Request, response: Response, next: NextFunction) {
  if (!request.path.startsWith("/api/")) {
    next();
    return;
  }

  const startedAt = Date.now();
  response.on("finish", () => {
    console.info(`[API] ${request.method} ${request.originalUrl} -> ${response.statusCode} (${Date.now() - startedAt}ms)`);
  });
  next();
}
