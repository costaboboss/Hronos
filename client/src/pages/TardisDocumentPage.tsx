import { CreateTardisEntityDialog } from "@/components/tardis/CreateTardisEntityDialog";
import { TardisDocumentView } from "@/components/tardis/TardisDocumentView";
import { TardisSidebar } from "@/components/tardis/TardisSidebar";
import { trpc } from "@/lib/trpc";
import type { TardisDocumentType } from "@shared/tardis";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

type DialogState =
  | { mode: "group" }
  | { mode: "notebook"; groupId: number }
  | { mode: "document"; notebookId: number }
  | null;

export default function TardisDocumentPage() {
  const [, params] = useRoute("/tardis/doc/:id");
  const documentId = Number(params?.id);
  const [location, setLocation] = useLocation();
  const activeDocumentId = location.startsWith("/tardis/doc/") ? Number(location.replace("/tardis/doc/", "")) : undefined;
  const treeQuery = trpc.tardis.listTree.useQuery();
  const utils = trpc.useUtils();
  const createGroup = trpc.tardis.createGroup.useMutation({
    onSuccess: () => utils.tardis.listTree.invalidate(),
  });
  const createNotebook = trpc.tardis.createNotebook.useMutation({
    onSuccess: () => utils.tardis.listTree.invalidate(),
  });
  const createDocument = trpc.tardis.createDocument.useMutation({
    onSuccess: async document => {
      await utils.tardis.listTree.invalidate();
      setLocation(`/tardis/doc/${document.id}`);
    },
  });

  const [dialog, setDialog] = useState<DialogState>(null);

  async function handleDialogSubmit(payload: { title: string; documentType?: TardisDocumentType; periodDate?: string }) {
    if (!dialog) return;
    if (dialog.mode === "group") {
      await createGroup.mutateAsync({ title: payload.title });
      toast.success("Группа создана");
      return;
    }
    if (dialog.mode === "notebook") {
      await createNotebook.mutateAsync({ groupId: dialog.groupId, title: payload.title });
      toast.success("Блокнот создан");
      return;
    }
    await createDocument.mutateAsync({
      notebookId: dialog.notebookId,
      title: payload.title,
      documentType: payload.documentType ?? "custom_note",
      periodDate: payload.periodDate,
    });
    toast.success("Документ создан");
  }

  return (
    <div className="flex h-full bg-background">
      <TardisSidebar
        tree={treeQuery.data ?? []}
        activeDocumentId={activeDocumentId}
        onCreateGroup={() => setDialog({ mode: "group" })}
        onCreateNotebook={groupId => setDialog({ mode: "notebook", groupId })}
        onCreateDocument={notebookId => setDialog({ mode: "document", notebookId })}
        onCreateChildDocument={async (_documentId, notebookId, documentType, title, periodDate) => {
          await createDocument.mutateAsync({
            notebookId,
            title,
            documentType: documentType as TardisDocumentType,
            periodDate: periodDate ?? undefined,
          });
          toast.success("Следующий слой создан");
        }}
        onOpenDocument={nextDocumentId => setLocation(`/tardis/doc/${nextDocumentId}`)}
      />

      <div className="flex-1 overflow-hidden">
        {Number.isFinite(documentId) ? (
          <TardisDocumentView documentId={documentId} />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Документ не найден.</div>
        )}
      </div>

      <CreateTardisEntityDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "group"}
        title={
          dialog?.mode === "group"
            ? "Новая группа блокнотов"
            : dialog?.mode === "notebook"
              ? "Новый блокнот"
              : "Новый документ"
        }
        onClose={() => setDialog(null)}
        onSubmit={handleDialogSubmit}
      />
    </div>
  );
}
