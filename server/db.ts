import { and, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  InsertTag,
  InsertTimeEntry,
  InsertUser,
  tags,
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

// Users

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

// Tags

const DEFAULT_TAGS = [
  { name: "\u0441\u043e\u043d", color: "#6366f1" },
  { name: "\u0440\u0430\u0431\u043e\u0442\u0430", color: "#f59e0b" },
  { name: "\u0442\u0430\u043a\u0442\u0438\u043a\u0430", color: "#10b981" },
  { name: "\u0442\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043a\u0430", color: "#ef4444" },
  { name: "\u0435\u0434\u0430", color: "#f97316" },
  { name: "\u0434\u043e\u0440\u043e\u0433\u0430", color: "#8b5cf6" },
  { name: "\u043e\u0442\u0434\u044b\u0445", color: "#06b6d4" },
  { name: "\u043b\u0435\u0436\u0430\u043b", color: "#84cc16" },
  { name: "\u0431\u044b\u0442\u043e\u0432\u044b\u0435 \u0434\u0435\u043b\u0430", color: "#ec4899" },
  { name: "\u043e\u0431\u0443\u0447\u0435\u043d\u0438\u0435", color: "#3b82f6" },
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
    await db.insert(tags).values({ ...tag, userId, isDefault: true });
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
  data: { name?: string; color?: string }
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

// Time Entries

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
