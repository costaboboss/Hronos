import {
  boolean,
  jsonb,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("#6366f1"),
  isDefault: boolean("isDefault").notNull().default(false),
  isWork: boolean("isWork").notNull().default(false),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

export const timeEntries = pgTable(
  "time_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    entryDate: varchar("entryDate", { length: 10 }).notNull(),
    startTime: varchar("startTime", { length: 5 }).notNull(),
    endTime: varchar("endTime", { length: 5 }).notNull(),
    tagId: integer("tagId").references(() => tags.id, { onDelete: "set null" }),
    tagName: varchar("tagName", { length: 100 }),
    comment: text("comment"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    userDateStartIdx: uniqueIndex("time_entries_user_date_start_idx").on(
      table.userId,
      table.entryDate,
      table.startTime
    ),
  })
);

export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = typeof timeEntries.$inferInsert;

export const tardisDocumentModeEnum = pgEnum("tardis_document_mode", ["typed", "custom"]);

export const tardisNotebookGroups = pgTable("tardis_notebook_groups", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull(),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type TardisNotebookGroup = typeof tardisNotebookGroups.$inferSelect;
export type InsertTardisNotebookGroup = typeof tardisNotebookGroups.$inferInsert;

export const tardisNotebooks = pgTable("tardis_notebooks", {
  id: serial("id").primaryKey(),
  groupId: integer("groupId").notNull().references(() => tardisNotebookGroups.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull(),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type TardisNotebook = typeof tardisNotebooks.$inferSelect;
export type InsertTardisNotebook = typeof tardisNotebooks.$inferInsert;

export const tardisDocuments = pgTable("tardis_documents", {
  id: serial("id").primaryKey(),
  notebookId: integer("notebookId").notNull().references(() => tardisNotebooks.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  documentType: varchar("documentType", { length: 64 }).notNull(),
  documentMode: tardisDocumentModeEnum("documentMode").notNull(),
  periodDate: varchar("periodDate", { length: 10 }),
  periodYear: integer("periodYear"),
  periodMonth: integer("periodMonth"),
  periodWeek: integer("periodWeek"),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type TardisDocument = typeof tardisDocuments.$inferSelect;
export type InsertTardisDocument = typeof tardisDocuments.$inferInsert;

export const tardisSections = pgTable("tardis_sections", {
  id: serial("id").primaryKey(),
  documentId: integer("documentId").notNull().references(() => tardisDocuments.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  sectionKey: varchar("sectionKey", { length: 100 }).notNull(),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type TardisSection = typeof tardisSections.$inferSelect;
export type InsertTardisSection = typeof tardisSections.$inferInsert;

export const tardisBlocks = pgTable("tardis_blocks", {
  id: serial("id").primaryKey(),
  documentId: integer("documentId").notNull().references(() => tardisDocuments.id, { onDelete: "cascade" }),
  sectionId: integer("sectionId").notNull().references(() => tardisSections.id, { onDelete: "cascade" }),
  blockType: varchar("blockType", { length: 64 }).notNull(),
  title: varchar("title", { length: 200 }),
  contentJson: jsonb("contentJson").$type<Record<string, unknown>>().notNull().default({}),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type TardisBlock = typeof tardisBlocks.$inferSelect;
export type InsertTardisBlock = typeof tardisBlocks.$inferInsert;

export const tardisDocumentLinks = pgTable("tardis_document_links", {
  id: serial("id").primaryKey(),
  fromDocumentId: integer("fromDocumentId").notNull().references(() => tardisDocuments.id, { onDelete: "cascade" }),
  toDocumentId: integer("toDocumentId").notNull().references(() => tardisDocuments.id, { onDelete: "cascade" }),
  linkType: varchar("linkType", { length: 64 }).notNull(),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type TardisDocumentLink = typeof tardisDocumentLinks.$inferSelect;
export type InsertTardisDocumentLink = typeof tardisDocumentLinks.$inferInsert;
