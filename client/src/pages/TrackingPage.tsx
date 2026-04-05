import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { format, startOfWeek, addDays, getWeek, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Copy, Trash2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeeksOf2026() {
  const weeks: { weekNum: number; days: Date[] }[] = [];
  // Week 1 of 2026: Jan 1 is Thursday, ISO week 1 starts Mon Dec 29 2025
  // We want calendar weeks for 2026 display
  let current = new Date(2025, 11, 29); // Mon Dec 29 2025 (ISO week 1 of 2026)
  for (let w = 1; w <= 53; w++) {
    const days: Date[] = [];
    for (let d = 0; d < 7; d++) {
      days.push(new Date(current));
      current = addDays(current, 1);
    }
    weeks.push({ weekNum: w, days });
  }
  return weeks;
}

function getTimeSlots(): { start: string; end: string }[] {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const start = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const endM = m + 15;
      const endH = endM >= 60 ? h + 1 : h;
      const end = `${String(endH % 24).padStart(2, "0")}:${String(endM % 60).padStart(2, "0")}`;
      slots.push({ start, end });
    }
  }
  return slots;
}

const TIME_SLOTS = getTimeSlots();
const WEEKS = getWeeksOf2026();

// ─── Types ───────────────────────────────────────────────────────────────────

type TagItem = { id: number; name: string; color: string; isDefault: boolean };
type EntryMap = Record<string, { tagId: number | null; tagName: string | null; comment?: string | null }>;

// ─── TagSelector ─────────────────────────────────────────────────────────────

function TagSelector({
  value,
  tags,
  onSelect,
  onClear,
  onAddTag,
}: {
  value: { tagId: number | null; tagName: string | null } | undefined;
  tags: TagItem[];
  onSelect: (tag: TagItem) => void;
  onClear: () => void;
  onAddTag: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newTag, setNewTag] = useState("");

  const selected = tags.find(t => t.id === value?.tagId);
  const bgColor = selected?.color ?? "transparent";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="w-full h-5 rounded-sm text-[9px] font-medium truncate px-1 transition-all hover:opacity-80 border border-transparent hover:border-white/10"
          style={{
            backgroundColor: selected ? bgColor + "55" : "transparent",
            color: selected ? bgColor : "oklch(0.55 0.01 240)",
            borderColor: selected ? bgColor + "44" : "transparent",
          }}
          title={selected?.name ?? "Нет тега"}
        >
          {selected?.name ?? "·"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 bg-card border-border" side="right" align="start">
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {tags.map(tag => (
            <button
              key={tag.id}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors text-left"
              onClick={() => { onSelect(tag); setOpen(false); }}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
              <span className="text-foreground">{tag.name}</span>
            </button>
          ))}
          {value?.tagId && (
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-destructive/20 text-destructive transition-colors"
              onClick={() => { onClear(); setOpen(false); }}
            >
              <Trash2 className="w-3 h-3" />
              Очистить
            </button>
          )}
        </div>
        <div className="border-t border-border mt-2 pt-2 flex gap-1">
          <Input
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            placeholder="Новый тег..."
            className="h-7 text-xs bg-input"
            onKeyDown={e => {
              if (e.key === "Enter" && newTag.trim()) {
                onAddTag(newTag.trim());
                setNewTag("");
                setOpen(false);
              }
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => {
              if (newTag.trim()) { onAddTag(newTag.trim()); setNewTag(""); setOpen(false); }
            }}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── WeekTable ────────────────────────────────────────────────────────────────

function WeekTable({
  week,
  tags,
  entries,
  onSetEntry,
  onBulkSet,
  onAddTag,
}: {
  week: { weekNum: number; days: Date[] };
  tags: TagItem[];
  entries: EntryMap;
  onSetEntry: (date: string, slot: { start: string; end: string }, tag: TagItem | null) => void;
  onBulkSet: (date: string, startIdx: number, endIdx: number, tag: TagItem | null) => void;
  onAddTag: (name: string) => void;
}) {
  const [dragStart, setDragStart] = useState<{ date: string; slotIdx: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ date: string; slotIdx: number } | null>(null);
  const [dragTag, setDragTag] = useState<TagItem | null>(null);

  const isDragging = dragStart !== null;

  const isInDragRange = (date: string, slotIdx: number) => {
    if (!dragStart || !dragEnd || dragStart.date !== date || dragEnd.date !== date) return false;
    const min = Math.min(dragStart.slotIdx, dragEnd.slotIdx);
    const max = Math.max(dragStart.slotIdx, dragEnd.slotIdx);
    return slotIdx >= min && slotIdx <= max;
  };

  const handleMouseUp = (date: string, slotIdx: number) => {
    if (dragStart && dragStart.date === date) {
      const min = Math.min(dragStart.slotIdx, slotIdx);
      const max = Math.max(dragStart.slotIdx, slotIdx);
      if (max > min) {
        onBulkSet(date, min, max, dragTag);
      }
    }
    setDragStart(null);
    setDragEnd(null);
    setDragTag(null);
  };

  const dateLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const startDate = week.days[0];
  const endDate = week.days[6];

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex-shrink-0" style={{ width: 220 }}>
      {/* Header */}
      <div className="bg-accent/50 px-2 py-1.5 border-b border-border">
        <div className="text-[10px] font-semibold text-primary">Неделя {week.weekNum}</div>
        <div className="text-[9px] text-muted-foreground">
          {format(startDate, "d MMM", { locale: ru })} – {format(endDate, "d MMM yyyy", { locale: ru })}
        </div>
      </div>

      {/* Days columns */}
      <div className="flex">
        {/* Time column */}
        <div className="flex-shrink-0" style={{ width: 32 }}>
          <div className="h-7 border-b border-border" /> {/* day header spacer */}
          {TIME_SLOTS.map((slot, i) => (
            <div
              key={i}
              className="flex items-center justify-end pr-1"
              style={{ height: 20 }}
            >
              {slot.start.endsWith(":00") && (
                <span className="text-[8px] text-muted-foreground leading-none">{slot.start}</span>
              )}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {week.days.map((day, dayIdx) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isWeekend = dayIdx >= 5;
          return (
            <div
              key={dayIdx}
              className="flex-1 border-l border-border"
              onMouseLeave={() => { if (isDragging) setDragEnd(null); }}
            >
              {/* Day header */}
              <div
                className={`h-7 flex flex-col items-center justify-center border-b border-border ${isWeekend ? "bg-muted/30" : ""}`}
              >
                <span className={`text-[9px] font-medium ${isWeekend ? "text-primary/70" : "text-muted-foreground"}`}>
                  {dateLabels[dayIdx]}
                </span>
                <span className="text-[8px] text-muted-foreground/60">{format(day, "d")}</span>
              </div>

              {/* Slots */}
              {TIME_SLOTS.map((slot, slotIdx) => {
                const key = `${dateStr}_${slot.start}`;
                const entry = entries[key];
                const inRange = isInDragRange(dateStr, slotIdx);
                const isHour = slot.start.endsWith(":00");

                return (
                  <div
                    key={slotIdx}
                    style={{ height: 20 }}
                    className={`relative ${isHour ? "border-t border-border/40" : ""} ${inRange ? "bg-primary/20" : ""}`}
                    onMouseDown={() => {
                      const tag = tags.find(t => t.id === entry?.tagId) ?? null;
                      setDragStart({ date: dateStr, slotIdx });
                      setDragEnd({ date: dateStr, slotIdx });
                      setDragTag(tag);
                    }}
                    onMouseEnter={() => {
                      if (isDragging && dragStart?.date === dateStr) {
                        setDragEnd({ date: dateStr, slotIdx });
                      }
                    }}
                    onMouseUp={() => handleMouseUp(dateStr, slotIdx)}
                  >
                    <TagSelector
                      value={entry}
                      tags={tags}
                      onSelect={tag => onSetEntry(dateStr, slot, tag)}
                      onClear={() => onSetEntry(dateStr, slot, null)}
                      onAddTag={onAddTag}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrackingPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Load tags
  const { data: tagList = [] } = trpc.tags.list.useQuery(undefined, { enabled: !!user });

  // We load entries for the visible range (full year 2026)
  const { data: rawEntries = [] } = trpc.entries.getByRange.useQuery(
    { startDate: "2025-12-29", endDate: "2026-12-31" },
    { enabled: !!user }
  );

  // Build entry map: "YYYY-MM-DD_HH:MM" → entry
  const entryMap: EntryMap = {};
  for (const e of rawEntries) {
    const key = `${e.entryDate}_${e.startTime}`;
    entryMap[key] = { tagId: e.tagId ?? null, tagName: e.tagName ?? null, comment: e.comment ?? null };
  }

  const upsertMutation = trpc.entries.upsert.useMutation({
    onSuccess: () => utils.entries.getByRange.invalidate(),
    onError: () => toast.error("Ошибка сохранения"),
  });

  const bulkMutation = trpc.entries.bulkUpsert.useMutation({
    onSuccess: () => utils.entries.getByRange.invalidate(),
    onError: () => toast.error("Ошибка сохранения"),
  });

  const createTagMutation = trpc.tags.create.useMutation({
    onSuccess: () => utils.tags.list.invalidate(),
  });

  const handleSetEntry = useCallback(
    (date: string, slot: { start: string; end: string }, tag: TagItem | null) => {
      upsertMutation.mutate({
        entryDate: date,
        startTime: slot.start,
        endTime: slot.end,
        tagId: tag?.id ?? null,
        tagName: tag?.name ?? null,
      });
    },
    [upsertMutation]
  );

  const handleBulkSet = useCallback(
    (date: string, startIdx: number, endIdx: number, tag: TagItem | null) => {
      const entries = [];
      for (let i = startIdx; i <= endIdx; i++) {
        const slot = TIME_SLOTS[i];
        entries.push({
          entryDate: date,
          startTime: slot.start,
          endTime: slot.end,
          tagId: tag?.id ?? null,
          tagName: tag?.name ?? null,
        });
      }
      bulkMutation.mutate(entries);
      toast.success(`Заполнено ${entries.length} блоков`);
    },
    [bulkMutation]
  );

  const handleAddTag = useCallback(
    (name: string) => {
      const colors = ["#6366f1","#f59e0b","#10b981","#ef4444","#f97316","#8b5cf6","#06b6d4","#84cc16","#ec4899","#3b82f6","#14b8a6"];
      const color = colors[Math.floor(Math.random() * colors.length)];
      createTagMutation.mutate({ name, color });
      toast.success(`Тег «${name}» создан`);
    },
    [createTagMutation]
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Учёт времени 2026</h1>
            <p className="text-xs text-muted-foreground mt-0.5">53 недели · 96 блоков в день · автосохранение</p>
          </div>
          <div className="flex flex-wrap gap-1.5 max-w-lg">
            {tagList.slice(0, 8).map(tag => (
              <Badge
                key={tag.id}
                variant="outline"
                className="text-[10px] px-2 py-0.5 border"
                style={{ borderColor: tag.color + "66", color: tag.color, backgroundColor: tag.color + "22" }}
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Week grid */}
      <div
        className="flex-1 overflow-auto p-4"
        style={{ userSelect: "none" }}
      >
        <div className="flex flex-wrap gap-3">
          {WEEKS.map(week => (
            <WeekTable
              key={week.weekNum}
              week={week}
              tags={tagList}
              entries={entryMap}
              onSetEntry={handleSetEntry}
              onBulkSet={handleBulkSet}
              onAddTag={handleAddTag}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
