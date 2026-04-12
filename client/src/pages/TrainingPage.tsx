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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { addMonths, format } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, FileUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
  const [trainingForm, setTrainingForm] = useState(createEmptyTrainingForm);

  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth() + 1;

  const matrixQuery = trpc.training.matrixByMonth.useQuery({ year, month });
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
  const selectedImportEntries = useMemo(
    () => importEntries.filter(item => selectedImportKeys.includes(item.key)),
    [importEntries, selectedImportKeys]
  );

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
        ? session.exercises.map(item => {
            const firstSet = item.sets[0];
            const weight =
              firstSet?.weightKg ??
              firstSet?.effectiveWeightKg ??
              firstSet?.additionalWeightKg ??
              0;
            const reps = firstSet?.reps ?? 0;

            return {
              id: Math.random().toString(36).slice(2, 10),
              name: item.exercise?.name ?? `Упражнение #${item.exerciseId}`,
              weightKg: weight ? String(weight) : "",
              reps: reps ? String(reps) : "",
            };
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
    const sessionExercises = [];

    for (const row of normalizedRows) {
      const key = row.name.toLowerCase();
      let exercise = existingExercises.get(key);

      if (!exercise) {
        exercise = await createExercise.mutateAsync({ name: row.name, volumeMode: "weight_reps" });
        existingExercises.set(key, exercise);
      }

      const weight = Number(row.weightKg.replace(",", "."));
      const reps = Number(row.reps.replace(",", "."));

      if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(reps) || reps <= 0) {
        toast.error(`Проверьте вес и повторы у упражнения "${row.name}"`);
        return;
      }

      sessionExercises.push({
        exerciseId: exercise.id,
        sets: [{ setType: "work" as const, weightKg: Math.round(weight), reps: Math.round(reps), rawInput: `${Math.round(weight)}кг ${Math.round(reps)}` }],
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

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
            <CardHeader className="border-b border-white/10 pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Аналитика года</CardTitle>
                <div className="flex items-center border border-white/10 bg-[#10161d]">
                  <Button variant="ghost" className="rounded-none border-r border-white/10 px-3 text-slate-100 hover:bg-white/10" onClick={() => setYearCursor(current => current - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                  <div className="min-w-[88px] px-4 text-center text-sm font-medium">{yearCursor}</div>
                  <Button variant="ghost" className="rounded-none border-l border-white/10 px-3 text-slate-100 hover:bg-white/10" onClick={() => setYearCursor(current => current + 1)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[minmax(0,1fr)_170px_150px] border-b border-white/10 bg-white/5 px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                <div>Месяц</div>
                <div className="text-right">Грузоподъёмность</div>
                <div className="text-right">Тренировок</div>
              </div>
              <div className="divide-y divide-white/10">
                {(yearOverviewQuery.data ?? []).map(item => (
                  <div key={item.month} className="grid grid-cols-[minmax(0,1fr)_170px_150px] px-4 py-3 text-sm">
                    <button type="button" className="text-left capitalize text-slate-200 transition hover:text-white" onClick={() => setCursorDate(new Date(yearCursor, item.month - 1, 1))}>{item.monthLabel}</button>
                    <div className="text-right font-medium text-slate-100">{formatKg(item.totalVolume)}</div>
                    <div className="text-right text-slate-400">{item.workoutCount}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
              <CardHeader className="border-b border-white/10 pb-3"><CardTitle className="text-base">Тренировки месяца</CardTitle></CardHeader>
              <CardContent className="space-y-3 pt-4">
                {monthSessions.length ? monthSessions.map(session => renderSessionCard(session)) : <div className="border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">В выбранном месяце пока нет сохранённых тренировок.</div>}
              </CardContent>
            </Card>

            <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
              <CardHeader className="border-b border-white/10 pb-3"><CardTitle className="text-base">Топ упражнений месяца</CardTitle></CardHeader>
              <CardContent className="space-y-3 pt-4">
                {monthSummary.topExercises.length ? monthSummary.topExercises.map((exercise, index) => (
                  <div key={exercise.id} className="flex items-center justify-between border border-white/10 bg-white/5 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{index + 1} место</div>
                      <div className="truncate font-medium text-slate-100">{exercise.name}</div>
                    </div>
                    <div className="text-right font-semibold text-slate-100">{formatKg(exercise.totalVolume)}</div>
                  </div>
                )) : <div className="border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">В выбранном месяце пока нет тренировок.</div>}
              </CardContent>
            </Card>

            <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
              <CardHeader className="border-b border-white/10 pb-3"><CardTitle className="text-base">История выбранного месяца</CardTitle></CardHeader>
              <CardContent className="space-y-3 pt-4">
                {monthSessions.length ? monthSessions.map(session => renderSessionCard(session)) : <div className="border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">В этом месяце пока нет сохранённых тренировок.</div>}
              </CardContent>
            </Card>
          </div>
        </div>
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
                  <Input placeholder="Например: Жим лёжа" className="rounded-none border-white/10 bg-white/5" value={row.name} onChange={event => updateExerciseRow(row.id, "name", event.target.value)} />
                  <Input placeholder="60" className="rounded-none border-white/10 bg-white/5" value={row.weightKg} onChange={event => updateExerciseRow(row.id, "weightKg", event.target.value)} />
                  <Input placeholder="10" className="rounded-none border-white/10 bg-white/5" value={row.reps} onChange={event => updateExerciseRow(row.id, "reps", event.target.value)} />
                  <Button type="button" variant="ghost" className="rounded-none border border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-100" onClick={() => removeExerciseRow(row.id)} disabled={trainingForm.exercises.length === 1}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
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
                <div className="border border-white/10 bg-white/5"><div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Подтверждение импорта</div><div className="flex gap-3 text-[10px] uppercase tracking-[0.18em]"><button type="button" className="text-slate-400 hover:text-slate-100" onClick={() => setSelectedImportKeys(importEntries.map(item => item.key))}>Все</button><button type="button" className="text-slate-400 hover:text-slate-100" onClick={() => setSelectedImportKeys([])}>Снять</button></div></div><div className="max-h-64 overflow-auto px-3 py-2 text-sm">{importEntries.length ? <div className="space-y-2">{importEntries.map(entry => <label key={entry.key} className="flex cursor-pointer items-start gap-3 border border-white/10 px-3 py-2"><input type="checkbox" className="mt-1" checked={selectedImportKeys.includes(entry.key)} onChange={event => setSelectedImportKeys(current => event.target.checked ? [...current, entry.key] : current.filter(key => key !== entry.key))} /><div className="min-w-0"><div className="font-medium text-slate-100">{entry.date} • {entry.exerciseName}</div><div className="mt-1 whitespace-pre-wrap text-xs text-slate-400">{entry.rawInput}</div></div></label>)}</div> : <div className="text-slate-500">Загрузите HTML-файл или вставьте HTML выше</div>}</div></div>
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
