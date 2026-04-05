import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { format, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth, startOfYear, endOfYear, getISOWeek } from "date-fns";
import { ru } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function minutesToHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

function getWeekOptions() {
  const opts = [];
  let cur = new Date(2025, 11, 29); // ISO week 1 of 2026
  for (let w = 1; w <= 53; w++) {
    const end = addDays(cur, 6);
    opts.push({
      value: String(w),
      label: `Неделя ${w} (${format(cur, "d MMM", { locale: ru })} – ${format(end, "d MMM", { locale: ru })})`,
      start: format(cur, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
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
    };
  });
}

const WEEK_OPTIONS = getWeekOptions();
const MONTH_OPTIONS = getMonthOptions();

type TagItem = { id: number; name: string; color: string };

function buildTagStats(entries: { tagName: string | null; tagId: number | null }[], tags: TagItem[]) {
  const map: Record<string, { name: string; color: string; blocks: number }> = {};
  for (const e of entries) {
    if (!e.tagName) continue;
    if (!map[e.tagName]) {
      const tag = tags.find(t => t.id === e.tagId);
      map[e.tagName] = { name: e.tagName, color: tag?.color ?? "#6b7280", blocks: 0 };
    }
    map[e.tagName].blocks++;
  }
  return Object.values(map).sort((a, b) => b.blocks - a.blocks);
}

// ─── WeeklyAnalytics ─────────────────────────────────────────────────────────

function WeeklyAnalytics({ tags }: { tags: TagItem[] }) {
  const [weekNum, setWeekNum] = useState(() => {
    // Default to current week
    const now = new Date();
    const w = getISOWeek(now);
    return String(Math.min(w, 53));
  });

  const weekOpt = WEEK_OPTIONS.find(w => w.value === weekNum) ?? WEEK_OPTIONS[0];
  const { data: entries = [] } = trpc.entries.getByRange.useQuery(
    { startDate: weekOpt.start, endDate: weekOpt.end },
    { enabled: true }
  );

  const stats = useMemo(() => buildTagStats(entries, tags), [entries, tags]);
  const totalBlocks = stats.reduce((s, t) => s + t.blocks, 0);
  const top5 = stats.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={weekNum} onValueChange={setWeekNum}>
          <SelectTrigger className="w-72 bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border max-h-64">
            {WEEK_OPTIONS.map(w => (
              <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          Всего заполнено: <strong className="text-foreground">{minutesToHM(totalBlocks * 15)}</strong>
        </span>
      </div>

      {stats.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Нет данных за эту неделю
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pie chart */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Распределение</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={stats} dataKey="blocks" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {stats.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => minutesToHM(v * 15)} contentStyle={{ backgroundColor: "oklch(0.17 0.01 240)", border: "1px solid oklch(0.28 0.01 240)", borderRadius: 6 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground">По тегам</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.map((s, i) => {
                  const pct = totalBlocks > 0 ? ((s.blocks / totalBlocks) * 100).toFixed(1) : "0";
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="flex-1 text-sm text-foreground truncate">{s.name}</span>
                      <span className="text-sm text-muted-foreground">{minutesToHM(s.blocks * 15)}</span>
                      <span className="text-xs text-muted-foreground w-12 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Top 5 */}
          <Card className="bg-card border-border lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Топ-5 тегов</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 flex-wrap">
                {top5.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: s.color + "44", backgroundColor: s.color + "11" }}>
                    <span className="text-lg font-bold" style={{ color: s.color }}>#{i + 1}</span>
                    <div>
                      <div className="text-sm font-medium text-foreground">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{minutesToHM(s.blocks * 15)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── MonthlyAnalytics ─────────────────────────────────────────────────────────

function MonthlyAnalytics({ tags }: { tags: TagItem[] }) {
  const [monthNum, setMonthNum] = useState("1");
  const monthOpt = MONTH_OPTIONS.find(m => m.value === monthNum) ?? MONTH_OPTIONS[0];
  const { data: entries = [] } = trpc.entries.getByRange.useQuery(
    { startDate: monthOpt.start, endDate: monthOpt.end },
    { enabled: true }
  );

  const stats = useMemo(() => buildTagStats(entries, tags), [entries, tags]);
  const totalBlocks = stats.reduce((s, t) => s + t.blocks, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={monthNum} onValueChange={setMonthNum}>
          <SelectTrigger className="w-52 bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {MONTH_OPTIONS.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          Всего: <strong className="text-foreground">{minutesToHM(totalBlocks * 15)}</strong>
        </span>
      </div>

      {stats.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Нет данных за этот месяц</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Распределение</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.01 240)" />
                  <XAxis type="number" tickFormatter={v => minutesToHM(v * 15)} tick={{ fontSize: 10, fill: "oklch(0.55 0.01 240)" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.85 0.01 240)" }} width={56} />
                  <Tooltip formatter={(v: number) => minutesToHM(v * 15)} contentStyle={{ backgroundColor: "oklch(0.17 0.01 240)", border: "1px solid oklch(0.28 0.01 240)", borderRadius: 6 }} />
                  <Bar dataKey="blocks" radius={[0, 4, 4, 0]}>
                    {stats.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">По тегам</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.map((s, i) => {
                  const pct = totalBlocks > 0 ? ((s.blocks / totalBlocks) * 100).toFixed(1) : "0";
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="flex-1 text-sm text-foreground truncate">{s.name}</span>
                      <span className="text-sm text-muted-foreground">{minutesToHM(s.blocks * 15)}</span>
                      <span className="text-xs text-muted-foreground w-12 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── YearlyAnalytics ─────────────────────────────────────────────────────────

function YearlyAnalytics({ tags }: { tags: TagItem[] }) {
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const { data: entries = [] } = trpc.entries.getByRange.useQuery(
    { startDate: "2025-12-29", endDate: "2026-12-31" },
    { enabled: true }
  );

  // Build weekly data for trend chart
  const weeklyData = useMemo(() => {
    return WEEK_OPTIONS.map(w => {
      const weekEntries = entries.filter(e => e.entryDate >= w.start && e.entryDate <= w.end);
      const row: Record<string, number | string> = { week: `Н${w.value}` };
      for (const tag of tags) {
        row[tag.name] = weekEntries.filter(e => e.tagName === tag.name).length * 15; // minutes
      }
      return row;
    });
  }, [entries, tags]);

  // Yearly totals
  const yearStats = useMemo(() => buildTagStats(entries, tags), [entries, tags]);
  const totalBlocks = yearStats.reduce((s, t) => s + t.blocks, 0);

  const displayTags = selectedTag === "all" ? tags.slice(0, 6) : tags.filter(t => t.name === selectedTag);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={selectedTag} onValueChange={setSelectedTag}>
          <SelectTrigger className="w-52 bg-card border-border">
            <SelectValue placeholder="Все теги" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">Топ-6 тегов</SelectItem>
            {tags.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          Год 2026 · Всего: <strong className="text-foreground">{minutesToHM(totalBlocks * 15)}</strong>
        </span>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Динамика по неделям (минуты)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={weeklyData} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.01 240)" />
              <XAxis dataKey="week" tick={{ fontSize: 9, fill: "oklch(0.55 0.01 240)" }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.01 240)" }} tickFormatter={v => `${Math.round(v / 60)}ч`} />
              <Tooltip formatter={(v: number) => minutesToHM(v)} contentStyle={{ backgroundColor: "oklch(0.17 0.01 240)", border: "1px solid oklch(0.28 0.01 240)", borderRadius: 6 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {displayTags.map(tag => (
                <Line key={tag.name} type="monotone" dataKey={tag.name} stroke={tag.color} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {yearStats.map((s, i) => (
          <Card key={i} className="bg-card border-border">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
              </div>
              <div className="text-lg font-bold text-foreground">{minutesToHM(s.blocks * 15)}</div>
              <div className="text-xs text-muted-foreground">
                {totalBlocks > 0 ? ((s.blocks / totalBlocks) * 100).toFixed(1) : 0}% года
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user } = useAuth();
  const { data: tags = [] } = trpc.tags.list.useQuery(undefined, { enabled: !!user });

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">Аналитика</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Статистика по тегам за 2026 год</p>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="week">
          <TabsList className="bg-muted mb-4">
            <TabsTrigger value="week">По неделям</TabsTrigger>
            <TabsTrigger value="month">По месяцам</TabsTrigger>
            <TabsTrigger value="year">За год</TabsTrigger>
          </TabsList>
          <TabsContent value="week"><WeeklyAnalytics tags={tags} /></TabsContent>
          <TabsContent value="month"><MonthlyAnalytics tags={tags} /></TabsContent>
          <TabsContent value="year"><YearlyAnalytics tags={tags} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
