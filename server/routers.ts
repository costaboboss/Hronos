import { COOKIE_NAME } from "@shared/const";
import { trainingRouter } from "./training/router";
import { tardisRouter } from "./tardis/router";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  tardis: tardisRouter,
  training: trainingRouter,

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

    setWork: protectedProcedure
      .input(z.object({ id: z.number(), isWork: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        return db.updateTag(input.id, ctx.user.id, { isWork: input.isWork });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const dbConn = await db.getDb();
        if (!dbConn) throw new Error("DB unavailable");
        const { eq, and } = await import("drizzle-orm");
        const { tags } = await import("../drizzle/schema");
        await dbConn.delete(tags).where(and(eq(tags.id, input.id), eq(tags.userId, ctx.user.id)));
        return { success: true };
      }),

    createMany: protectedProcedure
      .input(z.array(z.object({ name: z.string().min(1).max(100), color: z.string().max(20) })))
      .mutation(async ({ ctx, input }) => {
        // Get existing tags to avoid duplicates
        const existing = await db.getTagsByUser(ctx.user.id);
        const existingByName: Record<string, typeof existing[0]> = {};
        for (const t of existing) existingByName[t.name.toLowerCase()] = t;

        const result: typeof existing = [];
        for (const item of input) {
          const key = item.name.toLowerCase();
          if (existingByName[key]) {
            result.push(existingByName[key]);
          } else {
            const created = await db.createTag({ userId: ctx.user.id, name: item.name, color: item.color, isDefault: false });
            if (created) {
              result.push(created);
              existingByName[key] = created;
            }
          }
        }
        return result;
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

    bulkClear: protectedProcedure
      .input(z.array(z.object({ entryDate: z.string(), startTime: z.string() })))
      .mutation(async ({ ctx, input }) => {
        await db.bulkClearTimeEntries(ctx.user.id, input);
        return { success: true, cleared: input.length };
      }),
  }),
});

export type AppRouter = typeof appRouter;
