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
  "СЏРЅРІР°СЂСЊ": 1,
  "СЏРЅРІ": 1,
  "С„РµРІСЂР°Р»СЊ": 2,
  "С„РµРІ": 2,
  "РјР°СЂС‚": 3,
  "РјР°СЂ": 3,
  "Р°РїСЂРµР»СЊ": 4,
  "Р°РїСЂ": 4,
  "РјР°Р№": 5,
  "РјР°СЏ": 5,
  "РёСЋРЅСЊ": 6,
  "РёСЋРЅ": 6,
  "РёСЋР»СЊ": 7,
  "РёСЋР»": 7,
  "Р°РІРіСѓСЃС‚": 8,
  "Р°РІРі": 8,
  "СЃРµРЅС‚СЏР±СЂСЊ": 9,
  "СЃРµРЅС‚": 9,
  "СЃРµРЅ": 9,
  "РѕРєС‚СЏР±СЂСЊ": 10,
  "РѕРєС‚": 10,
  "РЅРѕСЏР±СЂСЊ": 11,
  "РЅРѕСЏ": 11,
  "РґРµРєР°Р±СЂСЊ": 12,
  "РґРµРє": 12,
};

function createExerciseDraft(): ExerciseDraft {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    weightKg: "",
    reps: "",
  };
}

function resetTrainingForm() {
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
  return value.toLocaleString("ru-RU");
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
  if (!joined || /^РёС‚РѕРіРѕ[:\s]/i.test(joined)) return null;

  let exerciseName = lines[0].replace(/[:пјљ]\s*$/, "").trim();
  const restLines = [...lines.slice(1)];
  const sameLineMatch = exerciseName.match(/^(.+?)(\d+(?:[.,]\d+)?\s*(?:РєРі|kg)|\d+\.)/i);

  if (sameLineMatch) {
    exerciseName = sameLineMatch[1].trim().replace(/[:пјљ]\s*$/, "");
    restLines.unshift(lines[0].slice(sameLineMatch[1].length).trim());
  }

  const cleanedRest = restLines
    .map(line => normalizeText(line))
    .filter(Boolean)
    .filter(line => !/^РёС‚РѕРіРѕ[:\s]/i.test(line))
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
  const [trainingForm, setTrainingForm] = useState(resetTrainingForm);

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
      setTrainingForm(resetTrainingForm());
      toast.success("РўСЂРµРЅРёСЂРѕРІРєР° РґРѕР±Р°РІР»РµРЅР°");
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
      setTrainingForm(resetTrainingForm());
      toast.success("РўСЂРµРЅРёСЂРѕРІРєР° РѕР±РЅРѕРІР»РµРЅР°");
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
      setTrainingForm(resetTrainingForm());
      toast.success("РўСЂРµРЅРёСЂРѕРІРєР° СѓРґР°Р»РµРЅР°");
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

  const monthHeading = useMemo(
    () => format(cursorDate, "LLLL yyyy", { locale: ru }),
    [cursorDate]
  );

  const monthDays = matrixQuery.data?.days ?? [];
  const monthExercises = matrixQuery.data?.exercises ?? [];

  const importEntries = useMemo(
    () => parseImportEntries(importSource, importYear),
    [importSource, importYear]
  );

  const importExerciseNames = useMemo(
    () => Array.from(new Set(importEntries.map(item => item.exerciseName))).sort((a, b) => a.localeCompare(b, "ru")),
    [importEntries]
  );

  const importDates = useMemo(
    () => Array.from(new Set(importEntries.map(item => item.date))).sort(),
    [importEntries]
  );

  const selectedImportEntries = useMemo(
    () => importEntries.filter(item => selectedImportKeys.includes(item.key)),
    [importEntries, selectedImportKeys]
  );

  const monthSummary = useMemo(() => {
    const totalVolume = monthDays.reduce((sum, day) => sum + (day.summary?.volume ?? 0), 0);
    const workoutCount = monthDays.filter(day => Boolean(day.summary)).length;
    const maxDayVolume = Math.max(0, ...monthDays.map(day => day.summary?.volume ?? 0));
    const averageVolume = workoutCount > 0 ? Math.round(totalVolume / workoutCount) : 0;

    const exerciseTotals = monthExercises
      .map(exercise => ({
        id: exercise.id,
        name: exercise.name,
        totalVolume: monthDays.reduce(
          (sum, day) => sum + (exercise.cells[day.date]?.volume ?? 0),
          0
        ),
      }))
      .filter(exercise => exercise.totalVolume > 0)
      .sort((a, b) => b.totalVolume - a.totalVolume);

    return {
      totalVolume,
      workoutCount,
      maxDayVolume,
      averageVolume,
      topExercises: exerciseTotals.slice(0, 5),
    };
  }, [monthDays, monthExercises]);

  const monthSessions = useMemo(
    () =>
      [...(monthSessionsQuery.data ?? [])].sort(
        (left, right) =>
          new Date(right.performedAt).getTime() - new Date(left.performedAt).getTime()
      ),
    [monthSessionsQuery.data]
  );

  async function handleSubmitTraining() {
    const normalizedRows = trainingForm.exercises
      .map(row => ({
        ...row,
        name: row.name.trim(),
        weightKg: row.weightKg.trim(),
        reps: row.reps.trim(),
      }))
      .filter(row => row.name || row.weightKg || row.reps);

    if (!trainingForm.title.trim()) {
      toast.error("РќСѓР¶РЅРѕ СѓРєР°Р·Р°С‚СЊ РЅР°Р·РІР°РЅРёРµ С‚СЂРµРЅРёСЂРѕРІРєРё");
      return;
    }

    if (normalizedRows.length === 0) {
      toast.error("Р”РѕР±Р°РІСЊС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРЅРѕ СѓРїСЂР°Р¶РЅРµРЅРёРµ");
      return;
    }

    if (normalizedRows.some(row => !row.name || !row.weightKg || !row.reps)) {
      toast.error("Р”Р»СЏ РєР°Р¶РґРѕРіРѕ СѓРїСЂР°Р¶РЅРµРЅРёСЏ Р·Р°РїРѕР»РЅРёС‚Рµ РЅР°Р·РІР°РЅРёРµ, РІРµСЃ Рё РїРѕРІС‚РѕСЂС‹");
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
        exercise = await createExercise.mutateAsync({
          name: row.name,
          volumeMode: "weight_reps",
        });
        existingExercises.set(key, exercise);
      }

      const weight = Number(row.weightKg.replace(",", "."));
      const reps = Number(row.reps.replace(",", "."));

      if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(reps) || reps <= 0) {
        toast.error(`РџСЂРѕРІРµСЂСЊС‚Рµ РІРµСЃ Рё РїРѕРІС‚РѕСЂС‹ Сѓ СѓРїСЂР°Р¶РЅРµРЅРёСЏ "${row.name}"`);
        return;
      }

      sessionExercises.push({
        exerciseId: exercise.id,
        sets: [
          {
            setType: "work" as const,
            weightKg: Math.round(weight),
            reps: Math.round(reps),
            rawInput: `${Math.round(weight)}РєРі ${Math.round(reps)}`,
          },
        ],
      });
    }

    const payload = {
      title: trainingForm.title.trim(),
      performedAt: new Date(`${trainingForm.date}T12:00:00`).toISOString(),
      startTimeText: trainingForm.startTimeText.trim() || undefined,
      durationMinutes: trainingForm.durationMinutes.trim()
        ? Number(trainingForm.durationMinutes)
        : null,
      notes: trainingForm.notes.trim() || undefined,
      exercises: sessionExercises,
    };

    if (editingSession) {
      await updateSession.mutateAsync({
        sessionId: editingSession.id,
        ...payload,
      });
      return;
    }

    await createSession.mutateAsync(payload);
  }

  async function handleImport() {
    if (selectedImportEntries.length === 0) {
      toast.error("РќРµС‡РµРіРѕ РёРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ: РІС‹Р±РµСЂРёС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРЅСѓ Р·Р°РїРёСЃСЊ");
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
        exercise = await createExercise.mutateAsync({
          name: entry.exerciseName,
          volumeMode: "weight_reps",
        });
        existingExercises.set(key, exercise);
      }

      await upsertCell.mutateAsync({
        date: entry.date,
        exerciseId: exercise.id,
        rawInput: entry.rawInput,
        sessionTitle: `РРјРїРѕСЂС‚ ${entry.date}`,
      });

      importedCount += 1;
    }

    setImportOpen(false);
    setImportSource("");
    setSelectedImportKeys([]);
    toast.success(`РРјРїРѕСЂС‚РёСЂРѕРІР°РЅРѕ Р·Р°РїРёСЃРµР№: ${importedCount}`);
  }

  async function handleImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setImportSource(text);
    setImportFileName(file.name);
    setShowImportSource(false);
    event.target.value = "";
  }

  function updateExerciseRow(id: string, field: keyof Omit<ExerciseDraft, "id">, value: string) {
    setTrainingForm(current => ({
      ...current,
      exercises: current.exercises.map(row =>
        row.id === id ? { ...row, [field]: value } : row
      ),
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

  function openCreateDialog() {
    setEditingSession(null);
    setTrainingForm(resetTrainingForm());
    setCreateOpen(true);
  }

  function openEditDialog(session: NonNullable<(typeof monthSessionsQuery.data)>[number]) {
    setEditingSession({
      id: session.id,
      title: session.title,
      date: format(new Date(session.performedAt), "yyyy-MM-dd"),
      startTimeText: session.startTimeText ?? "",
      durationMinutes: session.durationMinutes ? String(session.durationMinutes) : "",
      notes: session.notes ?? "",
      exercises:
        session.exercises.length > 0
          ? session.exercises.map(item => {
              const firstSet = item.sets[0];
              const weight = firstSet?.weightKg ?? firstSet?.effectiveWeightKg ?? firstSet?.additionalWeightKg ?? 0;
              const reps = firstSet?.reps ?? 0;

              return {
                id: Math.random().toString(36).slice(2, 10),
                name: item.exercise?.name ?? `РЈРїСЂР°Р¶РЅРµРЅРёРµ #${item.exerciseId}`,
                weightKg: weight ? String(weight) : "",
                reps: reps ? String(reps) : "",
              };
            })
          : [createExerciseDraft()],
    });
    setTrainingForm({
      date: format(new Date(session.performedAt), "yyyy-MM-dd"),
      title: session.title,
      startTimeText: session.startTimeText ?? "",
      durationMinutes: session.durationMinutes ? String(session.durationMinutes) : "",
      notes: session.notes ?? "",
      exercises:
        session.exercises.length > 0
          ? session.exercises.map(item => {
              const firstSet = item.sets[0];
              const weight = firstSet?.weightKg ?? firstSet?.effectiveWeightKg ?? firstSet?.additionalWeightKg ?? 0;
              const reps = firstSet?.reps ?? 0;

              return {
                id: Math.random().toString(36).slice(2, 10),
                name: item.exercise?.name ?? `РЈРїСЂР°Р¶РЅРµРЅРёРµ #${item.exerciseId}`,
                weightKg: weight ? String(weight) : "",
                reps: reps ? String(reps) : "",
              };
            })
          : [createExerciseDraft()],
    });
    setCreateOpen(true);
  }

  async function handleDeleteSession(sessionId: number) {
    await deleteSession.mutateAsync({ sessionId });
  }

  return (
    <div className="h-full overflow-auto bg-[#07090d] text-slate-100">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border border-white/10 bg-[#0b0f14] px-5 py-4">
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Training Dashboard</div>
            <h1 className="text-2xl font-semibold tracking-tight">РўСЂРµРЅРёСЂРѕРІРєРё</h1>
            <p className="max-w-3xl text-sm text-slate-400">
              РњРµСЃСЏС‡РЅР°СЏ РіСЂСѓР·РѕРїРѕРґСЉРµРјРЅРѕСЃС‚СЊ, Р°РЅР°Р»РёС‚РёРєР° РїРѕ РіРѕРґСѓ Рё Р±С‹СЃС‚СЂС‹Р№ СЂСѓС‡РЅРѕР№ РІРІРѕРґ С‚СЂРµРЅРёСЂРѕРІРѕРє.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center border border-white/10 bg-[#10161d]">
              <Button
                variant="ghost"
                className="rounded-none border-r border-white/10 px-3 text-slate-100 hover:bg-white/10"
                onClick={() => setCursorDate(current => addMonths(current, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[190px] px-4 text-center text-sm font-medium capitalize">
                {monthHeading}
              </div>
              <Button
                variant="ghost"
                className="rounded-none border-l border-white/10 px-3 text-slate-100 hover:bg-white/10"
                onClick={() => setCursorDate(current => addMonths(current, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="outline"
              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => setCursorDate(new Date())}
            >
              РўРµРєСѓС‰РёР№ РјРµСЃСЏС†
            </Button>

            <Button
              variant="outline"
              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => setImportOpen(true)}
            >
              <FileUp className="mr-2 h-4 w-4" />
              РРјРїРѕСЂС‚ HTML
            </Button>

            <Button className="rounded-none" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Р”РѕР±Р°РІРёС‚СЊ С‚СЂРµРЅРёСЂРѕРІРєСѓ
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">Р“СЂСѓР·РѕРїРѕРґСЉРµРјРЅРѕСЃС‚СЊ РјРµСЃСЏС†Р°</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{formatKg(monthSummary.totalVolume)} РєРі</div>
              <div className="mt-2 text-sm text-slate-500">РЎСѓРјРјР° РїРѕ РІСЃРµРј СѓРїСЂР°Р¶РЅРµРЅРёСЏРј Р·Р° РІС‹Р±СЂР°РЅРЅС‹Р№ РјРµСЃСЏС†</div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">РљРѕР»РёС‡РµСЃС‚РІРѕ С‚СЂРµРЅРёСЂРѕРІРѕРє</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{monthSummary.workoutCount}</div>
              <div className="mt-2 text-sm text-slate-500">РўСЂРµРЅРёСЂРѕРІРѕС‡РЅС‹С… РґРЅРµР№ РІ РјРµСЃСЏС†Рµ</div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">РЎСЂРµРґРЅСЏСЏ С‚СЂРµРЅРёСЂРѕРІРєР°</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{formatKg(monthSummary.averageVolume)} РєРі</div>
              <div className="mt-2 text-sm text-slate-500">РЎСЂРµРґРЅСЏСЏ РіСЂСѓР·РѕРїРѕРґСЉРµРјРЅРѕСЃС‚СЊ РЅР° С‚СЂРµРЅРёСЂРѕРІРѕС‡РЅС‹Р№ РґРµРЅСЊ</div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">РџРёРєРѕРІС‹Р№ РґРµРЅСЊ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{formatKg(monthSummary.maxDayVolume)} РєРі</div>
              <div className="mt-2 text-sm text-slate-500">РњР°РєСЃРёРјР°Р»СЊРЅР°СЏ РіСЂСѓР·РѕРїРѕРґСЉРµРјРЅРѕСЃС‚СЊ Р·Р° РґРµРЅСЊ</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
            <CardHeader className="border-b border-white/10 pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">РђРЅР°Р»РёС‚РёРєР° РіРѕРґР°</CardTitle>
                <div className="flex items-center border border-white/10 bg-[#10161d]">
                  <Button
                    variant="ghost"
                    className="rounded-none border-r border-white/10 px-3 text-slate-100 hover:bg-white/10"
                    onClick={() => setYearCursor(current => current - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-[88px] px-4 text-center text-sm font-medium">{yearCursor}</div>
                  <Button
                    variant="ghost"
                    className="rounded-none border-l border-white/10 px-3 text-slate-100 hover:bg-white/10"
                    onClick={() => setYearCursor(current => current + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[minmax(0,1fr)_170px_150px] border-b border-white/10 bg-white/5 px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                <div>РњРµСЃСЏС†</div>
                <div className="text-right">Р“СЂСѓР·РѕРїРѕРґСЉРµРјРЅРѕСЃС‚СЊ</div>
                <div className="text-right">РўСЂРµРЅРёСЂРѕРІРѕРє</div>
              </div>

              <div className="divide-y divide-white/10">
                {(yearOverviewQuery.data ?? []).map(item => (
                  <div
                    key={item.month}
                    className="grid grid-cols-[minmax(0,1fr)_170px_150px] px-4 py-3 text-sm"
                  >
                    <button
                      type="button"
                      className="text-left capitalize text-slate-200 transition hover:text-white"
                      onClick={() => setCursorDate(new Date(yearCursor, item.month - 1, 1))}
                    >
                      {item.monthLabel}
                    </button>
                    <div className="text-right font-medium text-slate-100">
                      {formatKg(item.totalVolume)} РєРі
                    </div>
                    <div className="text-right text-slate-400">{item.workoutCount}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
              <CardHeader className="border-b border-white/10 pb-3">
                <CardTitle className="text-base">РўСЂРµРЅРёСЂРѕРІРєРё РјРµСЃСЏС†Р°</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {monthSessions.length ? (
                  monthSessions.map(session => {
                    const sessionVolume = session.exercises.reduce(
                      (sum, exercise) => sum + (exercise.computedVolume ?? 0),
                      0
                    );

                    return (
                      <div key={session.id} className="border border-white/10 bg-white/5 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-100">{session.title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {format(new Date(session.performedAt), "d MMMM yyyy", { locale: ru })}
                              {session.durationMinutes ? ` вЂў ${session.durationMinutes} РјРёРЅ` : ""}
                            </div>
                            <div className="mt-2 text-xs text-slate-400">
                              {session.exercises.length} СѓРїСЂР°Р¶РЅ. вЂў {formatKg(sessionVolume)} РєРі
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button
                              variant="outline"
                              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                              onClick={() => openEditDialog(session)}
                            >
                              РћС‚РєСЂС‹С‚СЊ
                            </Button>
                            <Button
                              variant="outline"
                              className="rounded-none border-rose-500/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                              onClick={() => handleDeleteSession(session.id)}
                              disabled={deleteSession.isPending}
                            >
                              РЈРґР°Р»РёС‚СЊ
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
                    Р’ РІС‹Р±СЂР°РЅРЅРѕРј РјРµСЃСЏС†Рµ РїРѕРєР° РЅРµС‚ СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… С‚СЂРµРЅРёСЂРѕРІРѕРє.
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
              <CardHeader className="border-b border-white/10 pb-3">
                <CardTitle className="text-base">РўРѕРї СѓРїСЂР°Р¶РЅРµРЅРёР№ РјРµСЃСЏС†Р°</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {monthSummary.topExercises.length ? (
                  monthSummary.topExercises.map((exercise, index) => (
                    <div
                      key={exercise.id}
                      className="flex items-center justify-between border border-white/10 bg-white/5 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                          {index + 1} РјРµСЃС‚Рѕ
                        </div>
                        <div className="truncate font-medium text-slate-100">{exercise.name}</div>
                      </div>
                      <div className="text-right font-semibold text-slate-100">
                        {formatKg(exercise.totalVolume)} РєРі
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
                    Р’ РІС‹Р±СЂР°РЅРЅРѕРј РјРµСЃСЏС†Рµ РїРѕРєР° РЅРµС‚ С‚СЂРµРЅРёСЂРѕРІРѕРє.
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
              <CardHeader className="border-b border-white/10 pb-3">
                <CardTitle className="text-base">История выбранного месяца</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {monthSessions.length ? (
                  monthSessions.map(session => {
                    const sessionVolume = session.exercises.reduce(
                      (sum, exercise) => sum + (exercise.computedVolume ?? 0),
                      0
                    );

                    return (
                      <div key={session.id} className="border border-white/10 bg-white/5 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-100">{session.title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {format(new Date(session.performedAt), "d MMMM yyyy", { locale: ru })}
                              {session.durationMinutes ? ` • ${session.durationMinutes} мин` : ""}
                            </div>
                            <div className="mt-2 text-xs text-slate-400">
                              {session.exercises.length} упражн. • {formatKg(sessionVolume)} кг
                            </div>
                          </div>
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
                  })
                ) : (
                  <div className="border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
                    В этом месяце пока нет сохраненных тренировок.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={open => {
          setCreateOpen(open);
          if (!open) {
            setEditingSession(null);
            setTrainingForm(resetTrainingForm());
          }
        }}
      >
        <DialogContent className="max-w-5xl border-white/10 bg-[#0b0f14] text-slate-100">
          <DialogHeader>
            <DialogTitle>{editingSession ? "Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ С‚СЂРµРЅРёСЂРѕРІРєСѓ" : "Р”РѕР±Р°РІРёС‚СЊ С‚СЂРµРЅРёСЂРѕРІРєСѓ"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-4">
            <Input
              type="date"
              className="rounded-none border-white/10 bg-white/5"
              value={trainingForm.date}
              onChange={event => setTrainingForm(current => ({ ...current, date: event.target.value }))}
            />
            <Input
              placeholder="РќР°Р·РІР°РЅРёРµ С‚СЂРµРЅРёСЂРѕРІРєРё"
              className="rounded-none border-white/10 bg-white/5 md:col-span-2"
              value={trainingForm.title}
              onChange={event => setTrainingForm(current => ({ ...current, title: event.target.value }))}
            />
            <Input
              placeholder="Р’СЂРµРјСЏ РЅР°С‡Р°Р»Р°"
              className="rounded-none border-white/10 bg-white/5"
              value={trainingForm.startTimeText}
              onChange={event => setTrainingForm(current => ({ ...current, startTimeText: event.target.value }))}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
            <Input
              type="number"
              placeholder="Р”Р»РёС‚РµР»СЊРЅРѕСЃС‚СЊ, РјРёРЅ"
              className="rounded-none border-white/10 bg-white/5"
              value={trainingForm.durationMinutes}
              onChange={event => setTrainingForm(current => ({ ...current, durationMinutes: event.target.value }))}
            />
            <Textarea
              placeholder="Р—Р°РјРµС‚РєР° Рє С‚СЂРµРЅРёСЂРѕРІРєРµ"
              className="min-h-[44px] rounded-none border-white/10 bg-white/5"
              value={trainingForm.notes}
              onChange={event => setTrainingForm(current => ({ ...current, notes: event.target.value }))}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-100">РЈРїСЂР°Р¶РЅРµРЅРёСЏ</div>
                <div className="text-xs text-slate-500">
                  Р”Р»СЏ РєР°Р¶РґРѕРіРѕ СѓРїСЂР°Р¶РЅРµРЅРёСЏ РІРІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ, РІРµСЃ Рё РєРѕР»РёС‡РµСЃС‚РІРѕ РїРѕРІС‚РѕСЂРѕРІ.
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                onClick={addExerciseRow}
              >
                <Plus className="mr-2 h-4 w-4" />
                Р”РѕР±Р°РІРёС‚СЊ СѓРїСЂР°Р¶РЅРµРЅРёРµ
              </Button>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_130px_130px_48px] gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <div>РќР°Р·РІР°РЅРёРµ СѓРїСЂР°Р¶РЅРµРЅРёСЏ</div>
                <div>Р’РµСЃ, РєРі</div>
                <div>РџРѕРІС‚РѕСЂС‹</div>
                <div />
              </div>

              {trainingForm.exercises.map(row => (
                <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_130px_130px_48px] gap-2">
                  <Input
                    placeholder="РќР°РїСЂРёРјРµСЂ: Р–РёРј Р»РµР¶Р°"
                    className="rounded-none border-white/10 bg-white/5"
                    value={row.name}
                    onChange={event => updateExerciseRow(row.id, "name", event.target.value)}
                  />
                  <Input
                    placeholder="60"
                    className="rounded-none border-white/10 bg-white/5"
                    value={row.weightKg}
                    onChange={event => updateExerciseRow(row.id, "weightKg", event.target.value)}
                  />
                  <Input
                    placeholder="10"
                    className="rounded-none border-white/10 bg-white/5"
                    value={row.reps}
                    onChange={event => updateExerciseRow(row.id, "reps", event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-none border border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-100"
                    onClick={() => removeExerciseRow(row.id)}
                    disabled={trainingForm.exercises.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2">
            {editingSession ? (
              <Button
                variant="outline"
                className="rounded-none border-rose-500/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                onClick={() => handleDeleteSession(editingSession.id)}
                disabled={deleteSession.isPending}
              >
                РЈРґР°Р»РёС‚СЊ С‚СЂРµРЅРёСЂРѕРІРєСѓ
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => {
                setCreateOpen(false);
                setEditingSession(null);
                setTrainingForm(resetTrainingForm());
              }}
            >
              РћС‚РјРµРЅР°
            </Button>
            <Button className="rounded-none" onClick={handleSubmitTraining} disabled={createSession.isPending || updateSession.isPending}>
              РЎРѕС…СЂР°РЅРёС‚СЊ С‚СЂРµРЅРёСЂРѕРІРєСѓ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={importOpen}
        onOpenChange={open => {
          setImportOpen(open);
          if (!open) {
            setShowImportSource(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden border-white/10 bg-[#0b0f14] p-0 text-slate-100">
          <div className="flex max-h-[90vh] flex-col">
          <DialogHeader>
            <div className="border-b border-white/10 px-6 py-4">
              <DialogTitle>РРјРїРѕСЂС‚ С‚СЂРµРЅРёСЂРѕРІРѕРє РёР· HTML</DialogTitle>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <Input
              type="number"
              min={2020}
              max={2100}
              value={String(importYear)}
              className="rounded-none border-white/10 bg-white/5"
              onChange={event => setImportYear(Number(event.target.value) || new Date().getFullYear())}
            />
            <Input
              type="file"
              accept=".html,.htm,text/html"
              className="rounded-none border-white/10 bg-white/5 file:mr-3 file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-slate-100"
              onChange={handleImportFileChange}
            />
          </div>

          <div className="mt-3 border border-white/10 bg-white/5 px-3 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">РСЃС‚РѕС‡РЅРёРє</div>
                <div className="mt-1 text-slate-100">
                  {importFileName || (importSource.trim() ? "HTML РІСЃС‚Р°РІР»РµРЅ РІСЂСѓС‡РЅСѓСЋ" : "Р¤Р°Р№Р» РµС‰С‘ РЅРµ РІС‹Р±СЂР°РЅ")}
                </div>
              </div>
              <button
                type="button"
                className="text-xs uppercase tracking-[0.18em] text-slate-400 hover:text-slate-100"
                onClick={() => setShowImportSource(current => !current)}
              >
                {showImportSource ? "РЎРєСЂС‹С‚СЊ HTML" : "РџРѕРєР°Р·Р°С‚СЊ HTML"}
              </button>
            </div>
          </div>

          {showImportSource && (
            <Textarea
              value={importSource}
              onChange={event => setImportSource(event.target.value)}
              placeholder="РњРѕР¶РЅРѕ РІС‹Р±СЂР°С‚СЊ С„Р°Р№Р» .html РІС‹С€Рµ РёР»Рё РІСЃС‚Р°РІРёС‚СЊ HTML СЃСЋРґР° РІСЂСѓС‡РЅСѓСЋ"
              className="mt-3 min-h-[220px] rounded-none border-white/10 bg-white/5 font-mono text-xs"
            />
          )}

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">РќР°Р№РґРµРЅРѕ Р·Р°РїРёСЃРµР№</div>
              <div className="mt-1 text-xl font-semibold text-slate-100">{importEntries.length}</div>
            </div>
            <div className="border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">РЈРїСЂР°Р¶РЅРµРЅРёР№</div>
              <div className="mt-1 text-xl font-semibold text-slate-100">{importExerciseNames.length}</div>
            </div>
            <div className="border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Р”Р°С‚</div>
              <div className="mt-1 text-xl font-semibold text-slate-100">{importDates.length}</div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
            <div className="border border-white/10 bg-white/5">
              <div className="border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                РќР°Р№РґРµРЅРЅС‹Рµ СѓРїСЂР°Р¶РЅРµРЅРёСЏ
              </div>
              <div className="max-h-64 overflow-auto px-3 py-2 text-sm">
                {importExerciseNames.length ? (
                  <div className="space-y-1">
                    {importExerciseNames.map(name => (
                      <div key={name} className="truncate text-slate-200">{name}</div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-500">РџРѕРєР° РЅРёС‡РµРіРѕ РЅРµ СЂР°СЃРїРѕР·РЅР°РЅРѕ</div>
                )}
              </div>
            </div>

            <div className="border border-white/10 bg-white/5">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ РёРјРїРѕСЂС‚Р°
                </div>
                <div className="flex gap-3 text-[10px] uppercase tracking-[0.18em]">
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-100"
                    onClick={() => setSelectedImportKeys(importEntries.map(item => item.key))}
                  >
                    Р’СЃРµ
                  </button>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-100"
                    onClick={() => setSelectedImportKeys([])}
                  >
                    РЎРЅСЏС‚СЊ
                  </button>
                </div>
              </div>
              <div className="max-h-64 overflow-auto px-3 py-2 text-sm">
                {importEntries.length ? (
                  <div className="space-y-2">
                    {importEntries.slice(0, 80).map(item => (
                      <label key={item.key} className="flex cursor-pointer gap-2 border border-white/10 px-2 py-2">
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
                          <div className="mt-1 whitespace-pre-line text-xs text-slate-400">
                            {item.rawInput}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-500">Р—Р°РіСЂСѓР·РёС‚Рµ HTML-С„Р°Р№Р» РёР»Рё РІСЃС‚Р°РІСЊС‚Рµ HTML РІС‹С€Рµ</div>
                )}
              </div>
            </div>
          </div>
          </div>

          <DialogFooter className="border-t border-white/10 px-6 py-4">
            <Button
              variant="outline"
              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => {
                setImportSource("");
                setImportFileName("");
                setShowImportSource(false);
                setSelectedImportKeys([]);
              }}
            >
              РћС‡РёСЃС‚РёС‚СЊ
            </Button>
            <Button
              className="rounded-none"
              onClick={handleImport}
              disabled={upsertCell.isPending || createExercise.isPending || selectedImportEntries.length === 0}
            >
              РРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ РІС‹Р±СЂР°РЅРЅРѕРµ
            </Button>
          </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
