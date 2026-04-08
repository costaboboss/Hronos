import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  trainingExercises,
  trainingSessionExercises,
  trainingSessions,
  trainingSets,
} from "../../drizzle/schema";
import { getDb } from "../db";

export async function listExercisesByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  return db
    .select()
    .from(trainingExercises)
    .where(eq(trainingExercises.userId, userId))
    .orderBy(asc(trainingExercises.isArchived), asc(trainingExercises.name), asc(trainingExercises.id));
}

export async function createExercise(data: typeof trainingExercises.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [exercise] = await db.insert(trainingExercises).values(data).returning();
  return exercise;
}

export async function createSessionWithExercises(input: {
  session: typeof trainingSessions.$inferInsert;
  exercises: Array<{
    exerciseId: number;
    notes?: string | null;
    computedVolume?: number | null;
    sets: Array<Omit<typeof trainingSets.$inferInsert, "sessionExerciseId" | "setOrder">>;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  return db.transaction(async tx => {
    const [session] = await tx.insert(trainingSessions).values(input.session).returning();

    for (let exerciseIndex = 0; exerciseIndex < input.exercises.length; exerciseIndex += 1) {
      const exercise = input.exercises[exerciseIndex];
      const [sessionExercise] = await tx
        .insert(trainingSessionExercises)
        .values({
          sessionId: session.id,
          exerciseId: exercise.exerciseId,
          notes: exercise.notes ?? null,
          computedVolume: exercise.computedVolume ?? null,
          sortOrder: exerciseIndex,
        })
        .returning();

      if (exercise.sets.length > 0) {
        await tx.insert(trainingSets).values(
          exercise.sets.map((set, setIndex) => ({
            ...set,
            sessionExerciseId: sessionExercise.id,
            setOrder: setIndex,
          }))
        );
      }
    }

    return session;
  });
}

export async function createSessionExerciseWithSets(input: {
  sessionId: number;
  exerciseId: number;
  notes?: string | null;
  computedVolume?: number | null;
  sortOrder: number;
  sets: Array<Omit<typeof trainingSets.$inferInsert, "sessionExerciseId" | "setOrder">>;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  return db.transaction(async tx => {
    const [sessionExercise] = await tx
      .insert(trainingSessionExercises)
      .values({
        sessionId: input.sessionId,
        exerciseId: input.exerciseId,
        notes: input.notes ?? null,
        computedVolume: input.computedVolume ?? null,
        sortOrder: input.sortOrder,
      })
      .returning();

    if (input.sets.length > 0) {
      await tx.insert(trainingSets).values(
        input.sets.map((set, setIndex) => ({
          ...set,
          sessionExerciseId: sessionExercise.id,
          setOrder: setIndex,
        }))
      );
    }

    return sessionExercise;
  });
}

export async function listRecentSessionsByUser(userId: number, limit: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const sessions = await db
    .select()
    .from(trainingSessions)
    .where(eq(trainingSessions.userId, userId))
    .orderBy(desc(trainingSessions.performedAt), desc(trainingSessions.id))
    .limit(limit);

  return hydrateSessions(sessions);
}

async function hydrateSessions(
  sessions: Array<typeof trainingSessions.$inferSelect>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map(session => session.id);
  const sessionExercises = await db
    .select()
    .from(trainingSessionExercises)
    .where(inArray(trainingSessionExercises.sessionId, sessionIds))
    .orderBy(asc(trainingSessionExercises.sortOrder), asc(trainingSessionExercises.id));

  const sessionExerciseIds = sessionExercises.map(item => item.id);
  const exerciseIds = Array.from(new Set(sessionExercises.map(item => item.exerciseId)));

  const exercises = exerciseIds.length
    ? await db.select().from(trainingExercises).where(inArray(trainingExercises.id, exerciseIds))
    : [];
  const sets = sessionExerciseIds.length
    ? await db
        .select()
        .from(trainingSets)
        .where(inArray(trainingSets.sessionExerciseId, sessionExerciseIds))
        .orderBy(asc(trainingSets.setOrder), asc(trainingSets.id))
    : [];

  const exerciseMap = new Map(exercises.map(exercise => [exercise.id, exercise]));

  return sessions.map(session => ({
    ...session,
    exercises: sessionExercises
      .filter(item => item.sessionId === session.id)
      .map(item => ({
        ...item,
        exercise: exerciseMap.get(item.exerciseId) ?? null,
        sets: sets.filter(set => set.sessionExerciseId === item.id),
      })),
  }));
}

export async function getExerciseHistory(userId: number, exerciseId: number, limit: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  return db
    .select({
      sessionId: trainingSessions.id,
      sessionTitle: trainingSessions.title,
      performedAt: trainingSessions.performedAt,
      setId: trainingSets.id,
      setType: trainingSets.setType,
      weightKg: trainingSets.weightKg,
      effectiveWeightKg: trainingSets.effectiveWeightKg,
      additionalWeightKg: trainingSets.additionalWeightKg,
      reps: trainingSets.reps,
      rpe: trainingSets.rpe,
      sessionExerciseId: trainingSessionExercises.id,
      volumeMode: trainingExercises.volumeMode,
    })
    .from(trainingSets)
    .innerJoin(trainingSessionExercises, eq(trainingSessionExercises.id, trainingSets.sessionExerciseId))
    .innerJoin(trainingSessions, eq(trainingSessions.id, trainingSessionExercises.sessionId))
    .innerJoin(trainingExercises, eq(trainingExercises.id, trainingSessionExercises.exerciseId))
    .where(and(eq(trainingExercises.userId, userId), eq(trainingExercises.id, exerciseId)))
    .orderBy(desc(trainingSessions.performedAt), desc(trainingSets.id))
    .limit(limit);
}

export async function getAnalyticsRows(userId: number, days: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  return db
    .select({
      sessionId: trainingSessions.id,
      sessionTitle: trainingSessions.title,
      performedAt: trainingSessions.performedAt,
      exerciseId: trainingExercises.id,
      exerciseName: trainingExercises.name,
      primaryMuscleGroup: trainingExercises.primaryMuscleGroup,
      volumeMode: trainingExercises.volumeMode,
      computedVolume: trainingSessionExercises.computedVolume,
      setId: trainingSets.id,
      setType: trainingSets.setType,
      weightKg: trainingSets.weightKg,
      effectiveWeightKg: trainingSets.effectiveWeightKg,
      reps: trainingSets.reps,
      durationMinutes: trainingSessions.durationMinutes,
      durationSeconds: trainingSets.durationSeconds,
      distanceMeters: trainingSets.distanceMeters,
    })
    .from(trainingSets)
    .innerJoin(trainingSessionExercises, eq(trainingSessionExercises.id, trainingSets.sessionExerciseId))
    .innerJoin(trainingSessions, eq(trainingSessions.id, trainingSessionExercises.sessionId))
    .innerJoin(trainingExercises, eq(trainingExercises.id, trainingSessionExercises.exerciseId))
    .where(
      and(
        eq(trainingSessions.userId, userId),
        sql`${trainingSessions.performedAt} >= now() - (${days} * interval '1 day')`
      )
    )
    .orderBy(desc(trainingSessions.performedAt), desc(trainingSets.id));
}

export async function getSessionsByDateRange(userId: number, start: Date, endExclusive: Date) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const sessions = await db
    .select()
    .from(trainingSessions)
    .where(
      and(
        eq(trainingSessions.userId, userId),
        gte(trainingSessions.performedAt, start),
        lt(trainingSessions.performedAt, endExclusive)
      )
    )
    .orderBy(asc(trainingSessions.performedAt), asc(trainingSessions.id));

  return hydrateSessions(sessions);
}

export async function getSessionByDate(userId: number, start: Date, endExclusive: Date) {
  const sessions = await getSessionsByDateRange(userId, start, endExclusive);
  return sessions[0] ?? null;
}

export async function deleteSessionExercise(sessionExerciseId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.delete(trainingSessionExercises).where(eq(trainingSessionExercises.id, sessionExerciseId));
}

export async function deleteSessionIfEmpty(sessionId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const remaining = await db
    .select({ id: trainingSessionExercises.id })
    .from(trainingSessionExercises)
    .where(eq(trainingSessionExercises.sessionId, sessionId))
    .limit(1);

  if (remaining.length === 0) {
    await db.delete(trainingSessions).where(eq(trainingSessions.id, sessionId));
  }
}

export async function updateSessionMeta(
  sessionId: number,
  data: Partial<typeof trainingSessions.$inferInsert>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [session] = await db
    .update(trainingSessions)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(trainingSessions.id, sessionId))
    .returning();

  return session;
}

export async function findSessionExerciseByExercise(sessionId: number, exerciseId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = await db
    .select()
    .from(trainingSessionExercises)
    .where(
      and(
        eq(trainingSessionExercises.sessionId, sessionId),
        eq(trainingSessionExercises.exerciseId, exerciseId)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function listExerciseIdsBySession(sessionId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  return db
    .select({ exerciseId: trainingSessionExercises.exerciseId })
    .from(trainingSessionExercises)
    .where(eq(trainingSessionExercises.sessionId, sessionId))
    .orderBy(asc(trainingSessionExercises.sortOrder), asc(trainingSessionExercises.id));
}
