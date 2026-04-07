import type { TardisDocumentType } from "@shared/tardis";
import { getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import {
  createBlock,
  createDocument,
  createDocumentLinks,
  createNotebook,
  createNotebookGroup,
  createSections,
  findDocumentsByPeriod,
  getDocumentById,
  listNotebookGroupsByUser,
  updateBlock,
  updateDocumentTitle,
} from "./repository";

const DEFAULT_LINK_SUMMARIES: Partial<
  Record<
    TardisDocumentType,
    { sectionKey: string; title: string; contentJson: Record<string, unknown> }
  >
> = {
  weekly_nr: {
    sectionKey: "weekly_overview",
    title: "Сводка связанных TT",
    contentJson: {
      direction: "incoming",
      linkType: "daily_to_weekly",
      documentTypeFilter: "daily_tt",
    },
  },
  monthly_mr: {
    sectionKey: "monthly_overview",
    title: "Сводка связанных NR",
    contentJson: {
      direction: "incoming",
      linkType: "weekly_to_monthly",
      documentTypeFilter: "weekly_nr",
    },
  },
  yearly_yr: {
    sectionKey: "year_results",
    title: "Сводка связанных MR",
    contentJson: {
      direction: "incoming",
      linkType: "monthly_to_yearly",
      documentTypeFilter: "monthly_mr",
    },
  },
};

const DEFAULT_SECTION_BLOCKS: Partial<
  Record<
    TardisDocumentType,
    Array<{
      sectionKey: string;
      blockType: "text" | "summary" | "checklist";
      title: string;
      contentJson: Record<string, unknown>;
    }>
  >
> = {
  strategy: [
    {
      sectionKey: "core_focus",
      blockType: "summary",
      title: "Годовой фокус",
      contentJson: {
        text: "Опиши главное направление года и тот результат, вокруг которого будет строиться весь Tardis.",
      },
    },
    {
      sectionKey: "principles",
      blockType: "text",
      title: "Принципы года",
      contentJson: {
        text: "- Что усиливает систему?\n- Что разрушает систему?\n- Какие правила нельзя нарушать?",
      },
    },
    {
      sectionKey: "directions",
      blockType: "text",
      title: "Основные направления",
      contentJson: {
        text: "- Здоровье\n- Капитал\n- Система\n- Работа\n- Мышление",
      },
    },
  ],
  tactics: [
    {
      sectionKey: "areas",
      blockType: "text",
      title: "Сферы и направления",
      contentJson: {
        text: "Разложи стратегию на рабочие области, которыми ты реально управляешь в текущем цикле.",
      },
    },
    {
      sectionKey: "active_fronts",
      blockType: "summary",
      title: "Активные фронты",
      contentJson: {
        text: "Какие 3-5 фронтов сейчас действительно в фокусе?",
      },
    },
    {
      sectionKey: "backlog",
      blockType: "text",
      title: "Тактический бэклог",
      contentJson: {
        text: "Сюда складываются идеи, задачи, хвосты и будущие векторы.",
      },
    },
  ],
  daily_tt: [
    {
      sectionKey: "tactics",
      blockType: "summary",
      title: "Фокус дня",
      contentJson: {
        text: "Какой главный тактический результат должен быть получен сегодня?",
      },
    },
    {
      sectionKey: "tasks",
      blockType: "checklist",
      title: "Задачи дня",
      contentJson: {
        items: [
          { id: "task-1", text: "Главная задача дня", checked: false },
          { id: "task-2", text: "Второй важный шаг", checked: false },
        ],
      },
    },
    {
      sectionKey: "insights",
      blockType: "text",
      title: "Инсайты и наблюдения",
      contentJson: {
        text: "Фиксируй инсайты, которые потом должны подняться в NR, MR и YR.",
      },
    },
  ],
  weekly_nr: [
    {
      sectionKey: "weekly_overview",
      blockType: "summary",
      title: "Общий обзор недели",
      contentJson: {
        text: "Как в целом прошла неделя? Где был рост, а где перекос?",
      },
    },
    {
      sectionKey: "wins",
      blockType: "text",
      title: "Победы недели",
      contentJson: {
        text: "- Что получилось?\n- Что было сильным?\n- Что стоит закрепить?",
      },
    },
    {
      sectionKey: "problems",
      blockType: "text",
      title: "Проблемы недели",
      contentJson: {
        text: "- Где были срывы?\n- Что тянуло вниз?\n- Что требует регулировки?",
      },
    },
  ],
  monthly_mr: [
    {
      sectionKey: "monthly_overview",
      blockType: "summary",
      title: "Итог месяца",
      contentJson: {
        text: "Собери в одном абзаце главный смысл месяца, не распыляясь на второстепенное.",
      },
    },
    {
      sectionKey: "insights",
      blockType: "text",
      title: "Главные выводы месяца",
      contentJson: {
        text: "- Что сработало?\n- Что не сработало?\n- Что надо перенести в следующий месяц?",
      },
    },
  ],
  yearly_yr: [
    {
      sectionKey: "year_results",
      blockType: "summary",
      title: "Итог года",
      contentJson: {
        text: "Что стало главным результатом года и какой образ года можно сформулировать в одном абзаце?",
      },
    },
    {
      sectionKey: "failures",
      blockType: "text",
      title: "Провалы и потери",
      contentJson: {
        text: "- Что было упущено?\n- Где были ошибки?\n- Что нельзя повторять в следующем цикле?",
      },
    },
    {
      sectionKey: "foundation_for_next_year",
      blockType: "text",
      title: "Основа следующего года",
      contentJson: {
        text: "Какие принципы, цели и ограничения должны лечь в Strategy следующего года?",
      },
    },
  ],
};

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-zа-я0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 200) || "item"
  );
}

function getDocumentMode(documentType: TardisDocumentType) {
  return documentType === "custom_note" ? "custom" : "typed";
}

function getInitialSections(documentType: TardisDocumentType) {
  if (documentType === "strategy") {
    return [
      { title: "Core Focus", sectionKey: "core_focus" },
      { title: "Identity", sectionKey: "identity" },
      { title: "Principles", sectionKey: "principles" },
      { title: "Directions", sectionKey: "directions" },
      { title: "Strategic Goals", sectionKey: "strategic_goals" },
      { title: "Constraints", sectionKey: "constraints" },
      { title: "Source Materials", sectionKey: "source_materials" },
    ];
  }

  if (documentType === "tactics") {
    return [
      { title: "Areas", sectionKey: "areas" },
      { title: "Active Fronts", sectionKey: "active_fronts" },
      { title: "Projects", sectionKey: "projects" },
      { title: "Backlog", sectionKey: "backlog" },
      { title: "Operational Rules", sectionKey: "operational_rules" },
      { title: "Links to Strategy", sectionKey: "links_to_strategy" },
    ];
  }

  if (documentType === "daily_tt") {
    return [
      { title: "Incoming", sectionKey: "incoming" },
      { title: "Backlog", sectionKey: "backlog" },
      { title: "Tactics", sectionKey: "tactics" },
      { title: "Tasks", sectionKey: "tasks" },
      { title: "Insights", sectionKey: "insights" },
      { title: "Notes", sectionKey: "notes" },
      { title: "Results", sectionKey: "results" },
    ];
  }

  if (documentType === "weekly_nr") {
    return [
      { title: "Weekly Overview", sectionKey: "weekly_overview" },
      { title: "Category Review", sectionKey: "category_review" },
      { title: "Metrics", sectionKey: "metrics" },
      { title: "Wins", sectionKey: "wins" },
      { title: "Problems", sectionKey: "problems" },
      { title: "Insights", sectionKey: "insights" },
      { title: "Next Week Adjustments", sectionKey: "next_week_adjustments" },
    ];
  }

  if (documentType === "monthly_mr") {
    return [
      { title: "Monthly Overview", sectionKey: "monthly_overview" },
      { title: "Metrics Summary", sectionKey: "metrics_summary" },
      { title: "Category Review", sectionKey: "category_review" },
      { title: "Insights", sectionKey: "insights" },
      { title: "Risks", sectionKey: "risks" },
      { title: "Next Month Focus", sectionKey: "next_month_focus" },
    ];
  }

  if (documentType === "yearly_yr") {
    return [
      { title: "Year Results", sectionKey: "year_results" },
      { title: "Failures", sectionKey: "failures" },
      { title: "Sphere Review", sectionKey: "sphere_review" },
      { title: "Capital Review", sectionKey: "capital_review" },
      { title: "Key Events", sectionKey: "key_events" },
      { title: "Main Insights", sectionKey: "main_insights" },
      { title: "Foundation for Next Year", sectionKey: "foundation_for_next_year" },
    ];
  }

  return [{ title: "Main", sectionKey: "main" }];
}

function getPeriodMeta(periodDate?: string) {
  if (!periodDate) {
    return {
      periodDate: null,
      periodYear: null,
      periodMonth: null,
      periodWeek: null,
    };
  }

  const parsed = parseISO(periodDate);
  return {
    periodDate,
    periodYear: getISOWeekYear(parsed),
    periodMonth: Number.parseInt(periodDate.slice(5, 7), 10),
    periodWeek: getISOWeek(parsed),
  };
}

export async function getNotebookTree(userId: number) {
  return listNotebookGroupsByUser(userId);
}

export async function createGroup(userId: number, title: string) {
  return createNotebookGroup(userId, title, slugify(title));
}

export async function createUserNotebook(groupId: number, title: string) {
  return createNotebook(groupId, title, slugify(title));
}

export async function createUserDocument(input: {
  notebookId: number;
  title: string;
  documentType: TardisDocumentType;
  periodDate?: string;
  userId?: number;
}) {
  const periodMeta = getPeriodMeta(input.periodDate);
  const document = await createDocument({
    notebookId: input.notebookId,
    title: input.title,
    documentType: input.documentType,
    documentMode: getDocumentMode(input.documentType),
    ...periodMeta,
  });

  const sections = await createSections(document.id, getInitialSections(input.documentType));

  if (input.documentType === "weekly_nr" && input.userId && periodMeta.periodYear != null && periodMeta.periodWeek != null) {
    const dailyDocuments = await findDocumentsByPeriod({
      userId: input.userId,
      notebookId: input.notebookId,
      documentType: "daily_tt",
      periodYear: periodMeta.periodYear,
      periodWeek: periodMeta.periodWeek,
    });

    await createDocumentLinks(
      dailyDocuments.map(dailyDocument => ({
        fromDocumentId: dailyDocument.id,
        toDocumentId: document.id,
        linkType: "daily_to_weekly",
      }))
    );
  }

  if (input.documentType === "monthly_mr" && input.userId && periodMeta.periodYear != null && periodMeta.periodMonth != null) {
    const weeklyDocuments = await findDocumentsByPeriod({
      userId: input.userId,
      notebookId: input.notebookId,
      documentType: "weekly_nr",
      periodYear: periodMeta.periodYear,
      periodMonth: periodMeta.periodMonth,
      periodWeek: null,
    });

    await createDocumentLinks(
      weeklyDocuments.map(weeklyDocument => ({
        fromDocumentId: weeklyDocument.id,
        toDocumentId: document.id,
        linkType: "weekly_to_monthly",
      }))
    );
  }

  if (input.documentType === "tactics" && input.userId && periodMeta.periodYear != null) {
    const strategyDocuments = await findDocumentsByPeriod({
      userId: input.userId,
      notebookId: input.notebookId,
      documentType: "strategy",
      periodYear: periodMeta.periodYear,
    });

    if (strategyDocuments[0]) {
      await createDocumentLinks([
        {
          fromDocumentId: strategyDocuments[0].id,
          toDocumentId: document.id,
          linkType: "strategy_to_tactics",
        },
      ]);
    }
  }

  if (input.documentType === "yearly_yr" && input.userId && periodMeta.periodYear != null) {
    const monthlyDocuments = await findDocumentsByPeriod({
      userId: input.userId,
      notebookId: input.notebookId,
      documentType: "monthly_mr",
      periodYear: periodMeta.periodYear,
    });

    await createDocumentLinks(
      monthlyDocuments.map(monthlyDocument => ({
        fromDocumentId: monthlyDocument.id,
        toDocumentId: document.id,
        linkType: "monthly_to_yearly",
      }))
    );
  }

  const defaultLinkedSummary = DEFAULT_LINK_SUMMARIES[input.documentType];
  if (defaultLinkedSummary) {
    const targetSection = sections.find(section => section.sectionKey === defaultLinkedSummary.sectionKey);
    if (targetSection) {
      await createBlock({
        documentId: document.id,
        sectionId: targetSection.id,
        blockType: "linked_summary",
        title: defaultLinkedSummary.title ?? null,
        contentJson: defaultLinkedSummary.contentJson ?? {},
      });
    }
  }

  const defaultSectionBlocks = DEFAULT_SECTION_BLOCKS[input.documentType] ?? [];
  for (const block of defaultSectionBlocks) {
    const targetSection = sections.find(section => section.sectionKey === block.sectionKey);
    if (!targetSection) continue;

    await createBlock({
      documentId: document.id,
      sectionId: targetSection.id,
      blockType: block.blockType,
      title: block.title,
      contentJson: block.contentJson,
    });
  }

  return document;
}

export async function getUserDocument(userId: number, documentId: number) {
  return getDocumentById(userId, documentId);
}

export async function renameDocument(userId: number, documentId: number, title: string) {
  const document = await getDocumentById(userId, documentId);
  if (!document) throw new Error("Document not found");
  return updateDocumentTitle(documentId, title);
}

export async function addBlock(input: {
  documentId: number;
  sectionId: number;
  blockType: "text" | "checklist" | "table" | "summary" | "linked_summary";
  title?: string;
}) {
  const initialContent =
    input.blockType === "checklist"
      ? { items: [] }
      : input.blockType === "table"
        ? { columns: ["A", "B"], rows: [] }
        : input.blockType === "linked_summary"
          ? { direction: "incoming", linkType: "related", documentTypeFilter: "" }
          : { text: "" };

  return createBlock({
    documentId: input.documentId,
    sectionId: input.sectionId,
    blockType: input.blockType,
    title: input.title ?? null,
    contentJson: initialContent,
  });
}

export async function updateUserBlock(input: {
  id: number;
  title?: string | null;
  contentJson: Record<string, unknown>;
}) {
  return updateBlock(input.id, {
    title: input.title ?? null,
    contentJson: input.contentJson,
  });
}

export async function createManualDocumentLink(input: {
  userId: number;
  fromDocumentId: number;
  toDocumentId: number;
  linkType: string;
}) {
  const fromDocument = await getDocumentById(input.userId, input.fromDocumentId);
  const toDocument = await getDocumentById(input.userId, input.toDocumentId);

  if (!fromDocument || !toDocument) {
    throw new Error("Document not found");
  }

  return createDocumentLinks([
    {
      fromDocumentId: input.fromDocumentId,
      toDocumentId: input.toDocumentId,
      linkType: input.linkType,
    },
  ]);
}
