import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../../server/routers";
import { useLocation } from "wouter";

type TardisDocumentViewProps = {
  documentId: number;
};

type BlockDraft = {
  title: string;
  contentJson: Record<string, unknown>;
};

type LinkDirection = "incoming" | "outgoing";
type TardisDocumentDetails = NonNullable<inferRouterOutputs<AppRouter>["tardis"]["getDocument"]>;
type LinkedDocumentRef =
  | TardisDocumentDetails["incomingLinks"][number]["fromDocument"]
  | TardisDocumentDetails["outgoingLinks"][number]["toDocument"];
type LinkedSummaryItem = {
  id: number;
  linkType: string;
  document: LinkedDocumentRef;
};

type QuickPreset = {
  label: string;
  blockType: "text" | "checklist" | "table" | "summary" | "linked_summary";
  title: string;
  contentJson?: Record<string, unknown>;
};

function getDocumentTypeLabel(documentType: string) {
  switch (documentType) {
    case "custom_note":
      return "Custom Note";
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

function getDocumentTypeBadgeClass(documentType: string) {
  switch (documentType) {
    case "strategy":
      return "border-violet-400/30 bg-violet-500/15 text-violet-300";
    case "tactics":
      return "border-rose-400/30 bg-rose-500/15 text-rose-300";
    case "daily_tt":
      return "border-emerald-400/30 bg-emerald-500/15 text-emerald-300";
    case "weekly_nr":
      return "border-amber-400/30 bg-amber-500/15 text-amber-300";
    case "monthly_mr":
      return "border-sky-400/30 bg-sky-500/15 text-sky-300";
    case "yearly_yr":
      return "border-yellow-400/30 bg-yellow-500/15 text-yellow-300";
    default:
      return "border-primary/30 bg-primary/15 text-primary";
  }
}

function getDocumentRoleHint(documentType: string) {
  switch (documentType) {
    case "strategy":
      return "Верхний смысловой слой и рамка года.";
    case "tactics":
      return "Рабочее пространство направлений, фронтов и проектов.";
    case "daily_tt":
      return "Ежедневный исполнительный слой.";
    case "weekly_nr":
      return "Недельное регулирование и сборка TT.";
    case "monthly_mr":
      return "Месячная сводка и регулирование.";
    case "yearly_yr":
      return "Годовой итог и база следующего цикла.";
    default:
      return "Свободный конструктор заметок и рабочих страниц.";
  }
}

function getFlowLine(documentType: string) {
  switch (documentType) {
    case "strategy":
      return "Strategy -> Tactics -> TT -> NR -> MR -> YR";
    case "tactics":
      return "Strategy -> Tactics -> TT -> NR -> MR -> YR";
    case "daily_tt":
      return "TT -> NR -> MR -> YR";
    case "weekly_nr":
      return "NR -> MR -> YR";
    case "monthly_mr":
      return "MR -> YR";
    case "yearly_yr":
      return "YR";
    default:
      return "Custom Note внутри общего графа Tardis";
  }
}

function stringifyTable(contentJson: Record<string, unknown>) {
  const columns = Array.isArray(contentJson.columns) ? contentJson.columns : [];
  const rows = Array.isArray(contentJson.rows) ? contentJson.rows : [];
  return JSON.stringify({ columns, rows }, null, 2);
}

function getLinkedDocumentsForSummary(document: TardisDocumentDetails, contentJson: Record<string, unknown>) {
  const direction = (contentJson.direction as LinkDirection | undefined) ?? "incoming";
  const linkType = typeof contentJson.linkType === "string" ? contentJson.linkType : "";
  const documentTypeFilter =
    typeof contentJson.documentTypeFilter === "string" ? contentJson.documentTypeFilter : "";

  const normalizedLinks: LinkedSummaryItem[] =
    direction === "incoming"
      ? (document.incomingLinks ?? []).map(link => ({
          id: link.id,
          linkType: link.linkType,
          document: link.fromDocument,
        }))
      : (document.outgoingLinks ?? []).map(link => ({
          id: link.id,
          linkType: link.linkType,
          document: link.toDocument,
        }));

  return normalizedLinks.filter(link => {
    if (linkType && link.linkType !== linkType) return false;
    if (!documentTypeFilter) return true;
    return link.document?.documentType === documentTypeFilter;
  });
}

function groupLinkedDocuments(items: LinkedSummaryItem[]) {
  const groups = new Map<string, LinkedSummaryItem[]>();

  for (const item of items) {
    const key = item.document?.documentType ?? "unknown";
    const currentItems = groups.get(key) ?? [];
    currentItems.push(item);
    groups.set(key, currentItems);
  }

  return Array.from(groups.entries()).sort(([leftType], [rightType]) =>
    getDocumentTypeLabel(leftType).localeCompare(getDocumentTypeLabel(rightType), "ru")
  );
}

function buildLinkedSummaryStats(items: LinkedSummaryItem[]) {
  const grouped = groupLinkedDocuments(items);
  const periodDates = items
    .map(item => item.document?.periodDate)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left));

  return {
    total: items.length,
    grouped,
    withPeriod: periodDates.length,
    latestPeriod: periodDates[0] ?? null,
    earliestPeriod: periodDates[periodDates.length - 1] ?? null,
  };
}

function getPrimaryAggregateConfig(documentType: string) {
  switch (documentType) {
    case "weekly_nr":
      return {
        title: "TT поток недели",
        linkType: "daily_to_weekly",
        documentTypeFilter: "daily_tt",
      };
    case "monthly_mr":
      return {
        title: "NR поток месяца",
        linkType: "weekly_to_monthly",
        documentTypeFilter: "weekly_nr",
      };
    case "yearly_yr":
      return {
        title: "MR поток года",
        linkType: "monthly_to_yearly",
        documentTypeFilter: "monthly_mr",
      };
    case "tactics":
      return {
        title: "Strategy контекст",
        linkType: "strategy_to_tactics",
        documentTypeFilter: "strategy",
      };
    default:
      return null;
  }
}

function buildSectionStats(section: TardisDocumentDetails["sections"][number]) {
  let checklistItems = 0;
  let checkedItems = 0;

  for (const block of section.blocks) {
    if (block.blockType !== "checklist") continue;
    const items = Array.isArray(block.contentJson?.items) ? block.contentJson.items : [];
    checklistItems += items.length;
    checkedItems += items.filter(
      item => typeof item === "object" && item !== null && "checked" in item && Boolean((item as { checked?: boolean }).checked)
    ).length;
  }

  return {
    blocks: section.blocks.length,
    checklistItems,
    checkedItems,
    completionPercent: checklistItems > 0 ? Math.round((checkedItems / checklistItems) * 100) : null,
  };
}

function getQuickPresets(documentType: string, sectionKey: string): QuickPreset[] {
  if (documentType === "daily_tt") {
    switch (sectionKey) {
      case "incoming":
        return [{ label: "Входящий список", blockType: "checklist", title: "Входящее" }];
      case "tasks":
        return [{ label: "Топ-3 задачи", blockType: "checklist", title: "Топ-3 задачи дня" }];
      case "insights":
        return [{ label: "Инсайт", blockType: "text", title: "Инсайт дня" }];
      case "results":
        return [{ label: "Итог дня", blockType: "summary", title: "Итог дня" }];
      default:
        return [];
    }
  }

  if (documentType === "weekly_nr") {
    switch (sectionKey) {
      case "weekly_overview":
        return [{ label: "Weekly summary", blockType: "summary", title: "Сводка недели" }];
      case "metrics":
        return [{ label: "Метрики", blockType: "table", title: "Метрики недели" }];
      case "wins":
        return [{ label: "Победы", blockType: "text", title: "Победы недели" }];
      case "problems":
        return [{ label: "Проблемы", blockType: "text", title: "Проблемы недели" }];
      default:
        return [];
    }
  }

  if (documentType === "monthly_mr") {
    switch (sectionKey) {
      case "monthly_overview":
        return [{ label: "Monthly summary", blockType: "summary", title: "Сводка месяца" }];
      case "metrics_summary":
        return [{ label: "Метрики", blockType: "table", title: "Метрики месяца" }];
      case "risks":
        return [{ label: "Риски", blockType: "text", title: "Риски месяца" }];
      default:
        return [];
    }
  }

  if (documentType === "yearly_yr") {
    switch (sectionKey) {
      case "year_results":
        return [{ label: "Year summary", blockType: "summary", title: "Сводка года" }];
      case "sphere_review":
        return [{ label: "Сферы", blockType: "table", title: "Обзор сфер" }];
      case "main_insights":
        return [{ label: "Выводы", blockType: "text", title: "Главные выводы" }];
      default:
        return [];
    }
  }

  if (documentType === "strategy") {
    switch (sectionKey) {
      case "strategic_goals":
        return [{ label: "Цели", blockType: "checklist", title: "Стратегические цели" }];
      case "constraints":
        return [{ label: "Ограничения", blockType: "text", title: "Ограничения" }];
      default:
        return [];
    }
  }

  if (documentType === "tactics") {
    switch (sectionKey) {
      case "projects":
        return [{ label: "Проекты", blockType: "checklist", title: "Активные проекты" }];
      case "backlog":
        return [{ label: "Backlog", blockType: "checklist", title: "Тактический backlog" }];
      default:
        return [];
    }
  }

  return [];
}

export function TardisDocumentView({ documentId }: TardisDocumentViewProps) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const documentQuery = trpc.tardis.getDocument.useQuery({ id: documentId });
  const treeQuery = trpc.tardis.listTree.useQuery();
  const updateTitle = trpc.tardis.updateDocumentTitle.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.tardis.getDocument.invalidate({ id: documentId }),
        utils.tardis.listTree.invalidate(),
      ]);
    },
  });
  const createBlock = trpc.tardis.createBlock.useMutation({
    onSuccess: async () => {
      await utils.tardis.getDocument.invalidate({ id: documentId });
    },
  });
  const updateBlock = trpc.tardis.updateBlock.useMutation({
    onSuccess: async () => {
      await utils.tardis.getDocument.invalidate({ id: documentId });
    },
  });
  const deleteBlock = trpc.tardis.deleteBlock.useMutation({
    onSuccess: async () => {
      await utils.tardis.getDocument.invalidate({ id: documentId });
    },
  });
  const createDocumentLink = trpc.tardis.createDocumentLink.useMutation({
    onSuccess: async () => {
      await utils.tardis.getDocument.invalidate({ id: documentId });
    },
  });
  const createDocument = trpc.tardis.createDocument.useMutation({
    onSuccess: async nextDocument => {
      await utils.tardis.listTree.invalidate();
      setLocation(`/tardis/doc/${nextDocument.id}`);
    },
  });

  const document = documentQuery.data;
  const [title, setTitle] = useState("");
  const [drafts, setDrafts] = useState<Record<number, BlockDraft>>({});
  const [selectedLinkTarget, setSelectedLinkTarget] = useState<string>("");
  const [selectedLinkType, setSelectedLinkType] = useState("related");

  useEffect(() => {
    if (!document) return;
    setTitle(document.title);
    const nextDrafts: Record<number, BlockDraft> = {};
    for (const section of document.sections) {
      for (const block of section.blocks) {
        nextDrafts[block.id] = {
          title: block.title ?? "",
          contentJson: block.contentJson ?? {},
        };
      }
    }
    setDrafts(nextDrafts);
  }, [document]);

  const availableLinkTargets = useMemo(
    () =>
      treeQuery.data?.flatMap(group =>
        group.notebooks.flatMap(notebook => notebook.documents.filter(candidate => candidate.id !== documentId))
      ) ?? [],
    [documentId, treeQuery.data]
  );
  const linkedSummaryDashboard = useMemo(
    () =>
      document
        ? document.sections.flatMap(section =>
            section.blocks
              .filter(block => block.blockType === "linked_summary")
              .map(block => ({
                id: block.id,
                sectionTitle: section.title,
                title: block.title ?? "Linked Summary",
                stats: buildLinkedSummaryStats(getLinkedDocumentsForSummary(document, block.contentJson ?? {})),
              }))
          )
        : [],
    [document]
  );
  const sectionDashboard = useMemo(
    () =>
      document
        ? document.sections.map(section => ({
            id: section.id,
            title: section.title,
            sectionKey: section.sectionKey,
            stats: buildSectionStats(section),
          }))
        : [],
    [document]
  );

  if (documentQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Загрузка документа...</div>;
  }

  if (!document) {
    return <div className="p-6 text-sm text-muted-foreground">Документ не найден.</div>;
  }

  const currentDocument = document;

  const normalizedIncomingLinks: LinkedSummaryItem[] = (document.incomingLinks ?? []).map(link => ({
    id: link.id,
    linkType: link.linkType,
    document: link.fromDocument,
  }));
  const normalizedOutgoingLinks: LinkedSummaryItem[] = (document.outgoingLinks ?? []).map(link => ({
    id: link.id,
    linkType: link.linkType,
    document: link.toDocument,
  }));
  const primaryAggregateConfig = getPrimaryAggregateConfig(document.documentType);
  const primaryAggregateLinks = primaryAggregateConfig
    ? normalizedIncomingLinks.filter(
        link =>
          link.linkType === primaryAggregateConfig.linkType &&
          link.document?.documentType === primaryAggregateConfig.documentTypeFilter
      )
    : [];
  const primaryAggregateStats = buildLinkedSummaryStats(primaryAggregateLinks);

  async function handleSaveTitle() {
    await updateTitle.mutateAsync({ id: documentId, title });
    toast.success("Название документа обновлено");
  }

  async function handleCreateBlock(sectionId: number, blockType: "text" | "checklist" | "table" | "summary" | "linked_summary") {
    await createBlock.mutateAsync({ documentId, sectionId, blockType });
    toast.success("Блок добавлен");
  }

  async function handleCreatePresetBlock(sectionId: number, preset: QuickPreset) {
    const createdBlock = await createBlock.mutateAsync({
      documentId,
      sectionId,
      blockType: preset.blockType,
      title: preset.title,
    });

    if (preset.contentJson) {
      await updateBlock.mutateAsync({
        id: createdBlock.id,
        title: preset.title,
        contentJson: preset.contentJson,
      });
    }

    toast.success("Быстрый блок добавлен");
  }

  async function handleSaveBlock(blockId: number, blockType: string) {
    const draft = drafts[blockId];
    if (!draft) return;

    let contentJson = draft.contentJson;
    if (blockType === "table" && typeof draft.contentJson.raw === "string") {
      try {
        contentJson = JSON.parse(draft.contentJson.raw as string) as Record<string, unknown>;
      } catch {
        toast.error("Для таблицы нужен валидный JSON");
        return;
      }
    }

    await updateBlock.mutateAsync({
      id: blockId,
      title: draft.title || null,
      contentJson,
    });
    toast.success("Блок сохранен");
  }

  async function handleCreateDocumentLink() {
    const targetId = Number(selectedLinkTarget);
    if (!targetId || Number.isNaN(targetId)) return;

    await createDocumentLink.mutateAsync({
      fromDocumentId: documentId,
      toDocumentId: targetId,
      linkType: selectedLinkType,
    });
    setSelectedLinkTarget("");
    toast.success("Связь между документами создана");
  }

  function getSuggestedChildType(documentType: string) {
    switch (documentType) {
      case "strategy":
        return { type: "tactics", title: "Новая Tactics" };
      case "tactics":
        return { type: "daily_tt", title: "Новый TT" };
      case "daily_tt":
        return { type: "weekly_nr", title: "Новый NR" };
      case "weekly_nr":
        return { type: "monthly_mr", title: "Новый MR" };
      case "monthly_mr":
        return { type: "yearly_yr", title: "Новый YR" };
      default:
        return null;
    }
  }

  async function handleCreateSuggestedChild() {
    const suggestion = getSuggestedChildType(currentDocument.documentType);
    if (!suggestion) return;

    await createDocument.mutateAsync({
      notebookId: currentDocument.notebookId,
      title: suggestion.title,
      documentType: suggestion.type as any,
      periodDate: currentDocument.periodDate ?? undefined,
    });
  }

  function renderLinkedGroups(groups: Array<[string, LinkedSummaryItem[]]>, emptyText: string) {
    if (groups.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
          {emptyText}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {groups.map(([documentType, links]) => (
          <div key={documentType} className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {getDocumentTypeLabel(documentType)}
            </div>
            <div className="grid gap-3">
              {links.map(link => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => {
                    if (link.document?.id) {
                      setLocation(`/tardis/doc/${link.document.id}`);
                    }
                  }}
                  className="w-full rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="text-sm font-medium">{link.document?.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{link.linkType}</span>
                    {link.document?.periodDate ? <span>{link.document.periodDate}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border/60 bg-background/80 px-6 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1 space-y-2">
            <Label htmlFor="tardis-document-title">Название документа</Label>
            <Input id="tardis-document-title" value={title} onChange={event => setTitle(event.target.value)} />
          </div>
          <div
            className={cn(
              "rounded-xl border px-4 py-2 text-xs font-medium",
              getDocumentTypeBadgeClass(document.documentType)
            )}
          >
            {getDocumentTypeLabel(document.documentType)}
            {document.periodDate ? ` • ${document.periodDate}` : ""}
          </div>
          <Button onClick={handleSaveTitle} disabled={updateTitle.isPending}>
            <Save className="mr-2 h-4 w-4" />
            Сохранить заголовок
          </Button>
          {getSuggestedChildType(currentDocument.documentType) ? (
            <Button variant="outline" onClick={handleCreateSuggestedChild} disabled={createDocument.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              Создать следующий слой
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          <div className={cn("grid gap-4", primaryAggregateConfig ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Роль документа</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {getDocumentRoleHint(document.documentType)}
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Поток Tardis</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{getFlowLine(document.documentType)}</CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Архитектурный контекст</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div>Notebook ID: {document.notebookId}</div>
                <div>Входящих связей: {normalizedIncomingLinks.length}</div>
                <div>Исходящих связей: {normalizedOutgoingLinks.length}</div>
                <div>Секций: {document.sections.length}</div>
              </CardContent>
            </Card>

            {primaryAggregateConfig ? (
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">{primaryAggregateConfig.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div>Связанных документов: {primaryAggregateStats.total}</div>
                  <div>С периодом: {primaryAggregateStats.withPeriod}</div>
                  <div>Последний период: {primaryAggregateStats.latestPeriod ?? "—"}</div>
                  <div>Первый период: {primaryAggregateStats.earliestPeriod ?? "—"}</div>
                </CardContent>
              </Card>
            ) : null}
          </div>

          {linkedSummaryDashboard.length > 0 ? (
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Dashboard агрегатов</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {linkedSummaryDashboard.map(item => (
                  <div key={item.id} className="rounded-2xl border border-border/70 bg-background/60 p-4">
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.sectionTitle}</div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Всего</div>
                        <div className="mt-1 text-lg font-semibold">{item.stats.total}</div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Типов</div>
                        <div className="mt-1 text-lg font-semibold">{item.stats.grouped.length}</div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Последний</div>
                        <div className="mt-1 text-sm font-semibold">{item.stats.latestPeriod ?? "—"}</div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Первый</div>
                        <div className="mt-1 text-sm font-semibold">{item.stats.earliestPeriod ?? "—"}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {sectionDashboard.length > 0 ? (
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Карта секций</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sectionDashboard.map(section => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => globalThis.document?.getElementById(`tardis-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="rounded-2xl border border-border/70 bg-background/60 p-4 text-left transition-colors hover:bg-accent/40"
                  >
                    <div className="text-sm font-medium">{section.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{section.sectionKey}</div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Блоков</div>
                        <div className="mt-1 text-lg font-semibold">{section.stats.blocks}</div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Чеклист</div>
                        <div className="mt-1 text-lg font-semibold">{section.stats.checklistItems}</div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Готово</div>
                        <div className="mt-1 text-lg font-semibold">{section.stats.checkedItems}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {section.stats.completionPercent != null
                          ? `Прогресс: ${section.stats.completionPercent}%`
                          : "Без чеклистов"}
                      </span>
                      <span>Перейти к секции</span>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Связи документа</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-3">
                  <div className="text-sm font-medium">Входящие связи</div>
                  {renderLinkedGroups(
                    groupLinkedDocuments(normalizedIncomingLinks),
                    "Пока нет документов, которые ведут сюда."
                  )}
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-medium">Исходящие связи</div>
                  {renderLinkedGroups(
                    groupLinkedDocuments(normalizedOutgoingLinks),
                    "Пока нет документов, куда ведет этот документ."
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                <div className="mb-3 text-sm font-medium">Создать ручную связь</div>
                <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
                  <Select value={selectedLinkTarget} onValueChange={setSelectedLinkTarget}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выбери документ" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLinkTargets.map(candidate => (
                        <SelectItem key={candidate.id} value={String(candidate.id)}>
                          {candidate.title} ({getDocumentTypeLabel(candidate.documentType)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedLinkType} onValueChange={setSelectedLinkType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Тип связи" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="related">related</SelectItem>
                      <SelectItem value="supports">supports</SelectItem>
                      <SelectItem value="feeds">feeds</SelectItem>
                      <SelectItem value="child_of">child_of</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button onClick={handleCreateDocumentLink} disabled={!selectedLinkTarget || createDocumentLink.isPending}>
                    Связать
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {document.sections.map(section => (
            <Card id={`tardis-section-${section.id}`} key={section.id} className="border-border/70 scroll-mt-6">
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle className="text-base">{section.title}</CardTitle>
                  <div className="mt-1 text-xs text-muted-foreground">Ключ секции: {section.sectionKey}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getQuickPresets(document.documentType, section.sectionKey).length > 0 ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      {getQuickPresets(document.documentType, section.sectionKey).map(preset => (
                        <Button
                          key={`${section.id}-${preset.label}`}
                          size="sm"
                          variant="secondary"
                          onClick={() => handleCreatePresetBlock(section.id, preset)}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    {(["text", "checklist", "summary", "table", "linked_summary"] as const).map(blockType => (
                      <Button
                        key={blockType}
                        size="sm"
                        variant="outline"
                        onClick={() => handleCreateBlock(section.id, blockType)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {blockType}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {section.blocks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                    Пока пусто. Добавь сюда первый блок.
                  </div>
                ) : null}

                {section.blocks.map(block => {
                  const draft = drafts[block.id] ?? {
                    title: block.title ?? "",
                    contentJson: block.contentJson ?? {},
                  };
                  const rawText = typeof draft.contentJson.text === "string" ? draft.contentJson.text : "";
                  const checklistText = Array.isArray(draft.contentJson.items)
                    ? draft.contentJson.items
                        .map(item =>
                          typeof item === "object" && item && "text" in item ? String((item as { text: string }).text) : ""
                        )
                        .join("\n")
                    : "";
                  const tableRaw =
                    typeof draft.contentJson.raw === "string"
                      ? (draft.contentJson.raw as string)
                      : stringifyTable(draft.contentJson);
                  const linkedDocuments = getLinkedDocumentsForSummary(document, draft.contentJson);
                  const linkedStats = buildLinkedSummaryStats(linkedDocuments);

                  return (
                    <div key={block.id} className="rounded-xl border border-border/60 bg-background/70 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">{block.blockType}</div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            await deleteBlock.mutateAsync({ id: block.id });
                            toast.success("Блок удален");
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="space-y-3">
                        <Input
                          placeholder="Заголовок блока"
                          value={draft.title}
                          onChange={event =>
                            setDrafts(current => ({
                              ...current,
                              [block.id]: {
                                ...draft,
                                title: event.target.value,
                              },
                            }))
                          }
                        />

                        {(block.blockType === "text" || block.blockType === "summary") && (
                          <Textarea
                            className="min-h-28"
                            value={rawText}
                            onChange={event =>
                              setDrafts(current => ({
                                ...current,
                                [block.id]: {
                                  ...draft,
                                  contentJson: { text: event.target.value },
                                },
                              }))
                            }
                          />
                        )}

                        {block.blockType === "checklist" && (
                          <Textarea
                            className="min-h-28"
                            placeholder="Каждая строка станет пунктом чеклиста"
                            value={checklistText}
                            onChange={event =>
                              setDrafts(current => ({
                                ...current,
                                [block.id]: {
                                  ...draft,
                                  contentJson: {
                                    items: event.target.value
                                      .split("\n")
                                      .map(item => item.trim())
                                      .filter(Boolean)
                                      .map((item, index) => ({
                                        id: `${block.id}-${index}`,
                                        text: item,
                                        checked: false,
                                      })),
                                  },
                                },
                              }))
                            }
                          />
                        )}

                        {block.blockType === "table" && (
                          <Textarea
                            className="min-h-40 font-mono text-xs"
                            value={tableRaw}
                            onChange={event =>
                              setDrafts(current => ({
                                ...current,
                                [block.id]: {
                                  ...draft,
                                  contentJson: { raw: event.target.value },
                                },
                              }))
                            }
                          />
                        )}

                        {block.blockType === "linked_summary" && (
                          <div className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-3">
                              <Select
                                value={(draft.contentJson.direction as string | undefined) ?? "incoming"}
                                onValueChange={value =>
                                  setDrafts(current => ({
                                    ...current,
                                    [block.id]: {
                                      ...draft,
                                      contentJson: {
                                        ...draft.contentJson,
                                        direction: value,
                                      },
                                    },
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Direction" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="incoming">incoming</SelectItem>
                                  <SelectItem value="outgoing">outgoing</SelectItem>
                                </SelectContent>
                              </Select>

                              <Input
                                placeholder="linkType"
                                value={(draft.contentJson.linkType as string | undefined) ?? ""}
                                onChange={event =>
                                  setDrafts(current => ({
                                    ...current,
                                    [block.id]: {
                                      ...draft,
                                      contentJson: {
                                        ...draft.contentJson,
                                        linkType: event.target.value,
                                      },
                                    },
                                  }))
                                }
                              />

                              <Input
                                placeholder="documentType filter"
                                value={(draft.contentJson.documentTypeFilter as string | undefined) ?? ""}
                                onChange={event =>
                                  setDrafts(current => ({
                                    ...current,
                                    [block.id]: {
                                      ...draft,
                                      contentJson: {
                                        ...draft.contentJson,
                                        documentTypeFilter: event.target.value,
                                      },
                                    },
                                  }))
                                }
                              />
                            </div>

                            <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                              <div className="mb-2 text-sm font-medium">Связанные документы: {linkedDocuments.length}</div>
                              <div className="space-y-2">
                                {linkedDocuments.length === 0 ? (
                                  <div className="text-sm text-muted-foreground">
                                    По текущим фильтрам пока ничего не найдено.
                                  </div>
                                ) : (
                                  linkedDocuments.map(link => {
                                    const candidate = link.document;
                                    return (
                                      <button
                                        key={link.id}
                                        type="button"
                                        onClick={() => {
                                          if (candidate?.id) {
                                            setLocation(`/tardis/doc/${candidate.id}`);
                                          }
                                        }}
                                        className="w-full rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-left transition-colors hover:bg-accent/40"
                                      >
                                        <div className="text-sm font-medium">{candidate?.title}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                          {getDocumentTypeLabel(candidate?.documentType ?? "")}
                                          {candidate?.periodDate ? ` • ${candidate.periodDate}` : ""}
                                        </div>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end">
                          <Button onClick={() => handleSaveBlock(block.id, block.blockType)}>
                            <Save className="mr-2 h-4 w-4" />
                            Сохранить блок
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
