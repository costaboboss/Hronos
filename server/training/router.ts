import {
  createTrainingExerciseInputSchema,
  createTrainingSessionInputSchema,
  deleteTrainingSessionInputSchema,
  trainingCellInputSchema,
  trainingHistoryInputSchema,
  trainingAnalyticsInputSchema,
  trainingListSessionsInputSchema,
  trainingMonthSessionsInputSchema,
  trainingMonthInputSchema,
  trainingSessionDetailsInputSchema,
  trainingYearInputSchema,
  updateTrainingSessionInputSchema,
} from "@shared/training";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createUserExercise,
  createUserSession,
  deleteUserSession,
  getUserExerciseHistory,
  getUserSessionDetailsByDate,
  getUserTrainingDashboard,
  getUserTrainingAnalytics,
  getUserTrainingMatrix,
  getUserTrainingYearOverview,
  listUserMonthSessions,
  listUserExercises,
  listUserRecentSessions,
  updateUserSession,
  upsertUserTrainingCell,
} from "./service";

export const trainingRouter = router({
  listExercises: protectedProcedure.query(({ ctx }) => listUserExercises(ctx.user.id)),

  createExercise: protectedProcedure
    .input(createTrainingExerciseInputSchema)
    .mutation(({ ctx, input }) => createUserExercise(ctx.user.id, input)),

  createSession: protectedProcedure
    .input(createTrainingSessionInputSchema)
    .mutation(({ ctx, input }) => createUserSession(ctx.user.id, input)),

  listRecentSessions: protectedProcedure
    .input(trainingListSessionsInputSchema.optional())
    .query(({ ctx, input }) => listUserRecentSessions(ctx.user.id, input?.limit ?? 10)),

  listMonthSessions: protectedProcedure
    .input(trainingMonthSessionsInputSchema)
    .query(({ ctx, input }) => listUserMonthSessions(ctx.user.id, input.year, input.month)),

  history: protectedProcedure
    .input(trainingHistoryInputSchema)
    .query(({ ctx, input }) => getUserExerciseHistory(ctx.user.id, input.exerciseId, input.limit)),

  matrixByMonth: protectedProcedure
    .input(trainingMonthInputSchema)
    .query(({ ctx, input }) => getUserTrainingMatrix(ctx.user.id, input.year, input.month)),

  getSessionDetails: protectedProcedure
    .input(trainingSessionDetailsInputSchema)
    .query(({ ctx, input }) => getUserSessionDetailsByDate(ctx.user.id, input.date)),

  upsertCell: protectedProcedure
    .input(trainingCellInputSchema)
    .mutation(({ ctx, input }) => upsertUserTrainingCell(ctx.user.id, input)),

  updateSession: protectedProcedure
    .input(updateTrainingSessionInputSchema)
    .mutation(({ ctx, input }) => updateUserSession(ctx.user.id, input)),

  deleteSession: protectedProcedure
    .input(deleteTrainingSessionInputSchema)
    .mutation(({ ctx, input }) => deleteUserSession(ctx.user.id, input.sessionId)),

  dashboard: protectedProcedure.query(({ ctx }) => getUserTrainingDashboard(ctx.user.id)),

  analytics: protectedProcedure
    .input(trainingAnalyticsInputSchema)
    .query(({ ctx, input }) => getUserTrainingAnalytics(ctx.user.id, input)),

  yearOverview: protectedProcedure
    .input(trainingYearInputSchema)
    .query(({ ctx, input }) => getUserTrainingYearOverview(ctx.user.id, input.year)),
});
