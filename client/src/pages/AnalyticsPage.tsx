import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getISOWeek,
  isSameMonth,
  startOfMonth,
} from "date-fns";
import { ru } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { getEfficiencyColor, getEfficiencyTextClass } from "@/lib/efficiency";
import { blocksToHours, blocksToPercent, useWorkNorm } from "@/lib/workNorm";
import { getTagGoals } from "@/lib/planning";

type TagItem = {
  id: number;
  name: string;
  color: string;
  isWork?: boolean;
};

type EntryItem = {
  entryDate: string;
  tagId: number | null;
  tagName: string | null;
};

type EfficiencyPoint = {
  dateStr: string;
  label: string;
  shortLabel: string;
  fullLabel: string;
  blocks: number;
  hours: number;
  pct: number;
  color: string;
};

function minutesToHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

function getWeekOptions() {
  const opts = [];
  let cur = new Date(2025, 11, 29);
  for (let w = 1; w <= 53; w++) {
    const end = addDays(cur, 6);
    opts.push({
      value: String(w),
      label: `Неделя ${w} (${format(cur, "d MMM", { locale: ru })} – ${format(end, "d MMM", {
        locale: ru,
      })})`,
      start: format(cur, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
      startDate: cur,
      endDate: end,
    });
    cur = addDays(cur, 7);
  }
  return opts;
}

function getMonthOptions() {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(2026, i, 1);
    return {
      value: String(i + 1),
      label: format(d, "LLLL yyyy", { locale: ru }),
      start: format(startOfMonth(d), "yyyy-MM-dd"),
      end: format(endOfMonth(d), "yyyy-MM-dd"),
      startDate: startOfMonth(d),
      endDate: endOfMonth(d),
    };
  });
}

const WEEK_OPTIONS = getWeekOptions();
const MONTH_OPTIONS = getMonthOptions();

function buildTagStats(entries: EntryItem[], tags: TagItem[]) {
  const map: Record<string, { name: string; color: string; blocks: number }> = {};
  for (const e of entries) {
    if (!e.tagName) continue;
    if (!map[e.tagName]) {
      const tag = tags.find((t) => t.id === e.tagId);
      map[e.tagName] = {
        name: e.tagName,
        color: tag?.color ?? "#6b7280",
        blocks: 0,
      };
    }
    map[e.tagName].blocks++;
  }
  return Object.values(map).sort((a, b) => b.blocks - a.blocks);
}

function buildAwakeTagStats(
  stats: Array<{ name: string; color: string; blocks: number }>
) {
  return stats.filter((item) => item.name.trim().toLowerCase() !== "сон");
}

function buildEfficiencySeries(
  entries: EntryItem[],
  tags: TagItem[],
  dates: Date[],
  workNormBlocks: number
): EfficiencyPoint[] {
  const workTagIds = new Set(tags.filter((t) => t.isWork).map((t) => t.id));
  const workTagNames = new Set(tags.filter((t) => t.isWork).map((t) => t.name.toLowerCase()));
  const dayCounts: Record<string, number> = {};

  for (const entry of entries) {
    const isWork =
      (entry.tagId && workTagIds.has(entry.tagId)) ||
      (entry.tagName && workTagNames.has(entry.tagName.toLowerCase()));
    if (!isWork) continue;
    dayCounts[entry.entryDate] = (dayCounts[entry.entryDate] ?? 0) + 1;
  }

  return dates.map((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const blocks = dayCounts[dateStr] ?? 0;
    const pct = blocksToPercent(blocks, workNormBlocks);
    return {
      dateStr,
      label: format(date, "d MMM", { locale: ru }),
      shortLabel: format(date, "EEEEE", { locale: ru }),
      fullLabel: format(date, "EEE, d MMM", { locale: ru }),
      blocks,
      hours: blocksToHours(blocks),
      pct,
      color: getEfficiencyColor(pct),
    };
  });
}

function EfficiencyCards({ series }: { series: Array<{ pct: number; fullLabel: string }> }) {
  const avgPct = series.length
    ? Math.round(series.reduce((sum, item) => sum + item.pct, 0) / series.length)
    : 0;
  const strongDays = series.filter((item) => item.pct >= 50).length;
  const bestDay = series.reduce<(typeof series)[number] | null>(
    (best, item) => (!best || item.pct > best.pct ? item : best),
    null
  );

  const cards = [
    {
      label: "Средняя эффективность",
      value: `${avgPct}%`,
      hint: `${series.length} дн. в периоде`,
      className: getEfficiencyTextClass(avgPct),
    },
    {
      label: "Дней >= 50%",
      value: `${strongDays} / ${series.length || 0}`,
      hint: "Показатель стабильности",
      className: strongDays > 0 ? "text-green-400" : "text-white/70",
    },
    {
      label: "Лучший день",
      value: bestDay ? `${bestDay.pct}%` : "0%",
      hint: bestDay?.fullLabel ?? "Нет данных",
      className: getEfficiencyTextClass(bestDay?.pct ?? 0),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {cards.map((card) => (
        <Card key={card.label} className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">{card.label}</div>
            <div className={`text-2xl font-semibold ${card.className}`}>{card.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{card.hint}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EfficiencyChart({
  title,
  series,
}: {
  title: string;
  series: Array<{
    label: string;
    fullLabel: string;
    pct: number;
    blocks: number;
    color: string;
  }>;
}) {
  const compact = series.length > 20;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={compact ? 280 : 240}>
          <BarChart data={series} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.01 240)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "oklch(0.82 0.01 240)" }}
              interval={compact ? 2 : 0}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "oklch(0.55 0.01 240)" }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              formatter={(value: number, _name, item: any) => [
                `${value}% (${item?.payload?.blocks ?? 0} бл.)`,
                item?.payload?.fullLabel ?? "Эффективность",
              ]}
              contentStyle={{
                backgroundColor: "oklch(0.17 0.01 240)",
                border: "1px solid oklch(0.28 0.01 240)",
                borderRadius: 6,
                color: "#ffffff",
              }}
              labelStyle={{ color: "#ffffff" }}
              itemStyle={{ color: "#ffffff" }}
            />
            <Bar dataKey="pct" radius={[6, 6, 0, 0]} maxBarSize={compact ? 22 : 36}>
              <LabelList
                dataKey="pct"
                position={compact ? "insideTop" : "center"}
                offset={compact ? 8 : 0}
                formatter={(value: number) => (compact ? (value > 0 ? `${value}%` : "") : `${value}%`)}
                style={{
                  fill: "#07111f",
                  fontSize: compact ? 10 : 12,
                  fontWeight: 700,
                }}
              />
              {series.map((item) => (
                <Cell key={item.fullLabel} fill={item.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function EfficiencyTable({
  title,
  series,
}: {
  title: string;
  series: Array<{
    fullLabel: string;
    hours: number;
    blocks: number;
    pct: number;
  }>;
}) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {series.map((item) => (
            <div key={item.fullLabel} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-foreground truncate">{item.fullLabel}</div>
                <div className="text-xs text-muted-foreground">
                  {item.blocks} блоков • {item.hours.toFixed(1)}ч
                </div>
              </div>
              <Badge variant="outline" className={`${getEfficiencyTextClass(item.pct)} border-current/20`}>
                {item.pct}%
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TagBreakdown({
  title,
  stats,
}: {
  title: string;
  stats: Array<{ name: string; color: string; blocks: number }>;
}) {
  const totalBlocks = stats.reduce((sum, item) => sum + item.blocks, 0);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {stats.map((item) => {
            const pct = totalBlocks ? ((item.blocks / totalBlocks) * 100).toFixed(1) : "0";
            return (
              <div key={item.name} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="flex-1 text-sm text-foreground truncate">{item.name}</span>
                <span className="text-sm text-muted-foreground">{minutesToHM(item.blocks * 15)}</span>
                <span className="text-xs text-muted-foreground w-12 text-right">{pct}%</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TagDistributionChart({
  title,
  stats,
}: {
  title: string;
  stats: Array<{ name: string; color: string; blocks: number }>;
}) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {stats.length === 0 ? (
          <div className="py-10 text-sm text-muted-foreground">Недостаточно данных для диаграммы.</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={stats}
                dataKey="blocks"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {stats.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => minutesToHM(value * 15)}
                contentStyle={{
                  backgroundColor: "oklch(0.17 0.01 240)",
                  border: "1px solid oklch(0.28 0.01 240)",
                  borderRadius: 6,
                  color: "#ffffff",
                }}
                labelStyle={{ color: "#ffffff" }}
                itemStyle={{ color: "#ffffff" }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function GoalBreakdown({
  title,
  stats,
  tags,
  dayCount,
}: {
  title: string;
  stats: Array<{ name: string; color: string; blocks: number }>;
  tags: TagItem[];
  dayCount: number;
}) {
  const goals = getTagGoals();
  const rows = tags
    .map((tag) => {
      const goalHours = goals[String(tag.id)];
      if (!goalHours) return null;
      const stat = stats.find((item) => item.name === tag.name);
      const actualHours = stat ? blocksToHours(stat.blocks) : 0;
      const targetHours = goalHours * dayCount;
      const pct = targetHours > 0 ? Math.round((actualHours / targetHours) * 100) : 0;
      return {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        actualHours,
        targetHours,
        pct,
      };
    })
    .filter((row): row is { id: number; name: string; color: string; actualHours: number; targetHours: number; pct: number } => !!row);

  if (rows.length === 0) return null;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                <span className="flex-1 text-sm text-foreground truncate">{row.name}</span>
                <span className={`text-xs font-medium ${getEfficiencyTextClass(Math.min(100, row.pct))}`}>
                  {row.actualHours.toFixed(1)} / {row.targetHours.toFixed(1)}ч
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, row.pct)}%`,
                    backgroundColor: row.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function YearTagCharts({
  stats,
  chartType,
}: {
  stats: Array<{ name: string; color: string; blocks: number }>;
  chartType: "pie" | "bar" | "line";
}) {
  const totalBlocks = stats.reduce((sum, item) => sum + item.blocks, 0);
  const chartData = stats.map((item) => ({
    ...item,
    minutes: item.blocks * 15,
    pct: totalBlocks ? Math.round((item.blocks / totalBlocks) * 100) : 0,
  }));

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Визуализация тегов за год</CardTitle>
      </CardHeader>
      <CardContent>
        {chartType === "pie" && (
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="minutes"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={105}
                label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                labelLine={false}
              >
                {chartData.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => minutesToHM(value)}
                contentStyle={{
                  backgroundColor: "oklch(0.17 0.01 240)",
                  border: "1px solid oklch(0.28 0.01 240)",
                  borderRadius: 6,
                  color: "#ffffff",
                }}
                labelStyle={{ color: "#ffffff" }}
                itemStyle={{ color: "#ffffff" }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}

        {chartType === "bar" && (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.01 240)" />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "oklch(0.55 0.01 240)" }}
                tickFormatter={(v) => `${Math.round(v / 60)}ч`}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={90}
                tick={{ fontSize: 11, fill: "oklch(0.82 0.01 240)" }}
              />
              <Tooltip
                formatter={(value: number) => minutesToHM(value)}
                contentStyle={{
                  backgroundColor: "oklch(0.17 0.01 240)",
                  border: "1px solid oklch(0.28 0.01 240)",
                  borderRadius: 6,
                  color: "#ffffff",
                }}
                labelStyle={{ color: "#ffffff" }}
                itemStyle={{ color: "#ffffff" }}
              />
              <Bar dataKey="minutes" radius={[0, 6, 6, 0]}>
                {chartData.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {chartType === "line" && (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ left: 8, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.01 240)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "oklch(0.55 0.01 240)" }}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "oklch(0.55 0.01 240)" }}
                tickFormatter={(v) => `${Math.round(v / 60)}ч`}
              />
              <Tooltip
                formatter={(value: number) => minutesToHM(value)}
                contentStyle={{
                  backgroundColor: "oklch(0.17 0.01 240)",
                  border: "1px solid oklch(0.28 0.01 240)",
                  borderRadius: 6,
                  color: "#ffffff",
                }}
                labelStyle={{ color: "#ffffff" }}
                itemStyle={{ color: "#ffffff" }}
              />
              <Line
                type="monotone"
                dataKey="minutes"
                stroke="#38bdf8"
                strokeWidth={3}
                dot={({ cx, cy, payload }) => (
                  <circle cx={cx} cy={cy} r={5} fill={payload.color} stroke="none" />
                )}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function WeeklyAnalytics({ tags }: { tags: TagItem[] }) {
  const { workNormBlocks } = useWorkNorm();
  const [weekNum, setWeekNum] = useState(() => {
    const now = new Date();
    return String(Math.min(getISOWeek(now), 53));
  });

  const weekOpt = WEEK_OPTIONS.find((w) => w.value === weekNum) ?? WEEK_OPTIONS[0];
  const previousWeekOpt =
    WEEK_OPTIONS.find((week) => week.value === String(Math.max(Number(weekNum) - 1, 1))) ?? WEEK_OPTIONS[0];
  const { data: entries = [] } = trpc.entries.getByRange.useQuery({
    startDate: weekOpt.start,
    endDate: weekOpt.end,
  });
  const { data: previousEntries = [] } = trpc.entries.getByRange.useQuery({
    startDate: previousWeekOpt.start,
    endDate: previousWeekOpt.end,
  });

  const stats = useMemo(() => buildTagStats(entries, tags), [entries, tags]);
  const awakeStats = useMemo(() => buildAwakeTagStats(stats), [stats]);
  const series = useMemo(
    () =>
      buildEfficiencySeries(
        entries,
        tags,
        eachDayOfInterval({ start: weekOpt.startDate, end: weekOpt.endDate }),
        workNormBlocks
      ),
    [entries, tags, weekOpt, workNormBlocks]
  );
  const previousSeries = useMemo(
    () =>
      buildEfficiencySeries(
        previousEntries,
        tags,
        eachDayOfInterval({ start: previousWeekOpt.startDate, end: previousWeekOpt.endDate }),
        workNormBlocks
      ),
    [previousEntries, previousWeekOpt, tags, workNormBlocks]
  );
  const currentAvg = series.length ? Math.round(series.reduce((sum, item) => sum + item.pct, 0) / series.length) : 0;
  const previousAvg = previousSeries.length
    ? Math.round(previousSeries.reduce((sum, item) => sum + item.pct, 0) / previousSeries.length)
    : 0;
  const delta = currentAvg - previousAvg;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={weekNum} onValueChange={setWeekNum}>
          <SelectTrigger className="w-72 bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border max-h-64">
            {WEEK_OPTIONS.map((week) => (
              <SelectItem key={week.value} value={week.value}>
                {week.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          Норма дня:{" "}
          <strong className="text-foreground">
            {workNormBlocks} блоков ({blocksToHours(workNormBlocks).toFixed(1)}ч)
          </strong>
        </span>
      </div>

      <EfficiencyCards series={series} />

      <Card className="bg-card border-border">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-xs text-muted-foreground">Сравнение с прошлой неделей</div>
              <div className={`text-2xl font-semibold ${delta >= 0 ? "text-green-400" : "text-red-400"}`}>
                {delta >= 0 ? "+" : ""}{delta}%
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Было: <span className="text-foreground font-medium">{previousAvg}%</span> ·
              Стало: <span className="text-foreground font-medium"> {currentAvg}%</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Прошлая неделя: <span className="text-foreground">{previousWeekOpt.label}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <EfficiencyChart
          title="Эффективность по дням недели"
          series={series.map((item) => ({
            ...item,
            label: item.shortLabel,
          }))}
        />
        <EfficiencyTable title="Детализация по дням" series={series} />
      </div>

      {stats.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <TagDistributionChart title="Распределение тегов" stats={stats} />
          <TagBreakdown title="По тегам" stats={stats} />
          <TagDistributionChart title="Распределение по бодрствованию" stats={awakeStats} />
          <TagBreakdown title="По бодрствованию" stats={awakeStats} />
        </div>
      )}

      <GoalBreakdown title="Прогресс по целям за неделю" stats={stats} tags={tags} dayCount={7} />
    </div>
  );
}

function MonthlyAnalytics({ tags }: { tags: TagItem[] }) {
  const { workNormBlocks } = useWorkNorm();
  const [monthNum, setMonthNum] = useState("1");
  const monthOpt = MONTH_OPTIONS.find((month) => month.value === monthNum) ?? MONTH_OPTIONS[0];
  const { data: entries = [] } = trpc.entries.getByRange.useQuery({
    startDate: monthOpt.start,
    endDate: monthOpt.end,
  });

  const stats = useMemo(() => buildTagStats(entries, tags), [entries, tags]);
  const awakeStats = useMemo(() => buildAwakeTagStats(stats), [stats]);
  const monthDays = useMemo(
    () =>
      eachDayOfInterval({ start: monthOpt.startDate, end: monthOpt.endDate }).filter((day) =>
        isSameMonth(day, monthOpt.startDate)
      ),
    [monthOpt]
  );
  const series = useMemo(
    () => buildEfficiencySeries(entries, tags, monthDays, workNormBlocks),
    [entries, tags, monthDays, workNormBlocks]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={monthNum} onValueChange={setMonthNum}>
          <SelectTrigger className="w-56 bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {MONTH_OPTIONS.map((month) => (
              <SelectItem key={month.value} value={month.value}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          Норма дня:{" "}
          <strong className="text-foreground">
            {workNormBlocks} блоков ({blocksToHours(workNormBlocks).toFixed(1)}ч)
          </strong>
        </span>
      </div>

      <EfficiencyCards series={series} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <EfficiencyChart title="Эффективность по дням месяца" series={series} />
        <EfficiencyTable title="Лучшие дни месяца" series={[...series].sort((a, b) => b.pct - a.pct).slice(0, 10)} />
      </div>

      {stats.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <TagBreakdown title="Распределение по тегам" stats={stats} />
          <TagBreakdown title="По бодрствованию" stats={awakeStats} />
        </div>
      )}
    </div>
  );
}

function YearlyAnalytics({ tags }: { tags: TagItem[] }) {
  const { workNormBlocks } = useWorkNorm();
  const [selectedTag, setSelectedTag] = useState("all");
  const [tagChartType, setTagChartType] = useState<"pie" | "bar" | "line">("pie");
  const { data: entries = [] } = trpc.entries.getByRange.useQuery({
    startDate: "2025-12-29",
    endDate: "2026-12-31",
  });

  const yearStats = useMemo(() => buildTagStats(entries, tags), [entries, tags]);
  const awakeYearStats = useMemo(() => buildAwakeTagStats(yearStats), [yearStats]);
  const weeklyEfficiency = useMemo(() => {
    return WEEK_OPTIONS.map((week) => {
      const weekEntries = entries.filter(
        (entry) => entry.entryDate >= week.start && entry.entryDate <= week.end
      );
      const weekSeries = buildEfficiencySeries(
        weekEntries,
        tags,
        eachDayOfInterval({ start: week.startDate, end: week.endDate }),
        workNormBlocks
      );
      const pct = weekSeries.length
        ? Math.round(
            weekSeries.reduce((sum, item) => sum + item.pct, 0) / weekSeries.length
          )
        : 0;
      return {
        week: `Н${week.value}`,
        pct,
        color: getEfficiencyColor(pct),
      };
    });
  }, [entries, tags, workNormBlocks]);

  const weeklyTrend = useMemo(() => {
    return WEEK_OPTIONS.map((week) => {
      const weekEntries = entries.filter(
        (entry) => entry.entryDate >= week.start && entry.entryDate <= week.end
      );
      const row: Record<string, number | string> = { week: `Н${week.value}` };
      for (const tag of tags) {
        row[tag.name] = weekEntries.filter((entry) => entry.tagName === tag.name).length * 15;
      }
      return row;
    });
  }, [entries, tags]);

  const displayTags =
    selectedTag === "all"
      ? tags.slice(0, 6)
      : tags.filter((tag) => tag.name === selectedTag);

  const yearStatCards = useMemo(() => {
    const total = yearStats.reduce((sum, item) => sum + item.blocks, 0);
    return yearStats.map((item) => ({
      ...item,
      pct: total ? Math.round((item.blocks / total) * 100) : 0,
    }));
  }, [yearStats]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedTag} onValueChange={setSelectedTag}>
          <SelectTrigger className="w-56 bg-card border-border">
            <SelectValue placeholder="Все теги" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">Топ-6 тегов</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.name}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">
          Год 2026 • Норма дня: <strong className="text-foreground">{workNormBlocks} блоков</strong>
        </span>

        <Select value={tagChartType} onValueChange={(value: "pie" | "bar" | "line") => setTagChartType(value)}>
          <SelectTrigger className="w-56 bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="pie">Круговая диаграмма</SelectItem>
            <SelectItem value="bar">Гистограмма</SelectItem>
            <SelectItem value="line">Линейная диаграмма</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Средняя эффективность по неделям</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={weeklyEfficiency} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.01 240)" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10, fill: "oklch(0.82 0.01 240)" }}
                  interval={2}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "oklch(0.55 0.01 240)" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: number) => `${value}%`}
                  contentStyle={{
                    backgroundColor: "oklch(0.17 0.01 240)",
                    border: "1px solid oklch(0.28 0.01 240)",
                    borderRadius: 6,
                    color: "#ffffff",
                  }}
                  labelStyle={{ color: "#ffffff" }}
                  itemStyle={{ color: "#ffffff" }}
                />
                <Bar dataKey="pct" radius={[6, 6, 0, 0]} maxBarSize={22}>
                  <LabelList
                    dataKey="pct"
                    position="insideTop"
                    offset={8}
                    formatter={(value: number) => (value > 0 ? `${value}%` : "")}
                    style={{
                      fill: "#07111f",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  />
                  {weeklyEfficiency.map((item) => (
                    <Cell key={item.week} fill={item.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Динамика тегов по неделям</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={weeklyTrend} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.01 240)" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 9, fill: "oklch(0.55 0.01 240)" }}
                  interval={3}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "oklch(0.55 0.01 240)" }}
                  tickFormatter={(v) => `${Math.round(v / 60)}ч`}
                />
                <Tooltip
                  formatter={(value: number) => minutesToHM(value)}
                  contentStyle={{
                    backgroundColor: "oklch(0.17 0.01 240)",
                    border: "1px solid oklch(0.28 0.01 240)",
                    borderRadius: 6,
                    color: "#ffffff",
                  }}
                  labelStyle={{ color: "#ffffff" }}
                  itemStyle={{ color: "#ffffff" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {displayTags.map((tag) => (
                  <Line
                    key={tag.name}
                    type="monotone"
                    dataKey={tag.name}
                    stroke={tag.color}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] gap-4">
        <YearTagCharts stats={yearStats} chartType={tagChartType} />
        <TagBreakdown title="По тегам за год" stats={yearStats} />
      </div>

      {awakeYearStats.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] gap-4">
          <YearTagCharts stats={awakeYearStats} chartType={tagChartType} />
          <TagBreakdown title="По бодрствованию за год" stats={awakeYearStats} />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {yearStatCards.map((item) => (
          <Card key={item.name} className="bg-card border-border">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
              </div>
              <div className="text-lg font-bold text-foreground">{minutesToHM(item.blocks * 15)}</div>
              <div className={`text-xs ${getEfficiencyTextClass(item.pct)}`}>{item.pct}% года</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const { data: tags = [] } = trpc.tags.list.useQuery(undefined, {
    enabled: !!user,
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">Аналитика</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Эффективность и распределение тегов за 2026 год
        </p>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="week">
          <TabsList className="bg-muted mb-4">
            <TabsTrigger value="week">По неделям</TabsTrigger>
            <TabsTrigger value="month">По месяцам</TabsTrigger>
            <TabsTrigger value="year">За год</TabsTrigger>
          </TabsList>
          <TabsContent value="week">
            <WeeklyAnalytics tags={tags} />
          </TabsContent>
          <TabsContent value="month">
            <MonthlyAnalytics tags={tags} />
          </TabsContent>
          <TabsContent value="year">
            <YearlyAnalytics tags={tags} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
