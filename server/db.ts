import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  InsertTag,
  InsertTimeEntry,
  InsertUser,
  tardisBlocks,
  tardisDocumentLinks,
  tardisDocuments,
  tardisNotebookGroups,
  tardisNotebooks,
  tardisSections,
  tags,
  trainingExercises,
  trainingSessionExercises,
  trainingSessions,
  trainingSets,
  timeEntries,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

function getPool() {
  if (!_pool && process.env.DATABASE_URL) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: ENV.isProduction ? { rejectUnauthorized: false } : undefined,
    });
  }

  return _pool;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = getPool();
      _db = pool ? drizzle(pool) : null;
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }

  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const role: "user" | "admin" =
    user.openId === ENV.ownerOpenId ? "admin" : (user.role ?? "user");

  await db
    .insert(users)
    .values({
      ...user,
      role,
      lastSignedIn: user.lastSignedIn ?? new Date(),
    })
    .onConflictDoUpdate({
      target: users.openId,
      set: {
        name: user.name,
        email: user.email,
        loginMethod: user.loginMethod,
        lastSignedIn: user.lastSignedIn ?? new Date(),
        role,
        updatedAt: new Date(),
      },
    });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result[0];
}

export async function getUserBackupBundle(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [userRows, tagRows, timeEntryRows, tardisGroupRows, trainingExerciseRows, trainingSessionRows] =
    await Promise.all([
      db.select().from(users).where(eq(users.id, userId)).limit(1),
      db.select().from(tags).where(eq(tags.userId, userId)).orderBy(asc(tags.createdAt), asc(tags.id)),
      db
        .select()
        .from(timeEntries)
        .where(eq(timeEntries.userId, userId))
        .orderBy(asc(timeEntries.entryDate), asc(timeEntries.startTime), asc(timeEntries.id)),
      db
        .select()
        .from(tardisNotebookGroups)
        .where(eq(tardisNotebookGroups.userId, userId))
        .orderBy(asc(tardisNotebookGroups.sortOrder), asc(tardisNotebookGroups.id)),
      db
        .select()
        .from(trainingExercises)
        .where(eq(trainingExercises.userId, userId))
        .orderBy(asc(trainingExercises.createdAt), asc(trainingExercises.id)),
      db
        .select()
        .from(trainingSessions)
        .where(eq(trainingSessions.userId, userId))
        .orderBy(asc(trainingSessions.performedAt), asc(trainingSessions.id)),
    ]);

  const tardisGroupIds = tardisGroupRows.map(item => item.id);
  const tardisNotebookRows =
    tardisGroupIds.length > 0
      ? await db
          .select()
          .from(tardisNotebooks)
          .where(inArray(tardisNotebooks.groupId, tardisGroupIds))
          .orderBy(asc(tardisNotebooks.sortOrder), asc(tardisNotebooks.id))
      : [];

  const tardisNotebookIds = tardisNotebookRows.map(item => item.id);
  const tardisDocumentRows =
    tardisNotebookIds.length > 0
      ? await db
          .select()
          .from(tardisDocuments)
          .where(inArray(tardisDocuments.notebookId, tardisNotebookIds))
          .orderBy(asc(tardisDocuments.sortOrder), asc(tardisDocuments.id))
      : [];

  const tardisDocumentIds = tardisDocumentRows.map(item => item.id);
  const [tardisSectionRows, tardisBlockRows, tardisLinkRows] =
    tardisDocumentIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(tardisSections)
            .where(inArray(tardisSections.documentId, tardisDocumentIds))
            .orderBy(asc(tardisSections.sortOrder), asc(tardisSections.id)),
          db
            .select()
            .from(tardisBlocks)
            .where(inArray(tardisBlocks.documentId, tardisDocumentIds))
            .orderBy(asc(tardisBlocks.sortOrder), asc(tardisBlocks.id)),
          db
            .select()
            .from(tardisDocumentLinks)
            .where(
              and(
                inArray(tardisDocumentLinks.fromDocumentId, tardisDocumentIds),
                inArray(tardisDocumentLinks.toDocumentId, tardisDocumentIds)
              )
            )
            .orderBy(asc(tardisDocumentLinks.sortOrder), asc(tardisDocumentLinks.id)),
        ])
      : [[], [], []];

  const trainingSessionIds = trainingSessionRows.map(item => item.id);
  const trainingSessionExerciseRows =
    trainingSessionIds.length > 0
      ? await db
          .select()
          .from(trainingSessionExercises)
          .where(inArray(trainingSessionExercises.sessionId, trainingSessionIds))
          .orderBy(asc(trainingSessionExercises.sessionId), asc(trainingSessionExercises.sortOrder), asc(trainingSessionExercises.id))
      : [];

  const trainingSessionExerciseIds = trainingSessionExerciseRows.map(item => item.id);
  const trainingSetRows =
    trainingSessionExerciseIds.length > 0
      ? await db
          .select()
          .from(trainingSets)
          .where(inArray(trainingSets.sessionExerciseId, trainingSessionExerciseIds))
          .orderBy(asc(trainingSets.sessionExerciseId), asc(trainingSets.setOrder), asc(trainingSets.id))
      : [];

  return {
    version: 1,
    app: "hronos",
    exportedAt: new Date().toISOString(),
    user: userRows[0] ?? null,
    data: {
      tags: tagRows,
      timeEntries: timeEntryRows,
      tardisNotebookGroups: tardisGroupRows,
      tardisNotebooks: tardisNotebookRows,
      tardisDocuments: tardisDocumentRows,
      tardisSections: tardisSectionRows,
      tardisBlocks: tardisBlockRows,
      tardisDocumentLinks: tardisLinkRows,
      trainingExercises: trainingExerciseRows,
      trainingSessions: trainingSessionRows,
      trainingSessionExercises: trainingSessionExerciseRows,
      trainingSets: trainingSetRows,
    },
    counts: {
      tags: tagRows.length,
      timeEntries: timeEntryRows.length,
      tardisNotebookGroups: tardisGroupRows.length,
      tardisNotebooks: tardisNotebookRows.length,
      tardisDocuments: tardisDocumentRows.length,
      tardisSections: tardisSectionRows.length,
      tardisBlocks: tardisBlockRows.length,
      tardisDocumentLinks: tardisLinkRows.length,
      trainingExercises: trainingExerciseRows.length,
      trainingSessions: trainingSessionRows.length,
      trainingSessionExercises: trainingSessionExerciseRows.length,
      trainingSets: trainingSetRows.length,
    },
  };
}

const DEFAULT_TAGS = [
  { name: "\u0441\u043e\u043d", color: "#6366f1" },
  { name: "\u0440\u0430\u0431\u043e\u0442\u0430", color: "#f59e0b", isWork: true },
  { name: "\u0442\u0430\u043a\u0442\u0438\u043a\u0430", color: "#10b981", isWork: true },
  { name: "\u0442\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043a\u0430", color: "#ef4444", isWork: true },
  { name: "\u0435\u0434\u0430", color: "#f97316" },
  { name: "\u0434\u043e\u0440\u043e\u0433\u0430", color: "#8b5cf6" },
  { name: "\u043e\u0442\u0434\u044b\u0445", color: "#06b6d4" },
  { name: "\u043b\u0435\u0436\u0430\u043b", color: "#84cc16" },
  { name: "\u0431\u044b\u0442\u043e\u0432\u044b\u0435 \u0434\u0435\u043b\u0430", color: "#ec4899" },
  { name: "\u043e\u0431\u0443\u0447\u0435\u043d\u0438\u0435", color: "#3b82f6", isWork: true },
  { name: "\u043e\u0431\u0449\u0435\u043d\u0438\u0435", color: "#14b8a6" },
  { name: "\u043f\u0440\u043e\u0447\u0435\u0435", color: "#6b7280" },
];

export async function ensureDefaultTags(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.isDefault, true)));

  if (existing.length > 0) return;

  for (const tag of DEFAULT_TAGS) {
    await db.insert(tags).values({
      ...tag,
      userId,
      isDefault: true,
      isWork: tag.isWork ?? false,
    });
  }
}

export async function getTagsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(tags).where(eq(tags.userId, userId));
}

export async function createTag(tag: InsertTag) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [result] = await db.insert(tags).values(tag).returning();
  return result;
}

export async function updateTag(
  id: number,
  userId: number,
  data: { name?: string; color?: string; isWork?: boolean }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [result] = await db
    .update(tags)
    .set(data)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .returning();

  return result;
}

export async function deleteTag(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.delete(tags).where(and(eq(tags.id, id), eq(tags.userId, userId)));
}

export async function cleanupDuplicateTags(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const userTags = await db.select().from(tags).where(eq(tags.userId, userId));
  const groups = new Map<string, typeof userTags>();

  for (const tag of userTags) {
    const key = tag.name.trim().toLowerCase();
    const bucket = groups.get(key) ?? [];
    bucket.push(tag);
    groups.set(key, bucket);
  }

  let deletedCount = 0;

  for (const group of Array.from(groups.values())) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((left, right) => {
      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
      if (left.isWork !== right.isWork) return left.isWork ? -1 : 1;
      return left.id - right.id;
    });

    const [keeper, ...duplicates] = sorted;

    for (const duplicate of duplicates) {
      await db
        .update(timeEntries)
        .set({
          tagId: keeper.id,
          tagName: keeper.name,
          updatedAt: new Date(),
        })
        .where(and(eq(timeEntries.userId, userId), eq(timeEntries.tagId, duplicate.id)));

      await db.delete(tags).where(and(eq(tags.id, duplicate.id), eq(tags.userId, userId)));
      deletedCount += 1;
    }
  }

  return { deletedCount };
}

export async function upsertTimeEntry(entry: InsertTimeEntry) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [result] = await db
    .insert(timeEntries)
    .values(entry)
    .onConflictDoUpdate({
      target: [
        timeEntries.userId,
        timeEntries.entryDate,
        timeEntries.startTime,
      ],
      set: {
        endTime: entry.endTime,
        tagId: entry.tagId ?? null,
        tagName: entry.tagName ?? null,
        comment: entry.comment ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return result;
}

export async function bulkUpsertTimeEntries(entries: InsertTimeEntry[]) {
  const results = [];

  for (const entry of entries) {
    results.push(await upsertTimeEntry(entry));
  }

  return results;
}

export async function getEntriesByDateRange(
  userId: number,
  startDate: string,
  endDate: string
) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.entryDate, startDate),
        lte(timeEntries.entryDate, endDate)
      )
    );
}

export async function deleteTimeEntry(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db
    .delete(timeEntries)
    .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)));
}

export async function bulkClearTimeEntries(
  userId: number,
  cells: { entryDate: string; startTime: string }[]
) {
  if (cells.length === 0) return;

  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  for (const cell of cells) {
    await db
      .delete(timeEntries)
      .where(
        and(
          eq(timeEntries.userId, userId),
          eq(timeEntries.entryDate, cell.entryDate),
          eq(timeEntries.startTime, cell.startTime)
        )
      );
  }
}
