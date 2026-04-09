import type {
  CreateTrainingExerciseInput,
  CreateTrainingSessionInput,
  TrainingSetType,
  TrainingVolumeMode,
} from "@shared/training";
import { addMonths, format, startOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import {
  createExercise,
  createSessionExerciseWithSets,
  createSessionWithExercises,
  deleteSessionExercise,
  deleteSessionIfEmpty,
  findSessionExerciseByExercise,
  getAnalyticsRows,
  getExerciseHistory,
  getSessionByDate,
  getSessionsByDateRange,
  listExerciseIdsBySession,
  listExercisesByUser,
  listRecentSessionsByUser,
  updateSessionMeta,
} from "./repository";

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-zа-я0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 180) || "exercise"
  );
}

function toOneRepMax(weightKg: number | null | undefined, reps: number | null | undefined) {
  if (!weightKg || !reps || reps <= 0) return 0;
  return Math.round(weightKg * (1 + reps / 30));
}

function getParsedWeight(raw: string) {
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*к?г/i);
  if (!match) return null;
  return Math.round(Number.parseFloat(match[1].replace(",", ".")));
}

function getParsedAdditionalWeight(raw: string) {
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*к?г\s*\+/i);
  if (!match) return null;
  return Math.round(Number.parseFloat(match[1].replace(",", ".")));
}

function getParsedRepeatValues(raw: string) {
  return Array.from(raw.matchAll(/\d+(?:[.,]\d+)?/g))
    .map(item => Number.parseFloat(item[0].replace(",", ".")))
    .filter(value => Number.isFinite(value));
}

function computeSetVolume(
  volumeMode: TrainingVolumeMode,
  set: {
    weightKg?: number | null;
    additionalWeightKg?: number | null;
    effectiveWeightKg?: number | null;
    reps?: number | null;
    durationSeconds?: number | null;
    distanceMeters?: number | null;
  }
) {
  switch (volumeMode) {
    case "weight_reps":
      return (set.weightKg ?? set.effectiveWeightKg ?? 0) * (set.reps ?? 0);
    case "bodyweight_reps":
      return (set.effectiveWeightKg ?? set.additionalWeightKg ?? set.weightKg ?? 0) * (set.reps ?? 0);
    case "reps_only":
      return set.reps ?? 0;
    case "duration":
      return set.durationSeconds ?? 0;
    case "distance":
      return set.distanceMeters ?? 0;
  }
}

function parseRawInput(rawInput: string, volumeMode: TrainingVolumeMode) {
  const normalized = rawInput
    .replace(/\u00d7/g, "x")
    .replace(/[;]/g, "\n")
    .trim();

  const lines = normalized
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const sets: Array<{
    setType: TrainingSetType;
    weightKg: number | null;
    additionalWeightKg: number | null;
    effectiveWeightKg: number | null;
    reps: number | null;
    rpe: number | null;
    restSeconds: number | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
    rawInput: string;
    completedAt: Date | null;
  }> = [];

  const pushSet = (
    set: {
      repsValue: number | null;
      weightValue: number | null;
      additionalWeightValue: number | null;
      rawValue: string;
    }
  ) => {
    sets.push({
      setType: "work",
      weightKg: volumeMode === "weight_reps" ? set.weightValue : null,
      additionalWeightKg: set.additionalWeightValue,
      effectiveWeightKg: volumeMode === "bodyweight_reps" ? set.weightValue : null,
      reps: volumeMode === "duration" || volumeMode === "distance" ? null : set.repsValue,
      rpe: null,
      restSeconds: null,
      durationSeconds:
        volumeMode === "duration" && set.repsValue != null ? Math.round(set.repsValue) : null,
      distanceMeters:
        volumeMode === "distance" && set.repsValue != null ? Math.round(set.repsValue) : null,
      rawInput: set.rawValue,
      completedAt: null,
    });
  };

  for (const line of lines) {
    const safeLine = line
      .replace(/(?<=\d),(?=\s*\d)/g, " ")
      .replace(/(?<=\d)\.(?=\s*\d)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const explicitWeight = getParsedWeight(safeLine);
    const additionalWeight = getParsedAdditionalWeight(safeLine);
    const starPattern = safeLine.match(/(\d+(?:[.,]\d+)?)\s*(?:к?г)?\s*(\d+(?:[.,]\d+)?)\s*\*\s*(\d+)/i);
    const allNumbers = getParsedRepeatValues(safeLine);
    if (allNumbers.length === 0) continue;

    if (starPattern) {
      const weight = Math.round(Number.parseFloat(starPattern[1].replace(",", ".")));
      const reps = Math.round(Number.parseFloat(starPattern[2].replace(",", ".")));
      const count = Number.parseInt(starPattern[3], 10);
      for (let index = 0; index < count; index += 1) {
        pushSet({
          repsValue: reps,
          weightValue: volumeMode === "reps_only" ? null : weight,
          additionalWeightValue: additionalWeight,
          rawValue: line,
        });
      }
      continue;
    }

    if (explicitWeight != null && allNumbers.length >= 2) {
      const repeatNumbers = allNumbers.slice(1);
      for (const repsValue of repeatNumbers) {
        pushSet({
          repsValue: Math.round(repsValue),
          weightValue: volumeMode === "reps_only" ? null : explicitWeight,
          additionalWeightValue: additionalWeight,
          rawValue: line,
        });
      }
      continue;
    }

    for (const value of allNumbers) {
      pushSet({
        repsValue: Math.round(value),
        weightValue:
          volumeMode === "weight_reps" || volumeMode === "bodyweight_reps" ? explicitWeight : null,
        additionalWeightValue: additionalWeight,
        rawValue: line,
      });
    }
  }

  return sets;
}

function getBestSetKey(setType: TrainingSetType) {
  return setType === "warmup" ? 0 : 1;
}

export async function listUserExercises(userId: number) {
  return listExercisesByUser(userId);
}

export async function createUserExercise(userId: number, input: CreateTrainingExerciseInput) {
  return createExercise({
    userId,
    name: input.name,
    slug: slugify(input.name),
    category: input.category || null,
    primaryMuscleGroup: input.primaryMuscleGroup || null,
    equipment: input.equipment || null,
    volumeMode: input.volumeMode,
    isBodyweight: input.isBodyweight,
    notes: input.notes || null,
  });
}

export async function createUserSession(userId: number, input: CreateTrainingSessionInput) {
  const exercises = await listExercisesByUser(userId);
  const exerciseMap = new Map(exercises.map(item => [item.id, item]));

  return createSessionWithExercises({
    session: {
      userId,
      title: input.title,
      performedAt: new Date(input.performedAt),
      startTimeText: input.startTimeText ?? null,
      durationMinutes: input.durationMinutes ?? null,
      notes: input.notes ?? null,
      tardisDocumentId: input.tardisDocumentId ?? null,
    },
    exercises: input.exercises.map(item => {
      const exercise = exerciseMap.get(item.exerciseId);
      const volumeMode = exercise?.volumeMode ?? "weight_reps";
      const sets = item.sets.map(set => ({
        setType: set.setType,
        weightKg: set.weightKg ?? null,
        additionalWeightKg: set.additionalWeightKg ?? null,
        effectiveWeightKg: set.effectiveWeightKg ?? null,
        reps: set.reps ?? null,
        rpe: set.rpe ?? null,
        restSeconds: set.restSeconds ?? null,
        durationSeconds: set.durationSeconds ?? null,
        distanceMeters: set.distanceMeters ?? null,
        rawInput: set.rawInput ?? null,
        completedAt: set.completedAt ? new Date(set.completedAt) : null,
      }));

      return {
        exerciseId: item.exerciseId,
        notes: item.notes ?? null,
        computedVolume: sets.reduce((sum, set) => sum + computeSetVolume(volumeMode, set), 0),
        sets,
      };
    }),
  });
}

export async function listUserRecentSessions(userId: number, limit: number) {
  return listRecentSessionsByUser(userId, limit);
}

export async function getUserExerciseHistory(userId: number, exerciseId: number, limit: number) {
  const rows = await getExerciseHistory(userId, exerciseId, limit * 8);
  const grouped = new Map<
    number,
    {
      sessionId: number;
      sessionTitle: string;
      performedAt: Date;
      bestWeightKg: number;
      bestReps: number;
      estimatedOneRepMax: number;
      setCount: number;
    }
  >();

  for (const row of rows) {
    const current = grouped.get(row.sessionId);
    const workingWeight = row.effectiveWeightKg ?? row.weightKg ?? row.additionalWeightKg ?? 0;
    const reps = row.reps ?? 0;
    const estimatedOneRepMax = toOneRepMax(workingWeight, row.reps);

    if (!current) {
      grouped.set(row.sessionId, {
        sessionId: row.sessionId,
        sessionTitle: row.sessionTitle,
        performedAt: row.performedAt,
        bestWeightKg: workingWeight,
        bestReps: reps,
        estimatedOneRepMax,
        setCount: 1,
      });
      continue;
    }

    const currentScore =
      getBestSetKey("work") * current.estimatedOneRepMax + current.bestWeightKg * 10 + current.bestReps;
    const nextScore =
      getBestSetKey(row.setType) * estimatedOneRepMax + workingWeight * 10 + reps;

    if (nextScore >= currentScore) {
      current.bestWeightKg = workingWeight;
      current.bestReps = reps;
      current.estimatedOneRepMax = estimatedOneRepMax;
    }
    current.setCount += 1;
  }

  return Array.from(grouped.values()).slice(0, limit);
}

export async function getUserTrainingDashboard(userId: number) {
  const recentSessions = await listRecentSessionsByUser(userId, 6);
  const analyticsRows = await getAnalyticsRows(userId, 90);
  const exercises = await listExercisesByUser(userId);

  const totalVolumeKg = analyticsRows.reduce((sum, row) => sum + (row.computedVolume ?? 0), 0);
  const workoutsLast30Days = new Set(
    analyticsRows
      .filter(row => row.performedAt.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000)
      .map(row => row.sessionId)
  ).size;

  const muscleGroups = new Map<string, number>();
  const exerciseProgress = new Map<
    number,
    {
      exerciseId: number;
      exerciseName: string;
      primaryMuscleGroup: string | null;
      currentEstimatedOneRepMax: number;
      previousEstimatedOneRepMax: number;
      volumeKg: number;
      sessions: Set<number>;
      lastPerformedAt: Date;
    }
  >();

  for (const row of analyticsRows) {
    const key = row.primaryMuscleGroup || "Прочее";
    muscleGroups.set(key, (muscleGroups.get(key) ?? 0) + 1);

    const currentWeight = row.effectiveWeightKg ?? row.weightKg ?? 0;
    const currentEstimate = toOneRepMax(currentWeight, row.reps);
    const current = exerciseProgress.get(row.exerciseId);
    if (!current) {
      exerciseProgress.set(row.exerciseId, {
        exerciseId: row.exerciseId,
        exerciseName: row.exerciseName,
        primaryMuscleGroup: row.primaryMuscleGroup,
        currentEstimatedOneRepMax: currentEstimate,
        previousEstimatedOneRepMax: 0,
        volumeKg: row.computedVolume ?? 0,
        sessions: new Set([row.sessionId]),
        lastPerformedAt: row.performedAt,
      });
      continue;
    }

    if (row.performedAt.getTime() === current.lastPerformedAt.getTime()) {
      current.currentEstimatedOneRepMax = Math.max(current.currentEstimatedOneRepMax, currentEstimate);
    } else if (row.performedAt < current.lastPerformedAt) {
      current.previousEstimatedOneRepMax = Math.max(current.previousEstimatedOneRepMax, currentEstimate);
    }

    current.volumeKg += row.computedVolume ?? 0;
    current.sessions.add(row.sessionId);
  }

  return {
    summary: {
      exerciseCount: exercises.filter(item => !item.isArchived).length,
      workoutCount: recentSessions.length,
      workoutsLast30Days,
      totalVolumeKg,
    },
    recentSessions,
    muscleGroupDistribution: Array.from(muscleGroups.entries())
      .map(([name, sets]) => ({ name, sets }))
      .sort((a, b) => b.sets - a.sets),
    progressHighlights: Array.from(exerciseProgress.values())
      .map(item => ({
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        primaryMuscleGroup: item.primaryMuscleGroup,
        sessions: item.sessions.size,
        volumeKg: item.volumeKg,
        currentEstimatedOneRepMax: item.currentEstimatedOneRepMax,
        previousEstimatedOneRepMax: item.previousEstimatedOneRepMax,
        deltaEstimatedOneRepMax: item.currentEstimatedOneRepMax - item.previousEstimatedOneRepMax,
        lastPerformedAt: item.lastPerformedAt,
      }))
      .sort((a, b) => b.volumeKg - a.volumeKg || b.currentEstimatedOneRepMax - a.currentEstimatedOneRepMax)
      .slice(0, 8),
  };
}

export async function getUserTrainingMatrix(userId: number, year: number, month: number) {
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = addMonths(monthStart, 1);
  const exercises = await listExercisesByUser(userId);
  const sessions = await getSessionsByDateRange(userId, monthStart, monthEnd);

  const cells = new Map<
    string,
    {
      sessionId: number;
      sessionExerciseId: number;
      volume: number;
      note: string | null;
      rawInput: string;
      setsCount: number;
    }
  >();
  const daySummary = new Map<
    string,
    { volume: number; durationMinutes: number | null; startTimeText: string | null; sessionId: number }
  >();

  for (const session of sessions) {
    const dateKey = format(session.performedAt, "yyyy-MM-dd");
    const dayVolume = session.exercises.reduce((sum, item) => sum + (item.computedVolume ?? 0), 0);
    daySummary.set(dateKey, {
      volume: dayVolume,
      durationMinutes: session.durationMinutes,
      startTimeText: session.startTimeText,
      sessionId: session.id,
    });

    for (const item of session.exercises) {
      const rawInput = item.sets
        .map(set => set.rawInput?.trim())
        .filter((value): value is string => Boolean(value))
        .join("\n");

      cells.set(`${item.exerciseId}_${dateKey}`, {
        sessionId: session.id,
        sessionExerciseId: item.id,
        volume: item.computedVolume ?? 0,
        note: item.notes,
        rawInput,
        setsCount: item.sets.length,
      });
    }
  }

  return {
    monthLabel: format(monthStart, "LLLL yyyy"),
    days: Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => {
      const date = new Date(year, month - 1, index + 1);
      const dateKey = format(date, "yyyy-MM-dd");
      const summary = daySummary.get(dateKey);

      return {
        date: dateKey,
        day: index + 1,
        summary: summary ?? null,
      };
    }),
    exercises: exercises
      .filter(item => !item.isArchived)
      .map(exercise => ({
        ...exercise,
        cells: Object.fromEntries(
          Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => {
            const dateKey = format(new Date(year, month - 1, index + 1), "yyyy-MM-dd");
            return [dateKey, cells.get(`${exercise.id}_${dateKey}`) ?? null];
          })
        ),
      })),
  };
}

export async function getUserTrainingYearOverview(userId: number, year: number) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const sessions = await getSessionsByDateRange(userId, yearStart, yearEnd);

  return Array.from({ length: 12 }, (_, index) => {
    const monthSessions = sessions.filter(session => session.performedAt.getFullYear() === year && session.performedAt.getMonth() === index);
    const totalVolume = monthSessions.reduce(
      (sum, session) => sum + session.exercises.reduce((sessionSum, exercise) => sessionSum + (exercise.computedVolume ?? 0), 0),
      0
    );

    return {
      month: index + 1,
      monthLabel: format(new Date(year, index, 1), "LLLL", { locale: ru }),
      workoutCount: monthSessions.length,
      totalVolume,
    };
  });
}

export async function getUserSessionDetailsByDate(userId: number, date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return getSessionByDate(userId, start, end);
}

export async function upsertUserTrainingCell(
  userId: number,
  input: {
    date: string;
    exerciseId: number;
    rawInput: string;
    notes?: string;
    sessionTitle?: string;
    startTimeText?: string;
    durationMinutes?: number | null;
    sessionNotes?: string;
  }
) {
  const exercises = await listExercisesByUser(userId);
  const exercise = exercises.find(item => item.id === input.exerciseId);
  if (!exercise) throw new Error("Exercise not found");

  const parsedSets = parseRawInput(input.rawInput, exercise.volumeMode);
  const start = new Date(`${input.date}T00:00:00`);
  const end = new Date(`${input.date}T00:00:00`);
  end.setDate(end.getDate() + 1);

  const existingSession = await getSessionByDate(userId, start, end);

  if (existingSession) {
    const existingSessionExercise = await findSessionExerciseByExercise(existingSession.id, input.exerciseId);
    if (existingSessionExercise) {
      await deleteSessionExercise(existingSessionExercise.id);
    }
  }

  if (parsedSets.length === 0) {
    if (existingSession) {
      await deleteSessionIfEmpty(existingSession.id);
    }
    return { success: true } as const;
  }

  const computedVolume = parsedSets.reduce(
    (sum, set) => sum + computeSetVolume(exercise.volumeMode, set),
    0
  );

  if (existingSession) {
    const existingExercises = await listExerciseIdsBySession(existingSession.id);
    await updateSessionMeta(existingSession.id, {
      title: input.sessionTitle ?? existingSession.title,
      performedAt: existingSession.performedAt,
      startTimeText: input.startTimeText ?? existingSession.startTimeText,
      durationMinutes:
        input.durationMinutes === undefined ? existingSession.durationMinutes : input.durationMinutes,
      notes: input.sessionNotes ?? existingSession.notes,
    });
    await createSessionExerciseWithSets({
      sessionId: existingSession.id,
      exerciseId: input.exerciseId,
      notes: input.notes ?? null,
      computedVolume,
      sortOrder: existingExercises.length,
      sets: parsedSets,
    });
    return { success: true } as const;
  }

  const title = input.sessionTitle?.trim() || `Тренировка ${input.date}`;
  return createSessionWithExercises({
    session: {
      userId,
      title,
      performedAt: new Date(`${input.date}T12:00:00`),
      startTimeText: input.startTimeText ?? null,
      durationMinutes: input.durationMinutes ?? null,
      notes: input.sessionNotes ?? null,
      tardisDocumentId: null,
    },
    exercises: [
      {
        exerciseId: input.exerciseId,
        notes: input.notes ?? null,
        computedVolume,
        sets: parsedSets,
      },
    ],
  });
}
