import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { addMonths, format } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, FileUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

type ExerciseDraft = {
  id: string;
  name: string;
  weightKg: string;
  reps: string;
};

type ImportEntry = {
  key: string;
  date: string;
  exerciseName: string;
  rawInput: string;
};

type ImportWorkout = {
  key: string;
  date: string;
  exerciseCount: number;
  entries: ImportEntry[];
};

type EditableSession = {
  id: number;
  title: string;
  date: string;
  startTimeText: string;
  durationMinutes: string;
  notes: string;
  exercises: ExerciseDraft[];
};

const russianMonthMap: Record<string, number> = {
  январь: 1,
  янв: 1,
  февраль: 2,
  фев: 2,
  март: 3,
  мар: 3,
  апрель: 4,
  апр: 4,
  май: 5,
  мая: 5,
  июнь: 6,
  июн: 6,
  июль: 7,
  июл: 7,
  август: 8,
  авг: 8,
  сентябрь: 9,
  сент: 9,
  сен: 9,
  октябрь: 10,
  окт: 10,
  ноябрь: 11,
  ноя: 11,
  декабрь: 12,
  дек: 12,
};

function createExerciseDraft(): ExerciseDraft {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    weightKg: "",
    reps: "",
  };
}

function createEmptyTrainingForm() {
  return {
    date: format(new Date(), "yyyy-MM-dd"),
    title: "",
    startTimeText: "",
    durationMinutes: "",
    notes: "",
    exercises: [createExerciseDraft()],
  };
}

function formatKg(value: number) {
  return `${value.toLocaleString("ru-RU")} кг`;
}

function formatDelta(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("ru-RU")}`;
}

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseMonthFromHeading(value: string) {
  const token = value.toLowerCase().replace(/\./g, "").trim();
  return russianMonthMap[token] ?? null;
}

function toTextFromHtml(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n");
  return container.textContent?.replace(/\r/g, "").trim() ?? "";
}

function extractParagraphBlocks(cell: Element) {
  const paragraphs = Array.from(cell.querySelectorAll(".para"));
  if (paragraphs.length === 0) {
    const text = toTextFromHtml(cell.innerHTML);
    return text ? [text.split("\n").map(line => normalizeText(line)).filter(Boolean)] : [];
  }

  return paragraphs
    .map(paragraph => toTextFromHtml(paragraph.innerHTML))
    .map(block => block.split("\n").map(line => normalizeText(line)).filter(Boolean))
    .filter(lines => lines.length > 0);
}

function parseExerciseParagraph(lines: string[]) {
  const joined = lines.join("\n").trim();
  if (!joined || /^итого[:\s]/i.test(joined)) return null;

  let exerciseName = lines[0].replace(/[:：]\s*$/, "").trim();
  const restLines = [...lines.slice(1)];
  const sameLineMatch = exerciseName.match(/^(.+?)(\d+(?:[.,]\d+)?\s*(?:кг|kg)|\d+\.)/i);

  if (sameLineMatch) {
    exerciseName = sameLineMatch[1].trim().replace(/[:：]\s*$/, "");
    restLines.unshift(lines[0].slice(sameLineMatch[1].length).trim());
  }

  const cleanedRest = restLines
    .map(line => normalizeText(line))
    .filter(Boolean)
    .filter(line => !/^итого[:\s]/i.test(line))
    .filter(line => !/^\d[\d\s.,]*$/.test(line));

  const rawInput = cleanedRest.join("\n").trim();
  if (!exerciseName || !rawInput || !/\d/.test(rawInput)) return null;

  return {
    exerciseName: normalizeText(exerciseName),
    rawInput,
  };
}

function parseImportEntries(html: string, year: number) {
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("en-table table, table"));
  const results: ImportEntry[] = [];

  tables.forEach((table, tableIndex) => {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length < 4) return;

    const monthHeading = normalizeText(rows[0].textContent ?? "");
    const month = parseMonthFromHeading(monthHeading);
    if (!month) return;

    const columnDates = Array.from(rows[1].children).map(cell => {
      const text = normalizeText(cell.textContent ?? "");
      const dayOnlyMatch = text.match(/^\d{1,2}$/);
      if (!dayOnlyMatch) return null;
      return format(new Date(year, month - 1, Number(dayOnlyMatch[0])), "yyyy-MM-dd");
    });

    rows.slice(3).forEach((row, rowIndex) => {
      Array.from(row.children).forEach((cell, cellIndex) => {
        const date = columnDates[cellIndex];
        if (!date) return;

        extractParagraphBlocks(cell).forEach((paragraphLines, paragraphIndex) => {
          const parsed = parseExerciseParagraph(paragraphLines);
          if (!parsed) return;

          results.push({
            key: `${tableIndex}-${rowIndex}-${cellIndex}-${paragraphIndex}`,
            date,
            exerciseName: parsed.exerciseName,
            rawInput: parsed.rawInput,
          });
        });
      });
    });
  });

  return results;
}

export default function TrainingPage() {
  const utils = trpc.useUtils();
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [yearCursor, setYearCursor] = useState(() => new Date().getFullYear());
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<EditableSession | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importYear, setImportYear] = useState(() => new Date().getFullYear());
  const [importSource, setImportSource] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [showImportSource, setShowImportSource] = useState(false);
  const [selectedImportKeys, setSelectedImportKeys] = useState<string[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>("auto");
  const [trainingForm, setTrainingForm] = useState(createEmptyTrainingForm);

  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth() + 1;

  const matrixQuery = trpc.training.matrixByMonth.useQuery({ year, month });
  const analyticsQuery = trpc.training.analytics.useQuery({
    year,
    month,
    exerciseId: selectedExerciseId === "auto" ? undefined : Number(selectedExerciseId),
  });
  const yearOverviewQuery = trpc.training.yearOverview.useQuery({ year: yearCursor });
  const monthSessionsQuery = trpc.training.listMonthSessions.useQuery({ year, month });
  const exercisesQuery = trpc.training.listExercises.useQuery();
  const createExercise = trpc.training.createExercise.useMutation();

  const createSession = trpc.training.createSession.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.training.matrixByMonth.invalidate(),
        utils.training.yearOverview.invalidate(),
        utils.training.listMonthSessions.invalidate(),
        utils.training.dashboard.invalidate(),
        utils.training.analytics.invalidate(),
        utils.training.listExercises.invalidate(),
      ]);
      setCreateOpen(false);
      setEditingSession(null);
      setTrainingForm(createEmptyTrainingForm());
      toast.success("Тренировка добавлена");
    },
  });

  const updateSession = trpc.training.updateSession.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.training.matrixByMonth.invalidate(),
        utils.training.yearOverview.invalidate(),
        utils.training.listMonthSessions.invalidate(),
        utils.training.dashboard.invalidate(),
        utils.training.analytics.invalidate(),
        utils.training.listExercises.invalidate(),
      ]);
      setCreateOpen(false);
      setEditingSession(null);
      setTrainingForm(createEmptyTrainingForm());
      toast.success("Тренировка обновлена");
    },
  });

  const deleteSession = trpc.training.deleteSession.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.training.matrixByMonth.invalidate(),
        utils.training.yearOverview.invalidate(),
        utils.training.listMonthSessions.invalidate(),
        utils.training.dashboard.invalidate(),
        utils.training.analytics.invalidate(),
      ]);
      setCreateOpen(false);
      setEditingSession(null);
      setTrainingForm(createEmptyTrainingForm());
      toast.success("Тренировка удалена");
    },
  });

  const upsertCell = trpc.training.upsertCell.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.training.matrixByMonth.invalidate(),
        utils.training.yearOverview.invalidate(),
        utils.training.listMonthSessions.invalidate(),
        utils.training.dashboard.invalidate(),
        utils.training.analytics.invalidate(),
        utils.training.listExercises.invalidate(),
      ]);
    },
  });

  const monthHeading = useMemo(() => format(cursorDate, "LLLL yyyy", { locale: ru }), [cursorDate]);
  const monthDays = matrixQuery.data?.days ?? [];
  const monthExercises = matrixQuery.data?.exercises ?? [];

  const monthSummary = useMemo(() => {
    const totalVolume = monthDays.reduce((sum, day) => sum + (day.summary?.volume ?? 0), 0);
    const workoutCount = monthDays.filter(day => Boolean(day.summary)).length;
    const maxDayVolume = Math.max(0, ...monthDays.map(day => day.summary?.volume ?? 0));
    const averageVolume = workoutCount > 0 ? Math.round(totalVolume / workoutCount) : 0;

    const topExercises = monthExercises
      .map(exercise => ({
        id: exercise.id,
        name: exercise.name,
        totalVolume: monthDays.reduce(
          (sum, day) => sum + (exercise.cells[day.date]?.volume ?? 0),
          0
        ),
      }))
      .filter(exercise => exercise.totalVolume > 0)
      .sort((left, right) => right.totalVolume - left.totalVolume)
      .slice(0, 5);

    return { totalVolume, workoutCount, maxDayVolume, averageVolume, topExercises };
  }, [monthDays, monthExercises]);

  const monthSessions = useMemo(
    () =>
      [...(monthSessionsQuery.data ?? [])].sort(
        (left, right) =>
          new Date(right.performedAt).getTime() - new Date(left.performedAt).getTime()
      ),
    [monthSessionsQuery.data]
  );

  const importEntries = useMemo(() => parseImportEntries(importSource, importYear), [importSource, importYear]);
  const importExerciseNames = useMemo(
    () => Array.from(new Set(importEntries.map(item => item.exerciseName))).sort((a, b) => a.localeCompare(b, "ru")),
    [importEntries]
  );
  const importDates = useMemo(() => Array.from(new Set(importEntries.map(item => item.date))).sort(), [importEntries]);
  const importWorkouts = useMemo<ImportWorkout[]>(
    () =>
      importDates.map(date => {
        const entries = importEntries.filter(item => item.date === date);
        return {
          key: date,
          date,
          exerciseCount: entries.length,
          entries,
        };
      }),
    [importDates, importEntries]
  );
  const selectedImportEntries = useMemo(
    () => importEntries.filter(item => selectedImportKeys.includes(item.date)),
    [importEntries, selectedImportKeys]
  );
  const knownExerciseNames = useMemo(
    () => Array.from(new Set((exercisesQuery.data ?? []).map(item => item.name))).sort((a, b) => a.localeCompare(b, "ru")),
    [exercisesQuery.data]
  );
  const analyticsData = analyticsQuery.data;
  const exerciseSelectValue = analyticsData?.exercises.selectedExerciseId
    ? String(analyticsData.exercises.selectedExerciseId)
    : "auto";
  const activeExerciseValue = selectedExerciseId === "auto" ? exerciseSelectValue : selectedExerciseId;

  function resetFormAndCloseDialog() {
    setCreateOpen(false);
    setEditingSession(null);
    setTrainingForm(createEmptyTrainingForm());
  }

  function openCreateDialog() {
    setEditingSession(null);
    setTrainingForm(createEmptyTrainingForm());
    setCreateOpen(true);
  }

  function updateExerciseRow(id: string, field: keyof Omit<ExerciseDraft, "id">, value: string) {
    setTrainingForm(current => ({
      ...current,
      exercises: current.exercises.map(row => (row.id === id ? { ...row, [field]: value } : row)),
    }));
  }

  function handleExerciseFieldKeyDown(
    rowId: string,
    field: keyof Omit<ExerciseDraft, "id">,
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key !== "ArrowDown") return;

    event.preventDefault();

    const currentIndex = trainingForm.exercises.findIndex(row => row.id === rowId);
    if (currentIndex === -1) return;

    const nextRow = trainingForm.exercises[currentIndex + 1];
    if (!nextRow) return;

    const nextInput = document.querySelector<HTMLInputElement>(
      `[data-exercise-id="${nextRow.id}"][data-exercise-field="${field}"]`
    );

    nextInput?.focus();
    nextInput?.select();
  }

  function addExerciseRow() {
    setTrainingForm(current => ({
      ...current,
      exercises: [...current.exercises, createExerciseDraft()],
    }));
  }

  function removeExerciseRow(id: string) {
    setTrainingForm(current => ({
      ...current,
      exercises:
        current.exercises.length === 1
          ? current.exercises
          : current.exercises.filter(row => row.id !== id),
    }));
  }

  function openEditDialog(session: NonNullable<(typeof monthSessionsQuery.data)>[number]) {
    const exercises =
      session.exercises.length > 0
        ? session.exercises.flatMap(item => {
            const exerciseName = item.exercise?.name ?? `Упражнение #${item.exerciseId}`;
            if (item.sets.length === 0) {
              return [createExerciseDraft()];
            }

            return item.sets.map(set => {
              const weight =
                set.weightKg ??
                set.effectiveWeightKg ??
                set.additionalWeightKg ??
                0;
              const reps = set.reps ?? 0;

              return {
                id: Math.random().toString(36).slice(2, 10),
                name: exerciseName,
                weightKg: weight ? String(weight) : "",
                reps: reps ? String(reps) : "",
              };
            });
          })
        : [createExerciseDraft()];

    setEditingSession({
      id: session.id,
      title: session.title,
      date: format(new Date(session.performedAt), "yyyy-MM-dd"),
      startTimeText: session.startTimeText ?? "",
      durationMinutes: session.durationMinutes ? String(session.durationMinutes) : "",
      notes: session.notes ?? "",
      exercises,
    });

    setTrainingForm({
      date: format(new Date(session.performedAt), "yyyy-MM-dd"),
      title: session.title,
      startTimeText: session.startTimeText ?? "",
      durationMinutes: session.durationMinutes ? String(session.durationMinutes) : "",
      notes: session.notes ?? "",
      exercises,
    });

    setCreateOpen(true);
  }

  async function handleDeleteSession(sessionId: number) {
    await deleteSession.mutateAsync({ sessionId });
  }

  async function handleSubmitTraining() {
    const normalizedRows = trainingForm.exercises
      .map(row => ({ ...row, name: row.name.trim(), weightKg: row.weightKg.trim(), reps: row.reps.trim() }))
      .filter(row => row.name || row.weightKg || row.reps);

    if (!trainingForm.title.trim()) {
      toast.error("Нужно указать название тренировки");
      return;
    }

    if (normalizedRows.length === 0) {
      toast.error("Добавьте хотя бы одно упражнение");
      return;
    }

    if (normalizedRows.some(row => !row.name || !row.weightKg || !row.reps)) {
      toast.error("Для каждого упражнения заполните название, вес и повторы");
      return;
    }

    const existingExercises = new Map(
      (exercisesQuery.data ?? []).map(exercise => [exercise.name.trim().toLowerCase(), exercise])
    );
    const groupedRows = new Map<
      string,
      {
        name: string;
        sets: Array<{ weight: number; reps: number }>;
      }
    >();

    for (const row of normalizedRows) {
      const weight = Number(row.weightKg.replace(",", "."));
      const reps = Number(row.reps.replace(",", "."));

      if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(reps) || reps <= 0) {
        toast.error(`Проверьте вес и повторы у упражнения "${row.name}"`);
        return;
      }

      const key = row.name.toLowerCase();
      const currentGroup = groupedRows.get(key);

      if (currentGroup) {
        currentGroup.sets.push({
          weight: Math.round(weight),
          reps: Math.round(reps),
        });
      } else {
        groupedRows.set(key, {
          name: row.name,
          sets: [
            {
              weight: Math.round(weight),
              reps: Math.round(reps),
            },
          ],
        });
      }
    }

    const sessionExercises = [];

    for (const [key, group] of Array.from(groupedRows.entries())) {
      let exercise = existingExercises.get(key);

      if (!exercise) {
        exercise = await createExercise.mutateAsync({ name: group.name, volumeMode: "weight_reps" });
        existingExercises.set(key, exercise);
      }

      sessionExercises.push({
        exerciseId: exercise.id,
        sets: group.sets.map((set: { weight: number; reps: number }) => ({
          setType: "work" as const,
          weightKg: set.weight,
          reps: set.reps,
          rawInput: `${set.weight}кг ${set.reps}`,
        })),
      });
    }

    const payload = {
      title: trainingForm.title.trim(),
      performedAt: new Date(`${trainingForm.date}T12:00:00`).toISOString(),
      startTimeText: trainingForm.startTimeText.trim() || undefined,
      durationMinutes: trainingForm.durationMinutes.trim() ? Number(trainingForm.durationMinutes) : null,
      notes: trainingForm.notes.trim() || undefined,
      exercises: sessionExercises,
    };

    if (editingSession) {
      await updateSession.mutateAsync({ sessionId: editingSession.id, ...payload });
      return;
    }

    await createSession.mutateAsync(payload);
  }

  async function handleImport() {
    if (selectedImportEntries.length === 0) {
      toast.error("Нечего импортировать: выберите хотя бы одну запись");
      return;
    }

    const existingExercises = new Map(
      (exercisesQuery.data ?? []).map(exercise => [exercise.name.trim().toLowerCase(), exercise])
    );

    let importedCount = 0;

    for (const entry of selectedImportEntries) {
      const key = entry.exerciseName.toLowerCase();
      let exercise = existingExercises.get(key);

      if (!exercise) {
        exercise = await createExercise.mutateAsync({ name: entry.exerciseName, volumeMode: "weight_reps" });
        existingExercises.set(key, exercise);
      }

      await upsertCell.mutateAsync({
        date: entry.date,
        exerciseId: exercise.id,
        rawInput: entry.rawInput,
        sessionTitle: `Импорт ${entry.date}`,
      });

      importedCount += 1;
    }

    setImportOpen(false);
    setImportSource("");
    setImportFileName("");
    setSelectedImportKeys([]);
    setShowImportSource(false);
    toast.success(`Импортировано записей: ${importedCount}`);
  }

  async function handleImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportSource(text);
    setImportFileName(file.name);
    setSelectedImportKeys([]);
    setShowImportSource(false);
    event.target.value = "";
  }

  function renderSessionCard(session: NonNullable<(typeof monthSessionsQuery.data)>[number]) {
    const sessionVolume = session.exercises.reduce(
      (sum, exercise) => sum + (exercise.computedVolume ?? 0),
      0
    );

    return (
      <div key={session.id} className="border border-white/10 bg-white/5 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => openEditDialog(session)}
          >
            <div className="truncate font-medium text-slate-100">{session.title}</div>
            <div className="mt-1 text-xs text-slate-500">
              {format(new Date(session.performedAt), "d MMMM yyyy", { locale: ru })}
              {session.durationMinutes ? ` • ${session.durationMinutes} мин` : ""}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {session.exercises.length} упражн. • {formatKg(sessionVolume)}
            </div>
          </button>

          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => openEditDialog(session)}
            >
              Открыть
            </Button>
            <Button
              variant="outline"
              className="rounded-none border-rose-500/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
              onClick={() => handleDeleteSession(session.id)}
              disabled={deleteSession.isPending}
            >
              Удалить
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderRecordCard(label: string, value: string, hint?: string) {
    return (
      <div className="border border-white/10 bg-white/5 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
        <div className="mt-2 text-lg font-semibold text-slate-100">{value}</div>
        {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[#07090d] text-slate-100">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border border-white/10 bg-[#0b0f14] px-5 py-4">
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Training Dashboard</div>
            <h1 className="text-2xl font-semibold tracking-tight">Тренировки</h1>
            <p className="max-w-3xl text-sm text-slate-400">
              Месячная грузоподъёмность, аналитика по году и быстрый ручной ввод тренировок.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center border border-white/10 bg-[#10161d]">
              <Button variant="ghost" className="rounded-none border-r border-white/10 px-3 text-slate-100 hover:bg-white/10" onClick={() => setCursorDate(current => addMonths(current, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[170px] px-4 text-center text-sm font-medium capitalize">{monthHeading}</div>
              <Button variant="ghost" className="rounded-none border-l border-white/10 px-3 text-slate-100 hover:bg-white/10" onClick={() => setCursorDate(current => addMonths(current, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" onClick={() => setCursorDate(new Date())}>
              Текущий месяц
            </Button>
            <Button variant="outline" className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" onClick={() => setImportOpen(true)}>
              <FileUp className="mr-2 h-4 w-4" />
              Импорт HTML
            </Button>
            <Button className="rounded-none" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить тренировку
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Грузоподъёмность месяца</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{formatKg(monthSummary.totalVolume)}</div><div className="mt-2 text-sm text-slate-500">Сумма по всем упражнениям за выбранный месяц</div></CardContent></Card>
          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Количество тренировок</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{monthSummary.workoutCount}</div><div className="mt-2 text-sm text-slate-500">Тренировочных дней в месяце</div></CardContent></Card>
          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Средняя тренировка</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{formatKg(monthSummary.averageVolume)}</div><div className="mt-2 text-sm text-slate-500">Средняя грузоподъёмность на тренировочный день</div></CardContent></Card>
          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Пиковый день</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{formatKg(monthSummary.maxDayVolume)}</div><div className="mt-2 text-sm text-slate-500">Максимальная грузоподъёмность за день</div></CardContent></Card>
        </div>

        <Tabs defaultValue="overview" className="gap-4">
          <TabsList className="h-auto rounded-none border border-white/10 bg-[#10161d] p-1">
            <TabsTrigger value="overview" className="rounded-none data-[state=active]:bg-white/10 data-[state=active]:text-white">Обзор</TabsTrigger>
            <TabsTrigger value="load" className="rounded-none data-[state=active]:bg-white/10 data-[state=active]:text-white">Нагрузка</TabsTrigger>
            <TabsTrigger value="exercises" className="rounded-none data-[state=active]:bg-white/10 data-[state=active]:text-white">Упражнения</TabsTrigger>
            <TabsTrigger value="records" className="rounded-none data-[state=active]:bg-white/10 data-[state=active]:text-white">Рекорды</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
                <CardHeader className="border-b border-white/10 pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Грузоподъёмность по месяцам</CardTitle>
                    <div className="flex items-center border border-white/10 bg-[#10161d]">
                      <Button variant="ghost" className="rounded-none border-r border-white/10 px-3 text-slate-100 hover:bg-white/10" onClick={() => setYearCursor(current => current - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                      <div className="min-w-[88px] px-4 text-center text-sm font-medium">{yearCursor}</div>
                      <Button variant="ghost" className="rounded-none border-l border-white/10 px-3 text-slate-100 hover:bg-white/10" onClick={() => setYearCursor(current => current + 1)}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={analyticsData?.series.months ?? yearOverviewQuery.data ?? []} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.2)" }}
                        formatter={(value: number, name: string) => [
                          name === "workoutCount" ? `${value} трен.` : formatKg(value),
                          name === "workoutCount" ? "Тренировок" : "Грузоподъёмность",
                        ]}
                      />
                      <Bar dataKey="totalVolume" fill="#60a5fa" radius={[0, 0, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
                <CardHeader className="border-b border-white/10 pb-3"><CardTitle className="text-base">Сдвиг к прошлому месяцу</CardTitle></CardHeader>
                <CardContent className="grid gap-3 pt-4">
                  {renderRecordCard("Тоннаж", formatDelta(analyticsData?.summary.volumeDelta ?? 0), `Сейчас ${formatKg(analyticsData?.summary.monthTotalVolume ?? 0)} • было ${formatKg(analyticsData?.summary.previousMonthVolume ?? 0)}`)}
                  {renderRecordCard("Тренировки", formatDelta(analyticsData?.summary.workoutDelta ?? 0), `Сейчас ${analyticsData?.summary.monthWorkoutCount ?? 0} • было ${analyticsData?.summary.previousWorkoutCount ?? 0}`)}
                  {renderRecordCard("Средняя тренировка", formatKg(analyticsData?.summary.averageWorkoutVolume ?? 0), `Максимум дня ${formatKg(analyticsData?.summary.maxDayVolume ?? 0)}`)}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
                <CardHeader className="border-b border-white/10 pb-3"><CardTitle className="text-base">Недельный ритм месяца</CardTitle></CardHeader>
                <CardContent className="pt-4">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analyticsData?.series.weeks ?? []} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.2)" }}
                        formatter={(value: number, name: string) => [
                          name === "workoutCount" ? `${value} трен.` : formatKg(value),
                          name === "workoutCount" ? "Тренировок" : "Грузоподъёмность",
                        ]}
                        labelFormatter={(label, payload) => {
                          const item = payload?.[0]?.payload;
                          return item ? `${label}: ${item.startDay}-${item.endDay} число` : String(label);
                        }}
                      />
                      <Bar dataKey="totalVolume" fill="#34d399" radius={[0, 0, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
                <CardHeader className="border-b border-white/10 pb-3"><CardTitle className="text-base">Тренировки месяца</CardTitle></CardHeader>
                <CardContent className="space-y-3 pt-4">
                  {monthSessions.length ? monthSessions.map(session => renderSessionCard(session)) : <div className="border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">В выбранном месяце пока нет сохранённых тренировок.</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="load" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
                <CardHeader className="border-b border-white/10 pb-3"><CardTitle className="text-base">Дневная нагрузка месяца</CardTitle></CardHeader>
                <CardContent className="pt-4">
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={analyticsData?.series.days ?? []} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                      <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.2)" }}
                        formatter={(value: number) => [formatKg(value), "Тоннаж"]}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.date ?? String(label)}
                      />
                      <Line type="monotone" dataKey="volume" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3, fill: "#f59e0b" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
                <CardHeader className="border-b border-white/10 pb-3"><CardTitle className="text-base">Нагрузка по группам</CardTitle></CardHeader>
                <CardContent className="pt-4">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={analyticsData?.muscleGroups ?? []} layout="vertical" margin={{ top: 8, right: 16, left: 16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.2)" }}
                        formatter={(value: number) => [formatKg(value), "Тоннаж"]}
                      />
                      <Bar dataKey="totalVolume" fill="#a78bfa" radius={[0, 0, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
              <CardHeader className="border-b border-white/10 pb-3"><CardTitle className="text-base">Упражнения месяца</CardTitle></CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-[minmax(0,1.3fr)_140px_110px_110px_120px] border-b border-white/10 bg-white/5 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <div>Упражнение</div>
                  <div className="text-right">Тоннаж</div>
                  <div className="text-right">Тренировок</div>
                  <div className="text-right">Подходов</div>
                  <div className="text-right">e1RM</div>
                </div>
                <div className="divide-y divide-white/10">
                  {(analyticsData?.exercises.month ?? []).map(item => (
                    <button
                      key={item.exerciseId}
                      type="button"
                      className="grid w-full grid-cols-[minmax(0,1.3fr)_140px_110px_110px_120px] px-4 py-3 text-sm transition hover:bg-white/5"
                      onClick={() => setSelectedExerciseId(String(item.exerciseId))}
                    >
                      <div className="min-w-0 text-left">
                        <div className="truncate text-slate-100">{item.exerciseName}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.muscleGroup || "Прочее"}</div>
                      </div>
                      <div className="text-right font-medium text-slate-100">{formatKg(item.totalVolume)}</div>
                      <div className="text-right text-slate-400">{item.workoutCount}</div>
                      <div className="text-right text-slate-400">{item.setCount}</div>
                      <div className="text-right text-slate-400">{item.estimatedOneRepMax ? formatKg(item.estimatedOneRepMax) : "—"}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exercises" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-slate-400">Упражнение</div>
              <Select value={activeExerciseValue} onValueChange={value => setSelectedExerciseId(value)}>
                <SelectTrigger className="w-[280px] rounded-none border-white/10 bg-[#10161d] text-slate-100">
                  <SelectValue placeholder="Выберите упражнение" />
                </SelectTrigger>
                <SelectContent>
                  {(analyticsData?.exercises.month ?? []).map(item => (
                    <SelectItem key={item.exerciseId} value={String(item.exerciseId)}>
                      {item.exerciseName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {analyticsData?.exercises.selected ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Тоннаж упражнения</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{formatKg(analyticsData.exercises.selected.totalVolume)}</div><div className="mt-2 text-sm text-slate-500">{analyticsData.exercises.selected.exerciseName}</div></CardContent></Card>
                  <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Лучший вес</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{analyticsData.exercises.selected.bestWeight ? formatKg(analyticsData.exercises.selected.bestWeight) : "—"}</div><div className="mt-2 text-sm text-slate-500">Максимальный рабочий вес</div></CardContent></Card>
                  <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">e1RM</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{analyticsData.exercises.selected.estimatedOneRepMax ? formatKg(analyticsData.exercises.selected.estimatedOneRepMax) : "—"}</div><div className="mt-2 text-sm text-slate-500">Оценка одноповторного максимума</div></CardContent></Card>
                  <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100"><CardHeader className="pb-2"><CardTitle className="text-sm text-slate-400">Средний вес</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{analyticsData.exercises.selected.averageWeightKg ? formatKg(analyticsData.exercises.selected.averageWeightKg) : "—"}</div><div className="mt-2 text-sm text-slate-500">Средний рабочий вес в месяце</div></CardContent></Card>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
                    <CardHeader className="border-b border-white/10 pb-3"><CardTitle className="text-base">Недельный объём упражнения</CardTitle></CardHeader>
                    <CardContent className="pt-4">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analyticsData.exercises.selected.weeklyVolumes} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.2)" }} formatter={(value: number) => [formatKg(value), "Тоннаж"]} />
                          <Bar dataKey="totalVolume" fill="#38bdf8" radius={[0, 0, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
                    <CardHeader className="border-b border-white/10 pb-3"><CardTitle className="text-base">Прогресс по месяцам</CardTitle></CardHeader>
                    <CardContent className="pt-4">
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={analyticsData.exercises.selected.monthlyProgress} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                          <Tooltip
                            contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.2)" }}
                            formatter={(value: number, name: string) => [
                              name === "estimatedOneRepMax" ? formatKg(value) : formatKg(value),
                              name === "estimatedOneRepMax" ? "e1RM" : "Тоннаж",
                            ]}
                          />
                          <Line type="monotone" dataKey="totalVolume" stroke="#22c55e" strokeWidth={3} dot={{ r: 3, fill: "#22c55e" }} />
                          <Line type="monotone" dataKey="estimatedOneRepMax" stroke="#f97316" strokeWidth={2} dot={{ r: 2, fill: "#f97316" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
                <CardContent className="px-4 py-8 text-sm text-slate-500">Для анализа упражнения выберите его из списка выше.</CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="records" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {renderRecordCard("Лучший день", analyticsData?.records.bestDay ? formatKg(analyticsData.records.bestDay.totalVolume) : "—", analyticsData?.records.bestDay ? `${analyticsData.records.bestDay.date} • ${analyticsData.records.bestDay.title}` : undefined)}
              {renderRecordCard("Лучшая неделя", analyticsData?.records.bestWeek ? formatKg(analyticsData.records.bestWeek.totalVolume) : "—", analyticsData?.records.bestWeek ? `${analyticsData.records.bestWeek.label} • ${analyticsData.records.bestWeek.workoutCount} трен.` : undefined)}
              {renderRecordCard("Лучший месяц", analyticsData?.records.bestMonth ? formatKg(analyticsData.records.bestMonth.totalVolume) : "—", analyticsData?.records.bestMonth ? `${analyticsData.records.bestMonth.monthLabel} • ${analyticsData.records.bestMonth.workoutCount} трен.` : undefined)}
              {renderRecordCard("Самый тяжёлый подход", analyticsData?.records.heaviestSet ? formatKg(analyticsData.records.heaviestSet.weightKg) : "—", analyticsData?.records.heaviestSet ? `${analyticsData.records.heaviestSet.exerciseName} • ${analyticsData.records.heaviestSet.reps} повт.` : undefined)}
              {renderRecordCard("Лучший e1RM", analyticsData?.records.bestEstimatedMax ? formatKg(analyticsData.records.bestEstimatedMax.estimatedOneRepMax) : "—", analyticsData?.records.bestEstimatedMax ? `${analyticsData.records.bestEstimatedMax.exerciseName} • ${analyticsData.records.bestEstimatedMax.weightKg} × ${analyticsData.records.bestEstimatedMax.reps}` : undefined)}
              {renderRecordCard("Самый многоповторный сет", analyticsData?.records.highestRepSet ? `${analyticsData.records.highestRepSet.reps} повт.` : "—", analyticsData?.records.highestRepSet ? `${analyticsData.records.highestRepSet.exerciseName} • ${formatKg(analyticsData.records.highestRepSet.weightKg)}` : undefined)}
            </div>

            <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
              <CardHeader className="border-b border-white/10 pb-3"><CardTitle className="text-base">Недельная динамика за год</CardTitle></CardHeader>
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={analyticsData?.series.yearlyWeeks ?? []} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={0} angle={-25} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.2)" }}
                      formatter={(value: number, name: string) => [
                        name === "workoutCount" ? `${value} трен.` : formatKg(value),
                        name === "workoutCount" ? "Тренировок" : "Тоннаж",
                      ]}
                    />
                    <Line type="monotone" dataKey="totalVolume" stroke="#e879f9" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={createOpen} onOpenChange={open => { setCreateOpen(open); if (!open) resetFormAndCloseDialog(); }}>
        <DialogContent className="max-w-5xl border-white/10 bg-[#0b0f14] text-slate-100">
          <DialogHeader><DialogTitle>{editingSession ? "Редактировать тренировку" : "Добавить тренировку"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-4">
            <Input type="date" className="rounded-none border-white/10 bg-white/5" value={trainingForm.date} onChange={event => setTrainingForm(current => ({ ...current, date: event.target.value }))} />
            <Input placeholder="Название тренировки" className="rounded-none border-white/10 bg-white/5 md:col-span-2" value={trainingForm.title} onChange={event => setTrainingForm(current => ({ ...current, title: event.target.value }))} />
            <Input placeholder="Время начала" className="rounded-none border-white/10 bg-white/5" value={trainingForm.startTimeText} onChange={event => setTrainingForm(current => ({ ...current, startTimeText: event.target.value }))} />
          </div>
          <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
            <Input type="number" placeholder="Длительность, мин" className="rounded-none border-white/10 bg-white/5" value={trainingForm.durationMinutes} onChange={event => setTrainingForm(current => ({ ...current, durationMinutes: event.target.value }))} />
            <Textarea placeholder="Заметка к тренировке" className="min-h-[44px] rounded-none border-white/10 bg-white/5" value={trainingForm.notes} onChange={event => setTrainingForm(current => ({ ...current, notes: event.target.value }))} />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div><div className="text-sm font-medium text-slate-100">Упражнения</div><div className="text-xs text-slate-500">Для каждого упражнения введите название, вес и количество повторов.</div></div>
              <Button type="button" variant="outline" className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" onClick={addExerciseRow}><Plus className="mr-2 h-4 w-4" />Добавить упражнение</Button>
            </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[minmax(0,1fr)_130px_130px_48px] gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500"><div>Название упражнения</div><div>Вес, кг</div><div>Повторы</div><div /></div>
              {trainingForm.exercises.map(row => (
                <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_130px_130px_48px] gap-2">
                  <Input list="training-exercise-options" data-exercise-id={row.id} data-exercise-field="name" placeholder="Например: Жим лёжа" className="rounded-none border-white/10 bg-white/5" value={row.name} onChange={event => updateExerciseRow(row.id, "name", event.target.value)} onKeyDown={event => handleExerciseFieldKeyDown(row.id, "name", event)} />
                  <Input data-exercise-id={row.id} data-exercise-field="weightKg" placeholder="60" className="rounded-none border-white/10 bg-white/5" value={row.weightKg} onChange={event => updateExerciseRow(row.id, "weightKg", event.target.value)} onKeyDown={event => handleExerciseFieldKeyDown(row.id, "weightKg", event)} />
                  <Input data-exercise-id={row.id} data-exercise-field="reps" placeholder="10" className="rounded-none border-white/10 bg-white/5" value={row.reps} onChange={event => updateExerciseRow(row.id, "reps", event.target.value)} onKeyDown={event => handleExerciseFieldKeyDown(row.id, "reps", event)} />
                  <Button type="button" variant="ghost" className="rounded-none border border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-100" onClick={() => removeExerciseRow(row.id)} disabled={trainingForm.exercises.length === 1}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
                <datalist id="training-exercise-options">
                  {knownExerciseNames.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editingSession ? <Button variant="outline" className="rounded-none border-rose-500/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20" onClick={() => handleDeleteSession(editingSession.id)} disabled={deleteSession.isPending}>Удалить тренировку</Button> : null}
            <Button variant="outline" className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" onClick={resetFormAndCloseDialog}>Отмена</Button>
            <Button className="rounded-none" onClick={handleSubmitTraining} disabled={createSession.isPending || updateSession.isPending}>Сохранить тренировку</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={open => { setImportOpen(open); if (!open) setShowImportSource(false); }}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden border-white/10 bg-[#0b0f14] p-0 text-slate-100">
          <div className="flex max-h-[90vh] flex-col">
            <DialogHeader><div className="border-b border-white/10 px-6 py-4"><DialogTitle>Импорт тренировок из HTML</DialogTitle></div></DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                <Input type="number" min={2020} max={2100} value={String(importYear)} className="rounded-none border-white/10 bg-white/5" onChange={event => setImportYear(Number(event.target.value) || new Date().getFullYear())} />
                <Input type="file" accept=".html,.htm,text/html" className="rounded-none border-white/10 bg-white/5 file:mr-3 file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-slate-100" onChange={handleImportFileChange} />
              </div>
              <div className="mt-3 border border-white/10 bg-white/5 px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Источник</div><div className="mt-1 text-slate-100">{importFileName || (importSource.trim() ? "HTML вставлен вручную" : "Файл ещё не выбран")}</div></div>
                  <button type="button" className="text-xs uppercase tracking-[0.18em] text-slate-400 hover:text-slate-100" onClick={() => setShowImportSource(current => !current)}>{showImportSource ? "Скрыть HTML" : "Показать HTML"}</button>
                </div>
              </div>
              {showImportSource ? <Textarea value={importSource} onChange={event => setImportSource(event.target.value)} placeholder="Можно выбрать файл .html выше или вставить HTML сюда вручную" className="mt-3 min-h-[220px] rounded-none border-white/10 bg-white/5 font-mono text-xs" /> : null}
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="border border-white/10 bg-white/5 px-3 py-2"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Найдено записей</div><div className="mt-1 text-xl font-semibold text-slate-100">{importEntries.length}</div></div>
                <div className="border border-white/10 bg-white/5 px-3 py-2"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Упражнений</div><div className="mt-1 text-xl font-semibold text-slate-100">{importExerciseNames.length}</div></div>
                <div className="border border-white/10 bg-white/5 px-3 py-2"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Дат</div><div className="mt-1 text-xl font-semibold text-slate-100">{importDates.length}</div></div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
                <div className="border border-white/10 bg-white/5"><div className="border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">Найденные упражнения</div><div className="max-h-64 overflow-auto px-3 py-2 text-sm">{importExerciseNames.length ? <div className="space-y-1">{importExerciseNames.map(name => <div key={name} className="text-slate-200">{name}</div>)}</div> : <div className="text-slate-500">Пока ничего не распознано</div>}</div></div>
                <div className="border border-white/10 bg-white/5"><div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Подтверждение импорта</div><div className="flex gap-3 text-[10px] uppercase tracking-[0.18em]"><button type="button" className="text-slate-400 hover:text-slate-100" onClick={() => setSelectedImportKeys(importDates)}>Все</button><button type="button" className="text-slate-400 hover:text-slate-100" onClick={() => setSelectedImportKeys([])}>Снять</button></div></div><div className="max-h-64 overflow-auto px-3 py-2 text-sm">{importWorkouts.length ? <div className="space-y-2">{importWorkouts.map(workout => <label key={workout.key} className="flex cursor-pointer items-start gap-3 border border-white/10 px-3 py-2"><input type="checkbox" className="mt-1" checked={selectedImportKeys.includes(workout.date)} onChange={event => setSelectedImportKeys(current => event.target.checked ? [...current, workout.date] : current.filter(key => key !== workout.date))} /><div className="min-w-0"><div className="font-medium text-slate-100">{workout.date}</div><div className="mt-1 text-xs text-slate-500">{workout.exerciseCount} упражн.</div><div className="mt-2 space-y-2">{workout.entries.map(entry => <div key={entry.key} className="border border-white/10 bg-black/20 px-3 py-2"><div className="font-medium text-slate-200">{entry.exerciseName}</div><div className="mt-1 whitespace-pre-wrap text-xs text-slate-400">{entry.rawInput}</div></div>)}</div></div></label>)}</div> : <div className="text-slate-500">Загрузите HTML-файл или вставьте HTML выше</div>}</div></div>
              </div>
            </div>
            <DialogFooter className="border-t border-white/10 px-6 py-4">
              <Button variant="outline" className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" onClick={() => { setImportSource(""); setImportFileName(""); setSelectedImportKeys([]); }}>Очистить</Button>
              <Button className="rounded-none" onClick={handleImport} disabled={upsertCell.isPending || createExercise.isPending || selectedImportEntries.length === 0}>Импортировать выбранное</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
