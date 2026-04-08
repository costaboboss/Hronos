import {
  createTrainingExerciseInputSchema,
  createTrainingSessionInputSchema,
  trainingCellInputSchema,
  trainingHistoryInputSchema,
  trainingListSessionsInputSchema,
  trainingMonthInputSchema,
  trainingSessionDetailsInputSchema,
} from "@shared/training";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createUserExercise,
  createUserSession,
  getUserExerciseHistory,
  getUserSessionDetailsByDate,
  getUserTrainingDashboard,
  getUserTrainingMatrix,
  listUserExercises,
  listUserRecentSessions,
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

  dashboard: protectedProcedure.query(({ ctx }) => getUserTrainingDashboard(ctx.user.id)),
});
