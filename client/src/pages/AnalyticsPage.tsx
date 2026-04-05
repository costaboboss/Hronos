import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getISOWeek,
  isSameMonth,
  startOfMonth,
  startOfWeek,
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
      label: `Неделя ${w} (${format(cur, "d MMM", { locale: ru })} – ${format(
        end,
        "d MMM",
        { locale: ru }
      )})`,
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
  const map: Record<string, { name: string; color: string; blocks: number }> =
    {};
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

function buildEfficiencySeries(
  entries: EntryItem[],
  tags: TagItem[],
  dates: Date[],
  workNormBlocks: number
) {
  const workTagIds = new Set(tags.filter((t) => t.isWork).map((t) => t.id));
  const workTagNames = new Set(
    tags.filter((t) => t.isWork).map((t) => t.name.toLowerCase())
  );
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

function EfficiencyCards({
  series,
}: {
  series: Array<{ pct: number; blocks: number; fullLabel: string }>;
}) {
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
            <div className={`text-2xl font-semibold ${card.className}`}>
              {card.value}
            </div>
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
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.01 240)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "oklch(0.82 0.01 240)" }}
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
            <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
              <LabelList
                dataKey="pct"
                position="center"
                formatter={(value: number) => `${value}%`}
                style={{
                  fill: "#ffffff",
                  fontSize: 13,
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
                <div className="text-sm text-foreground truncate">
                  {item.fullLabel}
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.blocks} блоков • {item.hours.toFixed(1)}ч
                </div>
              </div>
              <Badge
                variant="outline"
                className={`${getEfficiencyTextClass(item.pct)} border-current/20`}
              >
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
            const pct = totalBlocks
              ? ((item.blocks / totalBlocks) * 100).toFixed(1)
              : "0";
            return (
              <div key={item.name} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="flex-1 text-sm text-foreground truncate">
                  {item.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {minutesToHM(item.blocks * 15)}
                </span>
                <span className="text-xs text-muted-foreground w-12 text-right">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
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
  const { data: entries = [] } = trpc.entries.getByRange.useQuery({
    startDate: weekOpt.start,
    endDate: weekOpt.end,
  });

  const stats = useMemo(() => buildTagStats(entries, tags), [entries, tags]);
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
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Распределение тегов</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={stats}
                    dataKey="blocks"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
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
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <TagBreakdown title="По тегам" stats={stats} />
        </div>
      )}
    </div>
  );
}

function MonthlyAnalytics({ tags }: { tags: TagItem[] }) {
  const { workNormBlocks } = useWorkNorm();
  const [monthNum, setMonthNum] = useState("1");
  const monthOpt =
    MONTH_OPTIONS.find((month) => month.value === monthNum) ?? MONTH_OPTIONS[0];
  const { data: entries = [] } = trpc.entries.getByRange.useQuery({
    startDate: monthOpt.start,
    endDate: monthOpt.end,
  });

  const stats = useMemo(() => buildTagStats(entries, tags), [entries, tags]);
  const monthDays = useMemo(
    () =>
      eachDayOfInterval({ start: monthOpt.startDate, end: monthOpt.endDate }).filter(
        (day) => isSameMonth(day, monthOpt.startDate)
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

      {stats.length > 0 && <TagBreakdown title="Распределение по тегам" stats={stats} />}
    </div>
  );
}

function YearlyAnalytics({ tags }: { tags: TagItem[] }) {
  const { workNormBlocks } = useWorkNorm();
  const [selectedTag, setSelectedTag] = useState("all");
  const { data: entries = [] } = trpc.entries.getByRange.useQuery({
    startDate: "2025-12-29",
    endDate: "2026-12-31",
  });

  const yearStats = useMemo(() => buildTagStats(entries, tags), [entries, tags]);
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
        row[tag.name] =
          weekEntries.filter((entry) => entry.tagName === tag.name).length * 15;
      }
      return row;
    });
  }, [entries, tags]);

  const displayTags =
    selectedTag === "all"
      ? tags.slice(0, 6)
      : tags.filter((tag) => tag.name === selectedTag);

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
          Год 2026 • Норма дня:{" "}
          <strong className="text-foreground">{workNormBlocks} блоков</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <EfficiencyChart
          title="Средняя эффективность по неделям"
          series={weeklyEfficiency.map((item) => ({
            ...item,
            label: item.week,
            fullLabel: item.week,
            blocks: item.pct,
            hours: item.pct,
          }))}
        />

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Динамика тегов по неделям
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyTrend} margin={{ left: 0, right: 10 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.28 0.01 240)"
                />
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
                  }}
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {yearStats.map((item) => {
          const pct = yearStats.length
            ? Math.round(
                (item.blocks /
                  yearStats.reduce((sum, current) => sum + current.blocks, 0)) *
                  100
              )
            : 0;
          return (
            <Card key={item.name} className="bg-card border-border">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm font-medium text-foreground truncate">
                    {item.name}
                  </span>
                </div>
                <div className="text-lg font-bold text-foreground">
                  {minutesToHM(item.blocks * 15)}
                </div>
                <div className={`text-xs ${getEfficiencyTextClass(pct)}`}>
                  {pct}% года
                </div>
              </CardContent>
            </Card>
          );
        })}
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
