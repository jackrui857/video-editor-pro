import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { createVideoProject, getVideoProject, listVideoProjects, updateVideoProject } from "./db";
import { renderVideoProject, transcribeProjectVideo } from "./mediaProcessing";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createEmptyEditorState } from "../shared/editorTypes";

const projectStateSchema = z.object({
  clips: z.array(z.unknown()).max(100),
  textLayers: z.array(z.unknown()).max(100),
  subtitles: z.array(z.unknown()).max(600),
  color: z.object({
    exposure: z.number().min(-100).max(100),
    brightness: z.number().min(-100).max(100),
    contrast: z.number().min(-100).max(100),
    saturation: z.number().min(-100).max(100),
  }),
});

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  projects: router({
    list: protectedProcedure.query(({ ctx }) => listVideoProjects(ctx.user.id)),
    get: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const project = await getVideoProject(ctx.user.id, input.projectId);
      if (!project) throw new Error("找不到影片專案。");
      return project;
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160) })).mutation(async ({ ctx, input }) => {
      const projectId = await createVideoProject({
        userId: ctx.user.id,
        name: input.name,
        aspectRatio: "16:9",
        outputQuality: "1080p",
        durationMs: 0,
        editorState: JSON.stringify(createEmptyEditorState()),
      });
      return getVideoProject(ctx.user.id, projectId);
    }),
    save: protectedProcedure.input(z.object({
      projectId: z.number().int().positive(),
      name: z.string().trim().min(1).max(160),
      aspectRatio: z.enum(["16:9", "9:16"]),
      outputQuality: z.enum(["1080p", "2160p"]),
      durationMs: z.number().int().min(0).max(86_400_000),
      state: projectStateSchema,
    })).mutation(({ ctx, input }) => updateVideoProject(ctx.user.id, input.projectId, {
      name: input.name,
      aspectRatio: input.aspectRatio,
      outputQuality: input.outputQuality,
      durationMs: input.durationMs,
      editorState: JSON.stringify(input.state),
    })),
  }),
  captions: router({
    transcribe: protectedProcedure.input(z.object({
      projectId: z.number().int().positive(),
      assetId: z.number().int().positive(),
      language: z.string().max(12).optional(),
    })).mutation(({ ctx, input }) => transcribeProjectVideo(ctx.user.id, input.projectId, input.assetId, input.language)),
  }),
  renders: router({
    create: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(({ ctx, input }) => renderVideoProject(ctx.user.id, input.projectId)),
  }),
});

export type AppRouter = typeof appRouter;
