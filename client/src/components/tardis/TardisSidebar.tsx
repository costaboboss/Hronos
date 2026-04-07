import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import {
  BookOpen,
  CalendarDays,
  Compass,
  FileText,
  FolderOpen,
  Plus,
  Target,
  Trophy,
} from "lucide-react";
import type { AppRouter } from "../../../../server/routers";

type NotebookTree = inferRouterOutputs<AppRouter>["tardis"]["listTree"];
type NotebookGroup = NotebookTree[number];
type Notebook = NotebookGroup["notebooks"][number];
type NotebookDocument = Notebook["documents"][number];

type TardisSidebarProps = {
  tree: NotebookTree;
  activeDocumentId?: number;
  onCreateGroup: () => void;
  onCreateNotebook: (groupId: number) => void;
  onCreateDocument: (notebookId: number) => void;
  onCreateChildDocument: (
    documentId: number,
    notebookId: number,
    documentType: string,
    title: string,
    periodDate?: string | null
  ) => void;
  onOpenDocument: (documentId: number) => void;
};

function getDocumentTypeLabel(documentType: string) {
  switch (documentType) {
    case "custom_note":
      return "Свободные заметки";
    case "daily_tt":
      return "Daily TT";
    case "weekly_nr":
      return "Weekly NR";
    case "monthly_mr":
      return "Monthly MR";
    case "yearly_yr":
      return "Yearly YR";
    case "strategy":
      return "Strategy";
    case "tactics":
      return "Tactics";
    default:
      return documentType;
  }
}

function getDocumentTypeOrder(documentType: string) {
  switch (documentType) {
    case "strategy":
      return 0;
    case "tactics":
      return 1;
    case "daily_tt":
      return 2;
    case "weekly_nr":
      return 3;
    case "monthly_mr":
      return 4;
    case "yearly_yr":
      return 5;
    case "custom_note":
      return 6;
    default:
      return 99;
  }
}

function getDocumentTypeBadge(documentType: string) {
  switch (documentType) {
    case "strategy":
      return {
        label: "Strategy",
        className: "border-violet-400/30 bg-violet-500/15 text-violet-300",
        icon: Compass,
      };
    case "tactics":
      return {
        label: "Tactics",
        className: "border-rose-400/30 bg-rose-500/15 text-rose-300",
        icon: Target,
      };
    case "daily_tt":
      return {
        label: "TT",
        className: "border-emerald-400/30 bg-emerald-500/15 text-emerald-300",
        icon: CalendarDays,
      };
    case "weekly_nr":
      return {
        label: "NR",
        className: "border-amber-400/30 bg-amber-500/15 text-amber-300",
        icon: CalendarDays,
      };
    case "monthly_mr":
      return {
        label: "MR",
        className: "border-sky-400/30 bg-sky-500/15 text-sky-300",
        icon: CalendarDays,
      };
    case "yearly_yr":
      return {
        label: "YR",
        className: "border-yellow-400/30 bg-yellow-500/15 text-yellow-300",
        icon: Trophy,
      };
    default:
      return {
        label: "Custom",
        className: "border-primary/30 bg-primary/15 text-primary",
        icon: FileText,
      };
  }
}

function getSuggestedChild(documentType: string) {
  switch (documentType) {
    case "strategy":
      return { documentType: "tactics", title: "Новая Tactics" };
    case "tactics":
      return { documentType: "daily_tt", title: "Новый TT" };
    case "daily_tt":
      return { documentType: "weekly_nr", title: "Новый NR" };
    case "weekly_nr":
      return { documentType: "monthly_mr", title: "Новый MR" };
    case "monthly_mr":
      return { documentType: "yearly_yr", title: "Новый YR" };
    default:
      return null;
  }
}

function sortDocuments(documents: NotebookDocument[]) {
  return [...documents].sort((left, right) => {
    const orderDelta = getDocumentTypeOrder(left.documentType) - getDocumentTypeOrder(right.documentType);
    if (orderDelta !== 0) return orderDelta;
    if (left.periodDate && right.periodDate && left.periodDate !== right.periodDate) {
      return right.periodDate.localeCompare(left.periodDate);
    }
    if (left.periodDate && !right.periodDate) return -1;
    if (!left.periodDate && right.periodDate) return 1;
    return left.title.localeCompare(right.title, "ru");
  });
}

function groupDocumentsByType(documents: NotebookDocument[]) {
  const grouped = new Map<string, NotebookDocument[]>();

  for (const document of sortDocuments(documents)) {
    const currentGroup = grouped.get(document.documentType) ?? [];
    currentGroup.push(document);
    grouped.set(document.documentType, currentGroup);
  }

  return Array.from(grouped.entries()).sort(
    ([leftType], [rightType]) => getDocumentTypeOrder(leftType) - getDocumentTypeOrder(rightType)
  );
}

export function TardisSidebar({
  tree,
  activeDocumentId,
  onCreateGroup,
  onCreateNotebook,
  onCreateDocument,
  onCreateChildDocument,
  onOpenDocument,
}: TardisSidebarProps) {
  return (
    <aside className="w-88 border-r border-border/60 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Tardis</div>
          <div className="text-xs text-muted-foreground">Группы, блокноты, уровни и переходы</div>
        </div>
        <Button size="sm" onClick={onCreateGroup}>
          <Plus className="mr-1 h-4 w-4" />
          Группа
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-8.5rem)]">
        <div className="space-y-4 p-3">
          {tree.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
              Пока пусто. Создай первую группу блокнотов и начни собирать ядро Tardis.
            </div>
          ) : null}

          {tree.map((group: NotebookGroup) => (
            <div key={group.id} className="rounded-2xl border border-border/70 bg-background/80 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <FolderOpen className="h-4 w-4 text-primary" />
                    <span className="truncate">{group.title}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{group.notebooks.length} блокнотов</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onCreateNotebook(group.id)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Блокнот
                </Button>
              </div>

              <div className="mt-3 space-y-3">
                {group.notebooks.map((notebook: Notebook) => (
                  <div key={notebook.id} className="rounded-xl border border-border/60 bg-card/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <BookOpen className="h-4 w-4 text-amber-400" />
                          <span className="truncate">{notebook.title}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{notebook.documents.length} документов</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => onCreateDocument(notebook.id)}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Документ
                      </Button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {groupDocumentsByType(notebook.documents).map(([documentType, documents]) => (
                        <div key={documentType} className="space-y-2">
                          <div className="flex items-center justify-between gap-2 px-1">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {getDocumentTypeLabel(documentType)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">{documents.length}</div>
                          </div>

                          <div className="space-y-2">
                            {documents.map((document: NotebookDocument) => {
                              const badge = getDocumentTypeBadge(document.documentType);
                              const Icon = badge.icon;
                              const suggestion = getSuggestedChild(document.documentType);

                              return (
                                <div
                                  key={document.id}
                                  className={cn(
                                    "rounded-lg border border-transparent px-2 py-2 transition-colors",
                                    activeDocumentId === document.id
                                      ? "border-primary/30 bg-primary/10"
                                      : "hover:border-border/60 hover:bg-accent/40"
                                  )}
                                >
                                  <button
                                    type="button"
                                    onClick={() => onOpenDocument(document.id)}
                                    className="flex w-full items-center gap-2 text-left text-sm"
                                  >
                                    <FileText className="h-4 w-4 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate font-medium">{document.title}</div>
                                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <span
                                          className={cn(
                                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                            badge.className
                                          )}
                                        >
                                          <Icon className="h-3 w-3" />
                                          {badge.label}
                                        </span>
                                        {document.periodDate ? (
                                          <span className="text-xs text-muted-foreground">{document.periodDate}</span>
                                        ) : null}
                                      </div>
                                    </div>
                                  </button>

                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-muted-foreground">
                                      {getDocumentTypeLabel(document.documentType)}
                                    </span>
                                    {suggestion ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs"
                                        onClick={() =>
                                            onCreateChildDocument(
                                              document.id,
                                              notebook.id,
                                              suggestion.documentType,
                                              suggestion.title,
                                              document.periodDate
                                            )
                                          }
                                      >
                                        <Plus className="mr-1 h-3 w-3" />
                                        Следующий слой
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {notebook.documents.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                          Добавь сюда `Свободную заметку` или один из системных уровней.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
