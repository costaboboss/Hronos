import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type { TrainingVolumeMode } from "@shared/training";
import { addMonths, format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  Minus,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type SelectedCell = {
  date: string;
  exerciseId: number;
  exerciseName: string;
  volumeMode: TrainingVolumeMode;
};

type LegacyImportEntry = {
  exerciseName: string;
  date: string;
  rawInput: string;
  key: string;
};

const EXERCISE_ORDER_STORAGE_KEY = "training.exercise-order.v1";
const TRAINING_MONTH_NOTE_PREFIX = "training.month-note";

const volumeModeLabels: Record<TrainingVolumeMode, string> = {
  weight_reps: "Вес × повторения",
  bodyweight_reps: "Вес тела / доп. вес",
  reps_only: "Только повторения",
  duration: "Длительность",
  distance: "Дистанция",
};

function getExerciseAccent(volumeMode: TrainingVolumeMode) {
  switch (volumeMode) {
    case "weight_reps":
      return {
        pill: "border-rose-400/30 bg-rose-500/12 text-rose-100",
        cell: "bg-rose-500/14 hover:bg-rose-500/20",
        stripe: "before:bg-rose-400/85",
      };
    case "bodyweight_reps":
      return {
        pill: "border-sky-400/30 bg-sky-500/12 text-sky-100",
        cell: "bg-sky-500/14 hover:bg-sky-500/20",
        stripe: "before:bg-sky-400/85",
      };
    case "reps_only":
      return {
        pill: "border-amber-400/30 bg-amber-500/12 text-amber-100",
        cell: "bg-amber-500/14 hover:bg-amber-500/20",
        stripe: "before:bg-amber-400/85",
      };
    case "duration":
      return {
        pill: "border-violet-400/30 bg-violet-500/12 text-violet-100",
        cell: "bg-violet-500/14 hover:bg-violet-500/20",
        stripe: "before:bg-violet-400/85",
      };
    case "distance":
      return {
        pill: "border-emerald-400/30 bg-emerald-500/12 text-emerald-100",
        cell: "bg-emerald-500/14 hover:bg-emerald-500/20",
        stripe: "before:bg-emerald-400/85",
      };
  }
}

function formatCellValue(volume: number, volumeMode: TrainingVolumeMode) {
  if (volumeMode === "duration") return `${Math.round(volume / 60)} мин`;
  if (volumeMode === "distance") return `${volume} м`;
  return volume.toLocaleString("ru-RU");
}

function getCellHint(volumeMode: TrainingVolumeMode) {
  if (volumeMode === "duration") return "секунды";
  if (volumeMode === "distance") return "метры";
  if (volumeMode === "reps_only") return "повторы";
  return "объём";
}

function getPreviewLines(rawInput: string | null | undefined) {
  if (!rawInput) return [];
  return rawInput
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map(line => (line.length > 24 ? `${line.slice(0, 24)}…` : line));
}

function getWeekdayTone(date: string) {
  const weekday = new Date(date).getDay();
  if (weekday === 0) return "text-blue-400";
  if (weekday === 6) return "text-indigo-400";
  return "text-slate-500";
}

function getDayScenarioClass(date: string, volume: number, maxVolume: number) {
  const weekday = new Date(date).getDay();
  if (volume <= 0) {
    return weekday === 0 || weekday === 6 ? "bg-[#0c1017]" : "bg-[#0c1118]";
  }

  const ratio = maxVolume > 0 ? volume / maxVolume : 0;
  if (ratio >= 0.8) return "bg-emerald-950/65";
  if (ratio >= 0.45) return "bg-cyan-950/55";
  if (weekday === 0 || weekday === 6) return "bg-indigo-950/55";
  return "bg-[#111a24]";
}

function reorderRows<T extends { id: number }>(rows: T[], order: number[]) {
  const position = new Map(order.map((id, index) => [id, index]));
  return [...rows].sort((a, b) => {
    const aPos = position.get(a.id);
    const bPos = position.get(b.id);
    if (aPos == null && bPos == null) return a.id - b.id;
    if (aPos == null) return 1;
    if (bPos == null) return -1;
    return aPos - bPos;
  });
}

function getMonthNoteStorageKey(year: number, month: number) {
  return `${TRAINING_MONTH_NOTE_PREFIX}.${year}-${String(month).padStart(2, "0")}`;
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRussianMonthToken(token: string) {
  const normalized = token.toLowerCase().replace(/\./g, "");
  const months: Record<string, number> = {
    январь: 1,
    янв: 1,
    февраль: 2,
    фев: 2,
    март: 3,
    мар: 3,
    апрель: 4,
    апр: 4,
    июнь: 6,
    июль: 7,
    август: 8,
    сентябрь: 9,
    октябрь: 10,
    ноябрь: 11,
    декабрь: 12,
    май: 5,
    мая: 5,
    июн: 6,
    июл: 7,
    авг: 8,
    сен: 9,
    сент: 9,
    окт: 10,
    ноя: 11,
    дек: 12,
  };
  return months[normalized] ?? null;
}

function getCellInnerHtmlList(rowHtml: string) {
  return Array.from(
    rowHtml.matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi),
    match => match[2]
  );
}

function stripHtmlPreservingLines(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractParagraphBlocks(cellHtml: string) {
  const rawBlocks = Array.from(
    cellHtml.matchAll(/<div[^>]*class="para"[^>]*>([\s\S]*?)<\/div>/gi),
    match => stripHtmlPreservingLines(match[1])
  );

  return rawBlocks
    .map(block =>
      block
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
    )
    .filter(lines => lines.length > 0);
}

function parseExerciseParagraph(lines: string[]) {
  const joined = lines.join("\n").trim();
  if (!joined || /^итого[:\s]/i.test(joined)) return null;

  let exerciseName = lines[0]
    .replace(/[:：]\s*$/, "")
    .replace(/\s*<b>.*$/i, "")
    .trim();

  const restLines = [...lines.slice(1)];

  const sameLineMatch = exerciseName.match(/^(.+?)(\d+(?:[.,]\d+)?\s*(?:кг|kg)|\d+\.)/i);
  if (sameLineMatch) {
    exerciseName = sameLineMatch[1].trim().replace(/[:：]\s*$/, "");
    restLines.unshift(exerciseName.length ? lines[0].slice(sameLineMatch[1].length).trim() : lines[0].trim());
  }

  const cleanedRest = restLines
    .map(line => line.replace(/<b>.*?<\/b>/gi, "").trim())
    .filter(Boolean)
    .filter(line => !/^итого[:\s]/i.test(line))
    .filter(line => !/^\d[\d\s.,]*$/.test(line));

  const rawInput = cleanedRest.join("\n").trim();
  if (!exerciseName || !rawInput) return null;

  return { exerciseName, rawInput };
}

function normalizeExerciseName(value: string) {
  return stripHtml(value)
    .replace(/^[\d.()\-\s]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseLegacyImport(html: string, year: number, month: number) {
  const tableMatches = Array.from(html.matchAll(/<table[\s\S]*?>([\s\S]*?)<\/table>/gi), match => match[1]);
  const imports: LegacyImportEntry[] = [];

  for (const tableHtml of tableMatches) {
    const rowMatches = Array.from(tableHtml.matchAll(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi), match => match[1]);
    if (rowMatches.length < 5) continue;

    const monthTitle = stripHtml(rowMatches[0]);
    const monthMatch = monthTitle.match(/[А-Яа-яA-Za-z.]+/);
    const tableMonth = monthMatch ? parseRussianMonthToken(monthMatch[0]) : month;

    const dateCells = getCellInnerHtmlList(rowMatches[1]).map(cell => stripHtml(cell));
    const columnDates = dateCells.map(text => {
      const dotted = text.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
      if (dotted) {
        const day = Number(dotted[1]);
        const parsedMonth = Number(dotted[2]);
        const parsedYear = dotted[3] ? Number(dotted[3]) : year;
        return format(new Date(parsedYear, parsedMonth - 1, day), "yyyy-MM-dd");
      }

      const dayOnly = text.match(/^\d{1,2}$/);
      if (dayOnly && tableMonth) {
        return format(new Date(year, tableMonth - 1, Number(dayOnly[0])), "yyyy-MM-dd");
      }

      const russianShort = text.match(/(\d{1,2})\s+([А-Яа-яA-Za-z.]+)/);
      if (russianShort) {
        const parsedMonth = parseRussianMonthToken(russianShort[2]);
        if (parsedMonth) {
          return format(new Date(year, parsedMonth - 1, Number(russianShort[1])), "yyyy-MM-dd");
        }
      }

      return null;
    });

    const detailRows = rowMatches.slice(4);
    for (const rowHtml of detailRows) {
      const cells = getCellInnerHtmlList(rowHtml);
      cells.forEach((cellHtml, index) => {
        const date = columnDates[index];
        if (!date) return;

        const paragraphs = extractParagraphBlocks(cellHtml);
        paragraphs.forEach(paragraphLines => {
          const parsed = parseExerciseParagraph(paragraphLines);
          if (!parsed) return;
          if (!/\d/.test(parsed.rawInput)) return;

          imports.push({
            exerciseName: normalizeExerciseName(parsed.exerciseName),
            date,
            rawInput: parsed.rawInput,
            key: `${parsed.exerciseName}__${date}__${imports.length}`,
          });
        });
      });
    }
  }

  return imports.filter(item => item.exerciseName && item.rawInput);
}

export default function TrainingPage() {
  const utils = trpc.useUtils();
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [compactMode, setCompactMode] = useState(true);
  const [exerciseOrder, setExerciseOrder] = useState<number[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [selectedImportKeys, setSelectedImportKeys] = useState<string[]>([]);
  const [monthNote, setMonthNote] = useState("");
  const [exerciseForm, setExerciseForm] = useState({
    name: "",
    category: "",
    primaryMuscleGroup: "",
    equipment: "",
    volumeMode: "weight_reps" as TrainingVolumeMode,
    notes: "",
  });
  const [editorForm, setEditorForm] = useState({
    rawInput: "",
    notes: "",
    sessionTitle: "",
    startTimeText: "",
    durationMinutes: "",
    sessionNotes: "",
  });

  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth() + 1;

  const matrixQuery = trpc.training.matrixByMonth.useQuery({ year, month });
  const dashboardQuery = trpc.training.dashboard.useQuery();
  const sessionDetailsQuery = trpc.training.getSessionDetails.useQuery(
    { date: selectedCell?.date ?? format(cursorDate, "yyyy-MM-dd") },
    { enabled: Boolean(selectedCell) }
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(getMonthNoteStorageKey(year, month));
    setMonthNote(saved ?? "");
  }, [month, year]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(EXERCISE_ORDER_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === "number")) {
        setExerciseOrder(parsed);
      }
    } catch {
      // Ignore invalid local state and fall back to server order.
    }
  }, []);

  useEffect(() => {
    const ids = (matrixQuery.data?.exercises ?? []).map(exercise => exercise.id);
    if (!ids.length) return;

    setExerciseOrder(current => {
      const deduped = current.filter(id => ids.includes(id));
      const missing = ids.filter(id => !deduped.includes(id));
      return [...deduped, ...missing];
    });
  }, [matrixQuery.data?.exercises]);

  useEffect(() => {
    if (!exerciseOrder.length) return;
    window.localStorage.setItem(EXERCISE_ORDER_STORAGE_KEY, JSON.stringify(exerciseOrder));
  }, [exerciseOrder]);

  useEffect(() => {
    window.localStorage.setItem(getMonthNoteStorageKey(year, month), monthNote);
  }, [month, monthNote, year]);

  const createExercise = trpc.training.createExercise.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.training.listExercises.invalidate(),
        utils.training.matrixByMonth.invalidate(),
        utils.training.dashboard.invalidate(),
      ]);
      setExerciseForm({
        name: "",
        category: "",
        primaryMuscleGroup: "",
        equipment: "",
        volumeMode: "weight_reps",
        notes: "",
      });
      toast.success("Упражнение добавлено");
    },
  });

  const upsertCell = trpc.training.upsertCell.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.training.matrixByMonth.invalidate({ year, month }),
        selectedCell
          ? utils.training.getSessionDetails.invalidate({ date: selectedCell.date })
          : Promise.resolve(),
        utils.training.dashboard.invalidate(),
        utils.training.listRecentSessions.invalidate(),
      ]);
      toast.success("Ячейка обновлена");
      setSelectedCell(null);
    },
  });

  useEffect(() => {
    if (!selectedCell) return;

    const dateSummary = matrixQuery.data?.days.find(day => day.date === selectedCell.date)?.summary;
    const session = sessionDetailsQuery.data;
    const sessionExercise = session?.exercises.find(item => item.exerciseId === selectedCell.exerciseId);
    const rawInput =
      sessionExercise?.sets
        .map(set => set.rawInput?.trim())
        .filter((value): value is string => Boolean(value))
        .join("\n") ??
      matrixQuery.data?.exercises.find(item => item.id === selectedCell.exerciseId)?.cells[selectedCell.date]
        ?.rawInput ??
      "";

    setEditorForm({
      rawInput,
      notes: sessionExercise?.notes ?? "",
      sessionTitle: session?.title ?? `Тренировка ${selectedCell.date}`,
      startTimeText: session?.startTimeText ?? dateSummary?.startTimeText ?? "",
      durationMinutes: session?.durationMinutes ? String(session.durationMinutes) : "",
      sessionNotes: session?.notes ?? "",
    });
  }, [matrixQuery.data, selectedCell, sessionDetailsQuery.data]);

  const monthHeading = useMemo(() => format(cursorDate, "LLLL yyyy", { locale: ru }), [cursorDate]);
  const matrixDays = matrixQuery.data?.days ?? [];

  const exerciseRows = useMemo(() => {
    const rows = (matrixQuery.data?.exercises ?? []).map(exercise => {
      const total = matrixDays.reduce((sum, day) => sum + (exercise.cells[day.date]?.volume ?? 0), 0);
      const activeDays = matrixDays.filter(day => Boolean(exercise.cells[day.date])).length;
      return { ...exercise, total, activeDays };
    });
    return reorderRows(rows, exerciseOrder);
  }, [exerciseOrder, matrixDays, matrixQuery.data?.exercises]);

  const grandTotal = useMemo(
    () => matrixDays.reduce((sum, day) => sum + (day.summary?.volume ?? 0), 0),
    [matrixDays]
  );

  const workoutDaysCount = matrixDays.filter(day => Boolean(day.summary)).length;
  const maxDayVolume = Math.max(0, ...matrixDays.map(day => day.summary?.volume ?? 0));
  const averageDayVolume = workoutDaysCount ? Math.round(grandTotal / workoutDaysCount) : 0;
  const importPreview = useMemo(() => parseLegacyImport(importText, year, month), [importText, month, year]);
  const importPreviewDays = useMemo(
    () => Array.from(new Set(importPreview.map(item => item.date))).sort(),
    [importPreview]
  );
  const importPreviewExercises = useMemo(
    () => Array.from(new Set(importPreview.map(item => item.exerciseName))).sort((a, b) => a.localeCompare(b, "ru")),
    [importPreview]
  );

  useEffect(() => {
    setSelectedImportKeys(importPreview.map(item => item.key));
  }, [importPreview]);

  const rowCellHeight = compactMode ? "min-h-[62px]" : "min-h-[84px]";
  const rowStickyPadding = compactMode ? "px-3 py-2" : "px-4 py-3";
  const cellPadding = compactMode ? "px-1 py-1" : "px-1.5 py-1.5";
  const previewHeight = compactMode ? "min-h-[24px]" : "min-h-[30px]";
  const tableMinWidth = compactMode ? "min-w-[1320px]" : "min-w-[1420px]";

  function moveExercise(exerciseId: number, direction: "up" | "down") {
    setExerciseOrder(current => {
      const next = [...current];
      const index = next.indexOf(exerciseId);
      if (index === -1) return current;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return current;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  async function handleCreateExercise() {
    if (!exerciseForm.name.trim()) {
      toast.error("Нужно указать название упражнения");
      return;
    }

    await createExercise.mutateAsync({
      name: exerciseForm.name.trim(),
      category: exerciseForm.category.trim() || undefined,
      primaryMuscleGroup: exerciseForm.primaryMuscleGroup.trim() || undefined,
      equipment: exerciseForm.equipment.trim() || undefined,
      volumeMode: exerciseForm.volumeMode,
      notes: exerciseForm.notes.trim() || undefined,
    });
  }

  async function handleSaveCell() {
    if (!selectedCell) return;

    await upsertCell.mutateAsync({
      date: selectedCell.date,
      exerciseId: selectedCell.exerciseId,
      rawInput: editorForm.rawInput,
      notes: editorForm.notes.trim() || undefined,
      sessionTitle: editorForm.sessionTitle.trim() || undefined,
      startTimeText: editorForm.startTimeText.trim() || undefined,
      durationMinutes: editorForm.durationMinutes.trim() ? Number(editorForm.durationMinutes) : null,
      sessionNotes: editorForm.sessionNotes.trim() || undefined,
    });
  }

  async function handleImportLegacyHtml() {
    const parsedEntries = importPreview.filter(item => selectedImportKeys.includes(item.key));
    if (!parsedEntries.length) {
      toast.error("Нечего импортировать: выберите хотя бы одну ячейку");
      return;
    }

    const exerciseMap = new Map<string, { id: number }>(
      (matrixQuery.data?.exercises ?? []).map(exercise => [exercise.name.trim().toLowerCase(), { id: exercise.id }])
    );

    let importedCells = 0;

    for (const entry of parsedEntries) {
      const key = entry.exerciseName.trim().toLowerCase();
      let exercise = exerciseMap.get(key);

      if (!exercise) {
        const createdExercise = await createExercise.mutateAsync({
          name: entry.exerciseName,
          volumeMode: "weight_reps",
        });
        exercise = { id: createdExercise.id };
        exerciseMap.set(key, exercise);
      }

      await upsertCell.mutateAsync({
        date: entry.date,
        exerciseId: exercise.id,
        rawInput: entry.rawInput,
        sessionTitle: `Импорт ${entry.date}`,
      });
      importedCells += 1;
    }

    await Promise.all([
      utils.training.matrixByMonth.invalidate({ year, month }),
      utils.training.dashboard.invalidate(),
      utils.training.listExercises.invalidate(),
    ]);

    setImportOpen(false);
    setImportText("");
    setSelectedImportKeys([]);
    toast.success(`Импортировано ячеек: ${importedCells}`);
  }

  return (
    <div className="h-full overflow-auto bg-[#07090d] text-slate-100">
      <div className="mx-auto flex max-w-[1880px] flex-col gap-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border border-white/10 bg-[#0b0f14] px-4 py-3">
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Training Matrix</div>
            <h1 className="text-2xl font-semibold tracking-tight">Матрица тренировок</h1>
            <p className="max-w-4xl text-sm text-slate-400">
              Теперь экран ещё ближе к вашему табличному листу: служебная строка месяца, плотная сетка,
              многослойные шапки дней, реальные подходы прямо в ячейке и ручной порядок упражнений.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center border border-white/10 bg-[#10161d]">
              <button
                type="button"
                className={`px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                  compactMode ? "bg-white/10 text-slate-100" : "text-slate-500"
                }`}
                onClick={() => setCompactMode(true)}
              >
                Плотно
              </button>
              <button
                type="button"
                className={`px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                  compactMode ? "text-slate-500" : "bg-white/10 text-slate-100"
                }`}
                onClick={() => setCompactMode(false)}
              >
                Свободно
              </button>
            </div>
            <Button
              variant="outline"
              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => setCursorDate(current => addMonths(current, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[190px] border border-white/10 bg-[#10161d] px-3 py-2 text-center text-sm font-medium capitalize">
              {monthHeading}
            </div>
            <Button
              variant="outline"
              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => setCursorDate(current => addMonths(current, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => setCursorDate(new Date())}
            >
              Текущий месяц
            </Button>
            <Button
              variant="outline"
              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => setImportOpen(true)}
            >
              Импорт HTML
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plus className="h-4 w-4" />
                  Новое упражнение
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Название упражнения"
                  className="rounded-none border-white/10 bg-white/5"
                  value={exerciseForm.name}
                  onChange={event => setExerciseForm(current => ({ ...current, name: event.target.value }))}
                />
                <Input
                  placeholder="Категория"
                  className="rounded-none border-white/10 bg-white/5"
                  value={exerciseForm.category}
                  onChange={event => setExerciseForm(current => ({ ...current, category: event.target.value }))}
                />
                <Input
                  placeholder="Основная группа мышц"
                  className="rounded-none border-white/10 bg-white/5"
                  value={exerciseForm.primaryMuscleGroup}
                  onChange={event =>
                    setExerciseForm(current => ({ ...current, primaryMuscleGroup: event.target.value }))
                  }
                />
                <Input
                  placeholder="Оборудование"
                  className="rounded-none border-white/10 bg-white/5"
                  value={exerciseForm.equipment}
                  onChange={event => setExerciseForm(current => ({ ...current, equipment: event.target.value }))}
                />
                <Select
                  value={exerciseForm.volumeMode}
                  onValueChange={value =>
                    setExerciseForm(current => ({ ...current, volumeMode: value as TrainingVolumeMode }))
                  }
                >
                  <SelectTrigger className="rounded-none border-white/10 bg-white/5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(volumeModeLabels) as TrainingVolumeMode[]).map(mode => (
                      <SelectItem key={mode} value={mode}>
                        {volumeModeLabels[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Заметки"
                  className="rounded-none border-white/10 bg-white/5"
                  value={exerciseForm.notes}
                  onChange={event => setExerciseForm(current => ({ ...current, notes: event.target.value }))}
                />
                <Button className="w-full rounded-none" onClick={handleCreateExercise} disabled={createExercise.isPending}>
                  Добавить упражнение
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
              <CardHeader>
                <CardTitle className="text-base">Сводка</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Упражнений в системе</span>
                  <span className="font-semibold">{dashboardQuery.data?.summary.exerciseCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Тренировок за 30 дней</span>
                  <span className="font-semibold">{dashboardQuery.data?.summary.workoutsLast30Days ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Суммарный объём</span>
                  <span className="font-semibold">
                    {(dashboardQuery.data?.summary.totalVolumeKg ?? 0).toLocaleString("ru-RU")}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-px border border-white/10 bg-white/10 xl:grid-cols-4">
              <div className="bg-[#0b0f14] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Месяц</div>
                <div className="mt-2 text-2xl font-semibold">{grandTotal.toLocaleString("ru-RU")}</div>
                <div className="mt-1 text-[11px] text-slate-400">общий объём по тренировочным дням</div>
              </div>
              <div className="bg-[#0b0f14] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Дней с тренировкой</div>
                <div className="mt-2 text-2xl font-semibold">{workoutDaysCount}</div>
                <div className="mt-1 text-[11px] text-slate-400">заполненные столбцы текущего месяца</div>
              </div>
              <div className="bg-[#0b0f14] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Средний день</div>
                <div className="mt-2 text-2xl font-semibold">{averageDayVolume.toLocaleString("ru-RU")}</div>
                <div className="mt-1 text-[11px] text-slate-400">средний объём на тренировочный день</div>
              </div>
              <div className="bg-[#0b0f14] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Пик дня</div>
                <div className="mt-2 text-2xl font-semibold">{maxDayVolume.toLocaleString("ru-RU")}</div>
                <div className="mt-1 text-[11px] text-slate-400">максимальный объём за день в месяце</div>
              </div>
            </div>

            <Card className="rounded-none border-white/10 bg-[#090d12] text-slate-100">
              <CardHeader className="border-b border-white/10 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Grid2X2 className="h-4 w-4" />
                  Месячная матрица
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0 overflow-x-auto p-0">
                <div className="grid grid-cols-[250px_104px_repeat(4,minmax(0,1fr))] gap-px border-b border-white/10 bg-white/10 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  <div className="bg-[#0b0f14] px-4 py-2">Порядок</div>
                  <div className="bg-[#0b0f14] px-3 py-2 text-center">Итого</div>
                  <div className="bg-[#0b0f14] px-3 py-2 text-center">Трен. дней</div>
                  <div className="bg-[#0b0f14] px-3 py-2 text-center">Упражнений</div>
                  <div className="bg-[#0b0f14] px-3 py-2 text-center">Ячеек</div>
                  <div className="bg-[#0b0f14] px-3 py-2 text-center">Режим</div>
                </div>
                <div className="grid grid-cols-[250px_104px_repeat(4,minmax(0,1fr))] gap-px border-b border-white/10 bg-white/10 text-sm">
                  <div className="bg-[#0b0f14] px-4 py-2 text-slate-300">Месяц {monthHeading}</div>
                  <div className="bg-[#0b0f14] px-3 py-2 text-center font-semibold">{grandTotal.toLocaleString("ru-RU")}</div>
                  <div className="bg-[#0b0f14] px-3 py-2 text-center font-semibold">{workoutDaysCount}</div>
                  <div className="bg-[#0b0f14] px-3 py-2 text-center font-semibold">{exerciseRows.length}</div>
                  <div className="bg-[#0b0f14] px-3 py-2 text-center font-semibold">
                    {exerciseRows.reduce((sum, row) => sum + row.activeDays, 0)}
                  </div>
                  <div className="bg-[#0b0f14] px-3 py-2 text-center font-semibold">
                    {compactMode ? "Плотно" : "Свободно"}
                  </div>
                </div>
                <div className="grid grid-cols-[250px_minmax(0,1fr)] gap-px border-b border-white/10 bg-white/10 text-sm">
                  <div className="bg-[#0b0f14] px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                    Пометки месяца
                  </div>
                  <div className="bg-[#0b0f14] p-1.5">
                    <Input
                      value={monthNote}
                      onChange={event => setMonthNote(event.target.value)}
                      placeholder="Например: силовой акцент, восстановительная неделя, работа на объём"
                      className="h-8 rounded-none border-white/10 bg-white/5 text-sm"
                    />
                  </div>
                </div>

                <table className={`${tableMinWidth} border-collapse`}>
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-30 min-w-[250px] border border-white/10 bg-[#0c1118] px-4 py-1 text-left text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                        Упражнение
                      </th>
                      <th className="min-w-[104px] border border-white/10 bg-[#0c1118] px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                        Итого
                      </th>
                      {matrixDays.map(day => (
                        <th
                          key={day.date}
                          className={`min-w-[88px] border border-white/10 px-1 py-0 text-center ${getDayScenarioClass(
                            day.date,
                            day.summary?.volume ?? 0,
                            maxDayVolume
                          )}`}
                        >
                          <div className="border-b border-white/10 py-1">
                            <div className="text-[11px] font-semibold leading-none text-emerald-400">
                              {day.summary ? (
                                formatCellValue(day.summary.volume, "weight_reps")
                              ) : (
                                <Minus className="mx-auto h-3 w-3 text-slate-700" />
                              )}
                            </div>
                            <div className="mt-1 text-[9px] text-slate-500">
                              {day.summary?.startTimeText || ""}
                              {day.summary?.durationMinutes ? ` • ${day.summary.durationMinutes} мин` : ""}
                            </div>
                          </div>
                          <div className="py-1">
                            <div className="text-xs font-semibold leading-none text-slate-100">{day.day}</div>
                            <div className={`mt-1 text-[9px] uppercase tracking-[0.2em] ${getWeekdayTone(day.date)}`}>
                              {format(new Date(day.date), "EEE", { locale: ru })}
                            </div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exerciseRows.map((exercise, index) => {
                      const accent = getExerciseAccent(exercise.volumeMode);
                      return (
                        <tr key={exercise.id}>
                          <td
                            className={`sticky left-0 z-20 border border-white/10 bg-[#0b0f14] ${rowStickyPadding} align-top before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] ${accent.stripe} relative`}
                          >
                            <div className="flex items-start justify-between gap-3 pl-1">
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5 flex flex-col border border-white/10 bg-white/5">
                                  <button
                                    type="button"
                                    className="px-1 py-1 text-slate-400 transition hover:bg-white/10 hover:text-slate-100 disabled:opacity-30"
                                    onClick={() => moveExercise(exercise.id, "up")}
                                    disabled={index === 0}
                                    aria-label={`Поднять ${exercise.name}`}
                                  >
                                    <ArrowUp className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    className="border-t border-white/10 px-1 py-1 text-slate-400 transition hover:bg-white/10 hover:text-slate-100 disabled:opacity-30"
                                    onClick={() => moveExercise(exercise.id, "down")}
                                    disabled={index === exerciseRows.length - 1}
                                    aria-label={`Опустить ${exercise.name}`}
                                  >
                                    <ArrowDown className="h-3 w-3" />
                                  </button>
                                </div>
                                <div>
                                  <div className="font-medium leading-tight text-slate-100">{exercise.name}</div>
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    {exercise.primaryMuscleGroup || exercise.category || volumeModeLabels[exercise.volumeMode]}
                                  </div>
                                </div>
                              </div>
                              <div className={`rounded-none border px-2 py-1 text-[9px] font-medium uppercase tracking-wide ${accent.pill}`}>
                                {exercise.activeDays} дн.
                              </div>
                            </div>
                          </td>
                          <td className="border border-white/10 bg-[#10161d] px-2 py-2 text-center align-middle">
                            <div className="text-sm font-semibold">{formatCellValue(exercise.total, exercise.volumeMode)}</div>
                            <div className="mt-1 text-[9px] uppercase tracking-[0.2em] text-slate-500">
                              {getCellHint(exercise.volumeMode)}
                            </div>
                          </td>
                          {matrixDays.map(day => {
                            const cell = exercise.cells[day.date];
                            const hasValue = Boolean(cell);
                            const cellVolume = cell?.volume ?? 0;
                            const cellSetsCount = cell?.setsCount ?? 0;
                            const previewLines = getPreviewLines(cell?.rawInput);

                            return (
                              <td key={day.date} className="border border-white/10 p-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedCell({
                                      date: day.date,
                                      exerciseId: exercise.id,
                                      exerciseName: exercise.name,
                                      volumeMode: exercise.volumeMode,
                                    })
                                  }
                                  className={`flex w-full flex-col items-center justify-center ${rowCellHeight} ${cellPadding} text-center transition-colors ${
                                    hasValue ? `${accent.cell} text-slate-100` : "bg-[#0a0f15] hover:bg-[#111923]"
                                  }`}
                                >
                                  <div className="text-[11px] font-semibold leading-none">
                                    {hasValue ? formatCellValue(cellVolume, exercise.volumeMode) : ""}
                                  </div>
                                  <div className="mt-1 text-[8px] uppercase tracking-[0.18em] text-slate-500">
                                    {hasValue ? `${cellSetsCount} сет.` : "+"}
                                  </div>
                                  <div className={`mt-1 flex ${previewHeight} w-full flex-col items-center justify-start gap-0.5 text-[9px] leading-tight text-slate-400`}>
                                    {previewLines.map(line => (
                                      <div key={line} className="max-w-full truncate">
                                        {line}
                                      </div>
                                    ))}
                                  </div>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    <tr>
                      <td className="sticky left-0 z-20 border border-white/10 bg-[#0c1118] px-4 py-2 font-semibold text-slate-100">
                        Итог по дням
                      </td>
                      <td className="border border-white/10 bg-[#121921] px-2 py-2 text-center text-sm font-semibold">
                        {grandTotal.toLocaleString("ru-RU")}
                      </td>
                      {matrixDays.map(day => (
                        <td key={day.date} className="border border-white/10 bg-[#0f151c] px-1 py-2 text-center">
                          <div className="text-xs font-semibold text-slate-100">
                            {day.summary ? day.summary.volume.toLocaleString("ru-RU") : ""}
                          </div>
                          <div className="mt-1 text-[8px] uppercase tracking-[0.18em] text-slate-500">
                            {day.summary ? "день" : ""}
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
                <CardHeader className="border-b border-white/10 pb-3">
                  <CardTitle className="text-base">Прогресс и рекорды</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  {(dashboardQuery.data?.progressHighlights ?? []).slice(0, 6).map(item => (
                    <div
                      key={item.exerciseId}
                      className="grid grid-cols-[minmax(0,1fr)_120px_120px] items-center gap-3 border border-white/10 bg-white/5 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-100">{item.exerciseName}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.primaryMuscleGroup || "Без группы"} • {item.sessions} сесс.
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{item.currentEstimatedOneRepMax.toLocaleString("ru-RU")}</div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">e1RM</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-semibold ${item.deltaEstimatedOneRepMax >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {item.deltaEstimatedOneRepMax >= 0 ? "+" : ""}
                          {item.deltaEstimatedOneRepMax.toLocaleString("ru-RU")}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">дельта</div>
                      </div>
                    </div>
                  ))}
                  {!dashboardQuery.data?.progressHighlights?.length && (
                    <div className="border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
                      Аналитика появится после нескольких тренировок с рабочими подходами.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
                <CardHeader className="border-b border-white/10 pb-3">
                  <CardTitle className="text-base">Структура нагрузки</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  {(dashboardQuery.data?.muscleGroupDistribution ?? []).slice(0, 8).map(item => {
                    const totalSets = (dashboardQuery.data?.muscleGroupDistribution ?? []).reduce((sum, row) => sum + row.sets, 0);
                    const share = totalSets ? Math.round((item.sets / totalSets) * 100) : 0;
                    return (
                      <div key={item.name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate text-slate-200">{item.name}</span>
                          <span className="text-slate-500">{item.sets} сет.</span>
                        </div>
                        <div className="h-2 bg-white/5">
                          <div className="h-full bg-cyan-400/80" style={{ width: `${share}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="border-t border-white/10 pt-3">
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Последние тренировки</div>
                    <div className="space-y-2">
                      {(dashboardQuery.data?.recentSessions ?? []).slice(0, 5).map(session => (
                        <div key={session.id} className="flex items-center justify-between border border-white/10 bg-white/5 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <div className="truncate text-slate-100">{session.title}</div>
                            <div className="text-xs text-slate-500">
                              {format(new Date(session.performedAt), "d MMM yyyy", { locale: ru })}
                            </div>
                          </div>
                          <div className="text-right text-xs text-slate-400">
                            {session.durationMinutes ? `${session.durationMinutes} мин` : "без длит."}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedCell)} onOpenChange={open => !open && setSelectedCell(null)}>
        <DialogContent className="max-w-3xl border-white/10 bg-[#0b0f14] text-slate-100">
          <DialogHeader>
            <DialogTitle>
              {selectedCell?.exerciseName} •{" "}
              {selectedCell ? format(new Date(selectedCell.date), "d MMMM yyyy", { locale: ru }) : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder="Название тренировки"
              className="rounded-none border-white/10 bg-white/5"
              value={editorForm.sessionTitle}
              onChange={event => setEditorForm(current => ({ ...current, sessionTitle: event.target.value }))}
            />
            <Input
              placeholder="Время начала"
              className="rounded-none border-white/10 bg-white/5"
              value={editorForm.startTimeText}
              onChange={event => setEditorForm(current => ({ ...current, startTimeText: event.target.value }))}
            />
            <Input
              type="number"
              placeholder="Длительность, мин"
              className="rounded-none border-white/10 bg-white/5"
              value={editorForm.durationMinutes}
              onChange={event => setEditorForm(current => ({ ...current, durationMinutes: event.target.value }))}
            />
          </div>

          <Textarea
            placeholder={`Быстрый ввод. Например:\n55кг 20\n55кг 17 16 13\n20кг 30*4\n80кг 12, 10, 8\n12. 14. 16. 13. 11`}
            value={editorForm.rawInput}
            onChange={event => setEditorForm(current => ({ ...current, rawInput: event.target.value }))}
            className="min-h-[220px] rounded-none border-white/10 bg-white/5 font-mono text-sm"
          />

          <div className="border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400">
            <div className="font-medium text-slate-100">Как считаем</div>
            <div className="mt-1">Режим объёма: {selectedCell ? volumeModeLabels[selectedCell.volumeMode] : ""}</div>
            <div className="mt-1">
              В ячейке будет показан {selectedCell ? getCellHint(selectedCell.volumeMode) : "итог"} по этому
              упражнению за день.
            </div>
          </div>

          <Textarea
            placeholder="Комментарий к упражнению в этой тренировке"
            className="rounded-none border-white/10 bg-white/5"
            value={editorForm.notes}
            onChange={event => setEditorForm(current => ({ ...current, notes: event.target.value }))}
          />

          <Textarea
            placeholder="Заметка ко всей тренировке"
            className="rounded-none border-white/10 bg-white/5"
            value={editorForm.sessionNotes}
            onChange={event => setEditorForm(current => ({ ...current, sessionNotes: event.target.value }))}
          />

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => setEditorForm(current => ({ ...current, rawInput: "" }))}
            >
              Очистить ввод
            </Button>
            <Button className="rounded-none" onClick={handleSaveCell} disabled={upsertCell.isPending}>
              Сохранить ячейку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-4xl border-white/10 bg-[#0b0f14] text-slate-100">
          <DialogHeader>
            <DialogTitle>Импорт старых HTML-записей</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm text-slate-400">
            <p>
              Вставьте HTML или сырой фрагмент старой таблицы. Я разберу даты из шапки, строки упражнений и
              непустые ячейки с подходами.
            </p>
            <p>
              Если упражнение ещё не существует, оно будет создано автоматически. Для новых упражнений импорт
              по умолчанию использует режим `Вес × повторения`.
            </p>
          </div>

          <Textarea
            value={importText}
            onChange={event => setImportText(event.target.value)}
            placeholder="<table>...</table>"
            className="min-h-[260px] rounded-none border-white/10 bg-white/5 font-mono text-xs"
          />

          <div className="grid gap-3 md:grid-cols-3">
            <div className="border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Ячеек</div>
              <div className="mt-1 text-xl font-semibold text-slate-100">{selectedImportKeys.length}</div>
            </div>
            <div className="border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Упражнений</div>
              <div className="mt-1 text-xl font-semibold text-slate-100">{importPreviewExercises.length}</div>
            </div>
            <div className="border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Дней</div>
              <div className="mt-1 text-xl font-semibold text-slate-100">{importPreviewDays.length}</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[0.95fr_1.05fr]">
            <div className="border border-white/10 bg-white/5">
              <div className="border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                Найденные упражнения
              </div>
              <div className="max-h-48 overflow-auto px-3 py-2 text-sm">
                {importPreviewExercises.length ? (
                  <div className="space-y-1">
                    {importPreviewExercises.slice(0, 20).map(name => (
                      <div key={name} className="truncate text-slate-200">
                        {name}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-500">Пока нечего импортировать</div>
                )}
              </div>
            </div>
            <div className="border border-white/10 bg-white/5">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Подтверждение ячеек</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-[10px] uppercase tracking-[0.18em] text-slate-400 hover:text-slate-100"
                    onClick={() => setSelectedImportKeys(importPreview.map(item => item.key))}
                  >
                    Все
                  </button>
                  <button
                    type="button"
                    className="text-[10px] uppercase tracking-[0.18em] text-slate-400 hover:text-slate-100"
                    onClick={() => setSelectedImportKeys([])}
                  >
                    Снять
                  </button>
                </div>
              </div>
              <div className="max-h-48 overflow-auto px-3 py-2 text-sm">
                {importPreview.length ? (
                  <div className="space-y-2">
                    {importPreview.slice(0, 12).map((item, index) => (
                      <label
                        key={`${item.exerciseName}-${item.date}-${index}`}
                        className="flex cursor-pointer gap-2 border border-white/10 px-2 py-2"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selectedImportKeys.includes(item.key)}
                          onChange={event =>
                            setSelectedImportKeys(current =>
                              event.target.checked
                                ? [...current, item.key]
                                : current.filter(key => key !== item.key)
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-slate-100">{item.exerciseName}</span>
                            <span className="text-xs text-slate-500">{item.date}</span>
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs text-slate-400">{item.rawInput}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-500">Вставьте HTML, чтобы увидеть разбор до импорта</div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => setImportText("")}
            >
              Очистить
            </Button>
            <Button
              className="rounded-none"
              onClick={handleImportLegacyHtml}
              disabled={!importText.trim() || createExercise.isPending || upsertCell.isPending}
            >
              Импортировать в месяц
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
