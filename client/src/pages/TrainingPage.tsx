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
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type ExerciseDraft = {
  id: string;
  name: string;
  weightKg: string;
  reps: string;
};

function createExerciseDraft(): ExerciseDraft {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    weightKg: "",
    reps: "",
  };
}

function formatKg(value: number) {
  return value.toLocaleString("ru-RU");
}

export default function TrainingPage() {
  const utils = trpc.useUtils();
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [yearCursor, setYearCursor] = useState(() => new Date().getFullYear());
  const [createOpen, setCreateOpen] = useState(false);
  const [trainingForm, setTrainingForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    title: "",
    startTimeText: "",
    durationMinutes: "",
    notes: "",
    exercises: [createExerciseDraft()],
  });

  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth() + 1;

  const matrixQuery = trpc.training.matrixByMonth.useQuery({ year, month });
  const yearOverviewQuery = trpc.training.yearOverview.useQuery({ year: yearCursor });
  const recentSessionsQuery = trpc.training.listRecentSessions.useQuery({ limit: 8 });
  const exercisesQuery = trpc.training.listExercises.useQuery();

  const createExercise = trpc.training.createExercise.useMutation();
  const createSession = trpc.training.createSession.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.training.matrixByMonth.invalidate(),
        utils.training.yearOverview.invalidate(),
        utils.training.listRecentSessions.invalidate(),
        utils.training.dashboard.invalidate(),
        utils.training.listExercises.invalidate(),
      ]);

      setCreateOpen(false);
      setTrainingForm({
        date: format(new Date(), "yyyy-MM-dd"),
        title: "",
        startTimeText: "",
        durationMinutes: "",
        notes: "",
        exercises: [createExerciseDraft()],
      });
      toast.success("Тренировка добавлена");
    },
  });

  const monthHeading = useMemo(
    () => format(cursorDate, "LLLL yyyy", { locale: ru }),
    [cursorDate]
  );

  const monthDays = matrixQuery.data?.days ?? [];
  const monthExercises = matrixQuery.data?.exercises ?? [];

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
        exercise = await createExercise.mutateAsync({
          name: row.name,
          volumeMode: "weight_reps",
        });
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
        sets: [
          {
            setType: "work" as const,
            weightKg: Math.round(weight),
            reps: Math.round(reps),
            rawInput: `${Math.round(weight)}кг ${Math.round(reps)}`,
          },
        ],
      });
    }

    await createSession.mutateAsync({
      title: trainingForm.title.trim(),
      performedAt: new Date(`${trainingForm.date}T12:00:00`).toISOString(),
      startTimeText: trainingForm.startTimeText.trim() || undefined,
      durationMinutes: trainingForm.durationMinutes.trim()
        ? Number(trainingForm.durationMinutes)
        : null,
      notes: trainingForm.notes.trim() || undefined,
      exercises: sessionExercises,
    });
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

  return (
    <div className="h-full overflow-auto bg-[#07090d] text-slate-100">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border border-white/10 bg-[#0b0f14] px-5 py-4">
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Training Dashboard</div>
            <h1 className="text-2xl font-semibold tracking-tight">Тренировки</h1>
            <p className="max-w-3xl text-sm text-slate-400">
              Месячная грузоподъемность, аналитика по году и быстрый ручной ввод тренировок.
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
              Текущий месяц
            </Button>

            <Button className="rounded-none" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить тренировку
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">Грузоподъемность месяца</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{formatKg(monthSummary.totalVolume)} кг</div>
              <div className="mt-2 text-sm text-slate-500">Сумма по всем упражнениям за выбранный месяц</div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">Количество тренировок</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{monthSummary.workoutCount}</div>
              <div className="mt-2 text-sm text-slate-500">Тренировочных дней в месяце</div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">Средняя тренировка</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{formatKg(monthSummary.averageVolume)} кг</div>
              <div className="mt-2 text-sm text-slate-500">Средняя грузоподъемность на тренировочный день</div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">Пиковый день</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{formatKg(monthSummary.maxDayVolume)} кг</div>
              <div className="mt-2 text-sm text-slate-500">Максимальная грузоподъемность за день</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
            <CardHeader className="border-b border-white/10 pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Аналитика года</CardTitle>
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
                <div>Месяц</div>
                <div className="text-right">Грузоподъемность</div>
                <div className="text-right">Тренировок</div>
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
                      onClick={() => {
                        setCursorDate(new Date(yearCursor, item.month - 1, 1));
                      }}
                    >
                      {item.monthLabel}
                    </button>
                    <div className="text-right font-medium text-slate-100">
                      {formatKg(item.totalVolume)} кг
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
                <CardTitle className="text-base">Топ упражнений месяца</CardTitle>
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
                          {index + 1} место
                        </div>
                        <div className="truncate font-medium text-slate-100">{exercise.name}</div>
                      </div>
                      <div className="text-right font-semibold text-slate-100">
                        {formatKg(exercise.totalVolume)} кг
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
                    В выбранном месяце пока нет тренировок.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-none border-white/10 bg-[#0b0f14] text-slate-100">
              <CardHeader className="border-b border-white/10 pb-3">
                <CardTitle className="text-base">Последние тренировки</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {(recentSessionsQuery.data ?? []).length ? (
                  recentSessionsQuery.data?.map(session => {
                    const sessionVolume = session.exercises.reduce(
                      (sum, exercise) => sum + (exercise.computedVolume ?? 0),
                      0
                    );

                    return (
                      <div
                        key={session.id}
                        className="border border-white/10 bg-white/5 px-3 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-100">{session.title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {format(new Date(session.performedAt), "d MMMM yyyy", { locale: ru })}
                            </div>
                          </div>
                          <div className="text-right text-sm font-semibold text-slate-100">
                            {formatKg(sessionVolume)} кг
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          {session.exercises.length} упражн.{" "}
                          {session.durationMinutes ? `• ${session.durationMinutes} мин` : ""}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
                    Пока нет сохраненных тренировок.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-5xl border-white/10 bg-[#0b0f14] text-slate-100">
          <DialogHeader>
            <DialogTitle>Добавить тренировку</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-4">
            <Input
              type="date"
              className="rounded-none border-white/10 bg-white/5"
              value={trainingForm.date}
              onChange={event =>
                setTrainingForm(current => ({ ...current, date: event.target.value }))
              }
            />
            <Input
              placeholder="Название тренировки"
              className="rounded-none border-white/10 bg-white/5 md:col-span-2"
              value={trainingForm.title}
              onChange={event =>
                setTrainingForm(current => ({ ...current, title: event.target.value }))
              }
            />
            <Input
              placeholder="Время начала"
              className="rounded-none border-white/10 bg-white/5"
              value={trainingForm.startTimeText}
              onChange={event =>
                setTrainingForm(current => ({ ...current, startTimeText: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
            <Input
              type="number"
              placeholder="Длительность, мин"
              className="rounded-none border-white/10 bg-white/5"
              value={trainingForm.durationMinutes}
              onChange={event =>
                setTrainingForm(current => ({ ...current, durationMinutes: event.target.value }))
              }
            />
            <Textarea
              placeholder="Заметка к тренировке"
              className="min-h-[44px] rounded-none border-white/10 bg-white/5"
              value={trainingForm.notes}
              onChange={event =>
                setTrainingForm(current => ({ ...current, notes: event.target.value }))
              }
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-100">Упражнения</div>
                <div className="text-xs text-slate-500">
                  Для каждого упражнения сейчас вводим название, вес и количество повторов.
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                onClick={addExerciseRow}
              >
                <Plus className="mr-2 h-4 w-4" />
                Добавить упражнение
              </Button>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_130px_130px_48px] gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <div>Название упражнения</div>
                <div>Вес, кг</div>
                <div>Повторы</div>
                <div />
              </div>

              {trainingForm.exercises.map(row => (
                <div
                  key={row.id}
                  className="grid grid-cols-[minmax(0,1fr)_130px_130px_48px] gap-2"
                >
                  <Input
                    placeholder="Например: Жим лежа"
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
            <Button
              variant="outline"
              className="rounded-none border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              onClick={() => setCreateOpen(false)}
            >
              Отмена
            </Button>
            <Button className="rounded-none" onClick={handleSubmitTraining} disabled={createSession.isPending}>
              Сохранить тренировку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
