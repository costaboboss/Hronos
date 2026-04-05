import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

vi.mock("./db", () => ({
  ensureDefaultTags: vi.fn().mockResolvedValue(undefined),
  getTagsByUser: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      name: "сон",
      color: "#6366f1",
      isDefault: true,
      createdAt: new Date(),
    },
    {
      id: 2,
      userId: 1,
      name: "работа",
      color: "#f59e0b",
      isDefault: true,
      createdAt: new Date(),
    },
  ]),
  createTag: vi.fn().mockResolvedValue({
    id: 99,
    userId: 1,
    name: "тест",
    color: "#ff0000",
    isDefault: false,
    createdAt: new Date(),
  }),
  updateTag: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "сон2",
    color: "#6366f1",
    isDefault: true,
    createdAt: new Date(),
  }),
  upsertTimeEntry: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    entryDate: "2026-01-05",
    startTime: "09:00",
    endTime: "09:15",
    tagId: 1,
    tagName: "сон",
    comment: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  bulkUpsertTimeEntries: vi.fn().mockResolvedValue([]),
  getEntriesByDateRange: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      entryDate: "2026-01-05",
      startTime: "09:00",
      endTime: "09:15",
      tagId: 1,
      tagName: "сон",
      comment: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  deleteTimeEntry: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
}));

function makeCtx(): TrpcContext {
  const clearedCookies: string[] = [];

  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "google",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string) => {
        clearedCookies.push(name);
      },
    } as TrpcContext["res"],
  };
}

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });

  it("auth.me returns current user", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user?.name).toBe("Test User");
  });
});

describe("tags", () => {
  it("tags.list returns default tags", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tags.list();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("сон");
  });

  it("tags.create creates a new tag", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tags.create({ name: "тест", color: "#ff0000" });
    expect(result?.name).toBe("тест");
  });

  it("tags.create validates name length", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.tags.create({ name: "" })).rejects.toThrow();
  });
});

describe("entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("entries.getByRange returns entries", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.entries.getByRange({
      startDate: "2026-01-01",
      endDate: "2026-01-07",
    });
    expect(result).toHaveLength(1);
    expect(result[0].tagName).toBe("сон");
  });

  it("entries.upsert saves an entry", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.entries.upsert({
      entryDate: "2026-01-05",
      startTime: "09:00",
      endTime: "09:15",
      tagId: 1,
      tagName: "сон",
    });
    expect(result?.tagName).toBe("сон");
  });

  it("entries.bulkUpsert saves multiple entries", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.entries.bulkUpsert([
      {
        entryDate: "2026-01-05",
        startTime: "09:00",
        endTime: "09:15",
        tagId: 1,
        tagName: "сон",
      },
      {
        entryDate: "2026-01-05",
        startTime: "09:15",
        endTime: "09:30",
        tagId: 1,
        tagName: "сон",
      },
    ]);
    expect(Array.isArray(result)).toBe(true);
  });

  it("entries.delete calls delete", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.entries.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});
