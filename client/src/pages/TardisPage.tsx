import { CreateTardisEntityDialog } from "@/components/tardis/CreateTardisEntityDialog";
import { TardisSidebar } from "@/components/tardis/TardisSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { TardisDocumentType } from "@shared/tardis";
import {
  BookOpenText,
  CalendarDays,
  CalendarRange,
  Compass,
  LayoutTemplate,
  Target,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type DialogState =
  | { mode: "group" }
  | { mode: "notebook"; groupId: number }
  | { mode: "document"; notebookId: number }
  | null;

type OverviewLevel = {
  key: TardisDocumentType;
  title: string;
  description: string;
  count: number;
  accent: string;
  icon: typeof BookOpenText;
};

type LatestDocument = {
  id: number;
  title: string;
  documentType: TardisDocumentType;
  periodDate: string | null;
  createdAt: Date;
};

const overviewOrder: TardisDocumentType[] = [
  "strategy",
  "tactics",
  "daily_tt",
  "weekly_nr",
  "monthly_mr",
  "yearly_yr",
  "custom_note",
];

const overviewMeta: Record<TardisDocumentType, Omit<OverviewLevel, "count">> = {
  strategy: {
    key: "strategy",
    title: "Strategy",
    description: "Верхняя рамка смысла, фокуса и принципов.",
    accent: "border-violet-400/30 bg-violet-500/10 text-violet-200",
    icon: Compass,
  },
  tactics: {
    key: "tactics",
    title: "Tactics",
    description: "Направления, фронты и рабочее пространство движения.",
    accent: "border-rose-400/30 bg-rose-500/10 text-rose-200",
    icon: Target,
  },
  daily_tt: {
    key: "daily_tt",
    title: "Daily TT",
    description: "Ежедневный исполнительный слой.",
    accent: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    icon: CalendarDays,
  },
  weekly_nr: {
    key: "weekly_nr",
    title: "Weekly NR",
    description: "Недельное регулирование и сборка дневного слоя.",
    accent: "border-amber-400/30 bg-amber-500/10 text-amber-200",
    icon: LayoutTemplate,
  },
  monthly_mr: {
    key: "monthly_mr",
    title: "Monthly MR",
    description: "Месячная сводка и управленческая коррекция.",
    accent: "border-sky-400/30 bg-sky-500/10 text-sky-200",
    icon: CalendarRange,
  },
  yearly_yr: {
    key: "yearly_yr",
    title: "Yearly YR",
    description: "Годовой итог и база следующего цикла.",
    accent: "border-yellow-400/30 bg-yellow-500/10 text-yellow-200",
    icon: Trophy,
  },
  custom_note: {
    key: "custom_note",
    title: "Свободные заметки",
    description: "Свободные заметки-конструкторы и рабочие страницы.",
    accent: "border-primary/30 bg-primary/10 text-primary",
    icon: BookOpenText,
  },
};

export default function TardisPage() {
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

  const overview = useMemo(() => {
    const documents = treeQuery.data?.flatMap(group => group.notebooks.flatMap(notebook => notebook.documents)) ?? [];
    const counts = new Map<TardisDocumentType, number>();
    const latestByType = new Map<TardisDocumentType, LatestDocument>();

    for (const document of documents) {
      const key = document.documentType as TardisDocumentType;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const currentLatest = latestByType.get(key);
      if (
        !currentLatest ||
        (document.periodDate ?? "") > (currentLatest.periodDate ?? "") ||
        (document.periodDate === currentLatest.periodDate && document.createdAt > currentLatest.createdAt)
      ) {
        latestByType.set(key, document as LatestDocument);
      }
    }

    const levels: OverviewLevel[] = overviewOrder.map(key => ({
      ...overviewMeta[key],
      count: counts.get(key) ?? 0,
    }));

    return {
      groups: treeQuery.data?.length ?? 0,
      notebooks: treeQuery.data?.reduce((sum, group) => sum + group.notebooks.length, 0) ?? 0,
      documents: documents.length,
      levels,
      flowCoverage: levels.filter(level => level.key !== "custom_note" && level.count > 0).length,
      latestDocuments: overviewOrder
        .map(key => latestByType.get(key))
        .filter((document): document is LatestDocument => Boolean(document)),
    };
  }, [treeQuery.data]);

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
        onOpenDocument={documentId => setLocation(`/tardis/doc/${documentId}`)}
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Tardis Phase 1</div>
            <h1 className="text-3xl font-semibold tracking-tight">Панель архитектурного контура Tardis</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Здесь уже виден не просто набор документов, а живой скелет системы: верхний контур,
              периодные слои и свободные заметки-конструкторы.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Группы и блокноты</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div>Групп блокнотов: {overview.groups}</div>
                <div>Блокнотов: {overview.notebooks}</div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Документы</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div>Всего документов: {overview.documents}</div>
                <div>Свободных заметок: {overview.levels.find(level => level.key === "custom_note")?.count ?? 0}</div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Покрытие контура</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div>Системных уровней заполнено: {overview.flowCoverage} / 6</div>
                <div>Цепочка: Strategy → Tactics → TT → NR → MR → YR</div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Ближайший фокус</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div>Усиливаем обзор и управляемость слоёв.</div>
                <div>Следом можно переходить к агрегатам и dashboard-блокам.</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
            {overview.levels.map(level => {
              const Icon = level.icon;
              return (
                <Card key={level.key} className="border-border/70">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="h-4 w-4" />
                      {level.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-medium", level.accent)}>
                      {level.count} шт.
                    </div>
                    <div className="text-sm text-muted-foreground">{level.description}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Состояние потока</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              {overview.levels
                .filter(level => level.key !== "custom_note")
                .map(level => (
                  <div
                    key={level.key}
                    className={cn(
                      "rounded-2xl border px-4 py-3",
                      level.count > 0
                        ? "border-emerald-400/30 bg-emerald-500/10"
                        : "border-border/70 bg-background/60"
                    )}
                  >
                    <div className="text-sm font-medium">{level.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {level.count > 0 ? "Слой уже существует в системе" : "Слой пока ещё пуст"}
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Последние документы по уровням</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {overview.latestDocuments.length > 0 ? (
                overview.latestDocuments.map(document => (
                  <button
                    key={document.id}
                    type="button"
                    onClick={() => setLocation(`/tardis/doc/${document.id}`)}
                    className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                  >
                    <div className="text-sm font-medium">{document.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {overviewMeta[document.documentType].title}
                      {document.periodDate ? ` • ${document.periodDate}` : ""}
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">Пока нет документов для обзора.</div>
              )}
            </CardContent>
          </Card>

          <Card className="border-dashed border-border/70 bg-card/50">
            <CardHeader>
              <CardTitle className="text-base">Следующий шаг</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Создай первую группу и блокнот, а дальше уже можно собирать `Свободную заметку`, поднимать `Strategy`,
                или сразу запускать первый `TT` и выращивать цепочку уровней через дерево слева.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => setDialog({ mode: "group" })}>Создать группу</Button>
                {treeQuery.data?.[0] ? (
                  <Button variant="outline" onClick={() => setDialog({ mode: "notebook", groupId: treeQuery.data[0].id })}>
                    Создать блокнот
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
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
