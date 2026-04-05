import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  tags: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await db.ensureDefaultTags(ctx.user.id);
      return db.getTagsByUser(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(100), color: z.string().max(20).default("#6366f1") }))
      .mutation(async ({ ctx, input }) => {
        return db.createTag({ userId: ctx.user.id, name: input.name, color: input.color, isDefault: false });
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(100).optional(), color: z.string().max(20).optional() }))
      .mutation(async ({ ctx, input }) => {
        return db.updateTag(input.id, ctx.user.id, { name: input.name, color: input.color });
      }),
  }),

  entries: router({
    getByRange: protectedProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ ctx, input }) => {
        return db.getEntriesByDateRange(ctx.user.id, input.startDate, input.endDate);
      }),

    upsert: protectedProcedure
      .input(z.object({
        entryDate: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        tagId: z.number().nullable().optional(),
        tagName: z.string().nullable().optional(),
        comment: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.upsertTimeEntry({
          userId: ctx.user.id,
          entryDate: input.entryDate,
          startTime: input.startTime,
          endTime: input.endTime,
          tagId: input.tagId ?? null,
          tagName: input.tagName ?? null,
          comment: input.comment ?? null,
        });
      }),

    bulkUpsert: protectedProcedure
      .input(z.array(z.object({
        entryDate: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        tagId: z.number().nullable().optional(),
        tagName: z.string().nullable().optional(),
        comment: z.string().nullable().optional(),
      })))
      .mutation(async ({ ctx, input }) => {
        return db.bulkUpsertTimeEntries(
          input.map(e => ({
            userId: ctx.user.id,
            entryDate: e.entryDate,
            startTime: e.startTime,
            endTime: e.endTime,
            tagId: e.tagId ?? null,
            tagName: e.tagName ?? null,
            comment: e.comment ?? null,
          }))
        );
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteTimeEntry(input.id, ctx.user.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
