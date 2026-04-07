import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { tardisBlocks, tardisDocumentLinks, tardisDocuments, tardisNotebookGroups, tardisNotebooks, tardisSections } from "../../drizzle/schema";
import { getDb } from "../db";

export async function listNotebookGroupsByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const groups = await db
    .select()
    .from(tardisNotebookGroups)
    .where(eq(tardisNotebookGroups.userId, userId))
    .orderBy(asc(tardisNotebookGroups.sortOrder), asc(tardisNotebookGroups.id));

  const notebooks = await db
    .select()
    .from(tardisNotebooks)
    .innerJoin(tardisNotebookGroups, eq(tardisNotebookGroups.id, tardisNotebooks.groupId))
    .where(eq(tardisNotebookGroups.userId, userId))
    .orderBy(asc(tardisNotebooks.sortOrder), asc(tardisNotebooks.id));

  const documents = await db
    .select()
    .from(tardisDocuments)
    .innerJoin(tardisNotebooks, eq(tardisNotebooks.id, tardisDocuments.notebookId))
    .innerJoin(tardisNotebookGroups, eq(tardisNotebookGroups.id, tardisNotebooks.groupId))
    .where(eq(tardisNotebookGroups.userId, userId))
    .orderBy(asc(tardisDocuments.sortOrder), asc(tardisDocuments.id));

  return groups.map(group => ({
    ...group,
    notebooks: notebooks
      .filter(row => row.tardis_notebooks.groupId === group.id)
      .map(row => ({
        ...row.tardis_notebooks,
        documents: documents
          .filter(document => document.tardis_documents.notebookId === row.tardis_notebooks.id)
          .map(document => document.tardis_documents),
      })),
  }));
}

export async function createNotebookGroup(userId: number, title: string, slug: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [{ value: currentMax }] = await db
    .select({ value: max(tardisNotebookGroups.sortOrder) })
    .from(tardisNotebookGroups)
    .where(eq(tardisNotebookGroups.userId, userId));

  const [group] = await db
    .insert(tardisNotebookGroups)
    .values({
      userId,
      title,
      slug,
      sortOrder: (currentMax ?? -1) + 1,
    })
    .returning();

  return group;
}

export async function createNotebook(groupId: number, title: string, slug: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [{ value: currentMax }] = await db
    .select({ value: max(tardisNotebooks.sortOrder) })
    .from(tardisNotebooks)
    .where(eq(tardisNotebooks.groupId, groupId));

  const [notebook] = await db
    .insert(tardisNotebooks)
    .values({
      groupId,
      title,
      slug,
      sortOrder: (currentMax ?? -1) + 1,
    })
    .returning();

  return notebook;
}

export async function createDocument(data: typeof tardisDocuments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [{ value: currentMax }] = await db
    .select({ value: max(tardisDocuments.sortOrder) })
    .from(tardisDocuments)
    .where(eq(tardisDocuments.notebookId, data.notebookId));

  const [document] = await db
    .insert(tardisDocuments)
    .values({
      ...data,
      sortOrder: (currentMax ?? -1) + 1,
    })
    .returning();

  return document;
}

export async function createSections(documentId: number, sections: Array<{ title: string; sectionKey: string }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  return db
    .insert(tardisSections)
    .values(
      sections.map((section, index) => ({
        documentId,
        title: section.title,
        sectionKey: section.sectionKey,
        sortOrder: index,
      }))
    )
    .returning();
}

export async function getDocumentById(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = await db
    .select()
    .from(tardisDocuments)
    .innerJoin(tardisNotebooks, eq(tardisNotebooks.id, tardisDocuments.notebookId))
    .innerJoin(tardisNotebookGroups, eq(tardisNotebookGroups.id, tardisNotebooks.groupId))
    .where(and(eq(tardisDocuments.id, id), eq(tardisNotebookGroups.userId, userId)))
    .limit(1);

  const document = rows[0]?.tardis_documents;
  if (!document) return null;

  const sections = await db
    .select()
    .from(tardisSections)
    .where(eq(tardisSections.documentId, document.id))
    .orderBy(asc(tardisSections.sortOrder), asc(tardisSections.id));

  const blocks = await db
    .select()
    .from(tardisBlocks)
    .where(eq(tardisBlocks.documentId, document.id))
    .orderBy(asc(tardisBlocks.sortOrder), asc(tardisBlocks.id));

  const incomingLinks = await db
    .select()
    .from(tardisDocumentLinks)
    .where(eq(tardisDocumentLinks.toDocumentId, document.id))
    .orderBy(asc(tardisDocumentLinks.sortOrder), asc(tardisDocumentLinks.id));

  const outgoingLinks = await db
    .select()
    .from(tardisDocumentLinks)
    .where(eq(tardisDocumentLinks.fromDocumentId, document.id))
    .orderBy(asc(tardisDocumentLinks.sortOrder), asc(tardisDocumentLinks.id));

  const linkedDocumentIds = new Set([
    ...incomingLinks.map(link => link.fromDocumentId),
    ...outgoingLinks.map(link => link.toDocumentId),
  ]);
  const linkedDocumentsById = new Map(
    (
      linkedDocumentIds.size > 0
        ? await db
            .select()
            .from(tardisDocuments)
            .where(inArray(tardisDocuments.id, Array.from(linkedDocumentIds)))
        : []
    ).map(item => [item.id, item])
  );

  return {
    ...document,
    sections: sections.map(section => ({
      ...section,
      blocks: blocks.filter(block => block.sectionId === section.id),
    })),
    incomingLinks: incomingLinks
      .map(link => ({
        ...link,
        fromDocument: linkedDocumentsById.get(link.fromDocumentId) ?? null,
      }))
      .filter(link => link.fromDocument),
    outgoingLinks: outgoingLinks
      .map(link => ({
        ...link,
        toDocument: linkedDocumentsById.get(link.toDocumentId) ?? null,
      }))
      .filter(link => link.toDocument),
  };
}

export async function updateDocumentTitle(id: number, title: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [document] = await db
    .update(tardisDocuments)
    .set({ title, updatedAt: new Date() })
    .where(eq(tardisDocuments.id, id))
    .returning();

  return document;
}

export async function createBlock(data: typeof tardisBlocks.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [{ value: currentMax }] = await db
    .select({ value: max(tardisBlocks.sortOrder) })
    .from(tardisBlocks)
    .where(eq(tardisBlocks.sectionId, data.sectionId));

  const [block] = await db
    .insert(tardisBlocks)
    .values({
      ...data,
      sortOrder: (currentMax ?? -1) + 1,
    })
    .returning();

  return block;
}

export async function updateBlock(id: number, data: Partial<typeof tardisBlocks.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [block] = await db
    .update(tardisBlocks)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(tardisBlocks.id, id))
    .returning();

  return block;
}

export async function deleteBlock(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.delete(tardisBlocks).where(eq(tardisBlocks.id, id));
  return { success: true } as const;
}

export async function findDocumentsByPeriod(input: {
  userId: number;
  notebookId: number;
  documentType: string;
  periodYear: number;
  periodWeek?: number | null;
  periodMonth?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const weekCondition =
    input.periodWeek === undefined
      ? sql`true`
      : input.periodWeek == null
        ? isNull(tardisDocuments.periodWeek)
        : eq(tardisDocuments.periodWeek, input.periodWeek);
  const monthCondition =
    input.periodMonth === undefined
      ? sql`true`
      : input.periodMonth == null
        ? isNull(tardisDocuments.periodMonth)
        : eq(tardisDocuments.periodMonth, input.periodMonth);

  const rows = await db
    .select()
    .from(tardisDocuments)
    .innerJoin(tardisNotebooks, eq(tardisNotebooks.id, tardisDocuments.notebookId))
    .innerJoin(tardisNotebookGroups, eq(tardisNotebookGroups.id, tardisNotebooks.groupId))
    .where(
      and(
        eq(tardisNotebookGroups.userId, input.userId),
        eq(tardisDocuments.notebookId, input.notebookId),
        eq(tardisDocuments.documentType, input.documentType),
        eq(tardisDocuments.periodYear, input.periodYear),
        monthCondition,
        weekCondition
      )
    )
    .orderBy(asc(tardisDocuments.periodDate), asc(tardisDocuments.id));

  return rows.map(row => row.tardis_documents);
}

export async function createDocumentLinks(
  links: Array<{ fromDocumentId: number; toDocumentId: number; linkType: string }>
) {
  if (links.length === 0) return [];

  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  return db
    .insert(tardisDocumentLinks)
    .values(
      links.map((link, index) => ({
        ...link,
        sortOrder: index,
      }))
    )
    .returning();
}
