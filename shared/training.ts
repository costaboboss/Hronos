import { z } from "zod";

export const trainingSetTypeSchema = z.enum(["warmup", "work", "drop", "amrap", "failure"]);
export const trainingVolumeModeSchema = z.enum([
  "weight_reps",
  "bodyweight_reps",
  "reps_only",
  "duration",
  "distance",
]);

export const createTrainingExerciseInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().max(80).optional(),
  primaryMuscleGroup: z.string().trim().max(80).optional(),
  equipment: z.string().trim().max(80).optional(),
  volumeMode: trainingVolumeModeSchema.default("weight_reps"),
  isBodyweight: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
});

export const trainingSetInputSchema = z.object({
  setType: trainingSetTypeSchema.default("work"),
  weightKg: z.number().int().min(0).max(2000).nullable().optional(),
  additionalWeightKg: z.number().int().min(0).max(1000).nullable().optional(),
  effectiveWeightKg: z.number().int().min(0).max(3000).nullable().optional(),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  rpe: z.number().int().min(0).max(10).nullable().optional(),
  restSeconds: z.number().int().min(0).max(7200).nullable().optional(),
  durationSeconds: z.number().int().min(0).max(86400).nullable().optional(),
  distanceMeters: z.number().int().min(0).max(1000000).nullable().optional(),
  rawInput: z.string().trim().max(200).optional(),
  completedAt: z.string().datetime().optional(),
});

export const trainingSessionExerciseInputSchema = z.object({
  exerciseId: z.number().int().positive(),
  notes: z.string().trim().max(2000).optional(),
  sets: z.array(trainingSetInputSchema).min(1).max(80),
});

export const createTrainingSessionInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  performedAt: z.string().datetime(),
  startTimeText: z.string().trim().max(20).optional(),
  durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  notes: z.string().trim().max(4000).optional(),
  tardisDocumentId: z.number().int().positive().nullable().optional(),
  exercises: z.array(trainingSessionExerciseInputSchema).min(1).max(30),
});

export const trainingHistoryInputSchema = z.object({
  exerciseId: z.number().int().positive(),
  limit: z.number().int().min(1).max(100).default(12),
});

export const trainingListSessionsInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
});

export const trainingMonthSessionsInputSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export const trainingMonthInputSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export const trainingYearInputSchema = z.object({
  year: z.number().int().min(2020).max(2100),
});

export const trainingAnalyticsInputSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  exerciseId: z.number().int().positive().optional(),
});

export const trainingCellInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  exerciseId: z.number().int().positive(),
  rawInput: z.string().trim().max(4000),
  notes: z.string().trim().max(2000).optional(),
  sessionTitle: z.string().trim().max(200).optional(),
  startTimeText: z.string().trim().max(20).optional(),
  durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  sessionNotes: z.string().trim().max(4000).optional(),
});

export const trainingSessionDetailsInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const updateTrainingSessionInputSchema = z.object({
  sessionId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  performedAt: z.string().datetime(),
  startTimeText: z.string().trim().max(20).optional(),
  durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  notes: z.string().trim().max(4000).optional(),
  exercises: z.array(trainingSessionExerciseInputSchema).min(1).max(30),
});

export const deleteTrainingSessionInputSchema = z.object({
  sessionId: z.number().int().positive(),
});

export type TrainingSetType = z.infer<typeof trainingSetTypeSchema>;
export type TrainingVolumeMode = z.infer<typeof trainingVolumeModeSchema>;
export type CreateTrainingExerciseInput = z.infer<typeof createTrainingExerciseInputSchema>;
export type CreateTrainingSessionInput = z.infer<typeof createTrainingSessionInputSchema>;
