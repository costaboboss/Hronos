import {
  createBlockInputSchema,
  createDocumentInputSchema,
  createDocumentLinkInputSchema,
  createNotebookGroupInputSchema,
  createNotebookInputSchema,
  updateBlockInputSchema,
  updateDocumentTitleInputSchema,
} from "@shared/tardis";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { deleteBlock } from "./repository";
import {
  addBlock,
  createGroup,
  createUserDocument,
  createUserNotebook,
  createManualDocumentLink,
  getNotebookTree,
  getUserDocument,
  renameDocument,
  updateUserBlock,
} from "./service";

export const tardisRouter = router({
  listTree: protectedProcedure.query(({ ctx }) => getNotebookTree(ctx.user.id)),

  createGroup: protectedProcedure
    .input(createNotebookGroupInputSchema)
    .mutation(({ ctx, input }) => createGroup(ctx.user.id, input.title)),

  createNotebook: protectedProcedure
    .input(createNotebookInputSchema)
    .mutation(({ input }) => createUserNotebook(input.groupId, input.title)),

  createDocument: protectedProcedure
    .input(createDocumentInputSchema)
    .mutation(({ ctx, input }) => createUserDocument({ ...input, userId: ctx.user.id })),

  getDocument: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => getUserDocument(ctx.user.id, input.id)),

  updateDocumentTitle: protectedProcedure
    .input(updateDocumentTitleInputSchema)
    .mutation(({ ctx, input }) => renameDocument(ctx.user.id, input.id, input.title)),

  createBlock: protectedProcedure
    .input(createBlockInputSchema)
    .mutation(({ input }) => addBlock(input)),

  updateBlock: protectedProcedure
    .input(updateBlockInputSchema)
    .mutation(({ input }) => updateUserBlock(input)),

  createDocumentLink: protectedProcedure
    .input(createDocumentLinkInputSchema)
    .mutation(({ ctx, input }) => createManualDocumentLink({ ...input, userId: ctx.user.id })),

  deleteBlock: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => deleteBlock(input.id)),
});
