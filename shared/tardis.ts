import { z } from "zod";

export const tardisDocumentTypeSchema = z.enum([
  "custom_note",
  "daily_tt",
  "weekly_nr",
  "strategy",
  "tactics",
  "monthly_mr",
  "yearly_yr",
]);

export const tardisDocumentModeSchema = z.enum(["typed", "custom"]);
export const tardisBlockTypeSchema = z.enum(["text", "checklist", "table", "summary", "linked_summary"]);

export const createNotebookGroupInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const createNotebookInputSchema = z.object({
  groupId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
});

export const createDocumentInputSchema = z.object({
  notebookId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  documentType: tardisDocumentTypeSchema,
  periodDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const updateDocumentTitleInputSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
});

export const createBlockInputSchema = z.object({
  documentId: z.number().int().positive(),
  sectionId: z.number().int().positive(),
  blockType: tardisBlockTypeSchema,
  title: z.string().trim().max(200).optional(),
});

export const updateBlockInputSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().max(200).nullable().optional(),
  contentJson: z.record(z.string(), z.unknown()),
});

export const createDocumentLinkInputSchema = z.object({
  fromDocumentId: z.number().int().positive(),
  toDocumentId: z.number().int().positive(),
  linkType: z.string().trim().min(1).max(64),
});

export type TardisDocumentType = z.infer<typeof tardisDocumentTypeSchema>;
export type TardisDocumentMode = z.infer<typeof tardisDocumentModeSchema>;
export type TardisBlockType = z.infer<typeof tardisBlockTypeSchema>;
