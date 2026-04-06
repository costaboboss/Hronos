import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { format, addDays, addWeeks, subDays, startOfWeek, getISOWeek } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { getEfficiencyColor, getEfficiencyTextClass } from "@/lib/efficiency";
import { blocksToHours, blocksToPercent, useWorkNorm } from "@/lib/workNorm";
import { toast } from "sonner";
import { Plus, Copy, Clipboard, ChevronLeft, ChevronRight, Trash2, FileInput } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

// ─── Constants ────────────────────────────────────────────────────────────────

const YEAR = 2026;
const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#f97316","#8b5cf6","#06b6d4","#84cc16","#ec4899","#3b82f6","#14b8a6","#f43f5e"];

function getTimeSlots(): { start: string; end: string; label: string }[] {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const start = `${hh}:${mm}`;
      const endM = m + 15;
      const endH = endM >= 60 ? h + 1 : h;
      const end = `${String(endH % 24).padStart(2, "0")}:${String(endM % 60).padStart(2, "0")}`;
      slots.push({ start, end, label: start });
    }
  }
  return slots;
}

const TIME_SLOTS = getTimeSlots();

function getMondayOfWeek(year: number, weekNum: number): Date {
  const jan4 = new Date(year, 0, 4);
  const jan4dow = (jan4.getDay() + 6) % 7;
  const week1Mon = addDays(jan4, -jan4dow);
  return addDays(week1Mon, (weekNum - 1) * 7);
}

function getWeekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// ─── Types ───────────────────────────────────────────────────────────────────

type TagItem = { id: number; name: string; color: string; isDefault: boolean; isWork?: boolean };
type EntryMap = Record<string, { tagId: number | null; tagName: string | null }>;
type ClipEntry = { offset: number; tag: TagItem | null };


// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrackingPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { workNormBlocks, setWorkNormBlocks } = useWorkNorm();

  const [weekMonday, setWeekMonday] = useState<Date>(() => {
    const today = new Date();
    if (today.getFullYear() === YEAR) {
      return startOfWeek(today, { weekStartsOn: 1 });
    }
    return getMondayOfWeek(YEAR, 1);
  });

  // Drag-select state (2D: can span multiple days and rows)
  const [dragState, setDragState] = useState<{
    startDay: number; endDay: number; startSlot: number; endSlot: number; active: boolean;
  } | null>(null);
  const [fillDownState, setFillDownState] = useState<{
    dayIdx: number;
    dateStr: string;
    startSlot: number;
    endSlot: number;
    tag: TagItem;
    active: boolean;
  } | null>(null);

  // Unified floating tag menu (single-cell click OR multi-select drag)
  const [multiMenuOpen, setMultiMenuOpen] = useState(false);
  const [multiMenuPos, setMultiMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [newTagForMulti, setNewTagForMulti] = useState("");
  // Single-cell context: which cell was clicked (for Continue button)
  const [menuCell, setMenuCell] = useState<{ dayIdx: number; slotIdx: number; dateStr: string } | null>(null);
  const [activeCell, setActiveCell] = useState<{ dayIdx: number; slotIdx: number } | null>(null);

  // Internal clipboard (copy within app)
  const [clipboard, setClipboard] = useState<ClipEntry[] | null>(null);

  // Selection for copy/delete (after drag ends) — 2D
  const [selection, setSelection] = useState<{ startDay: number; endDay: number; start: number; end: number } | null>(null);

  // Paste target: single cell where paste will start
  // Using a single ref that is ALWAYS updated synchronously on click
  const pasteTargetRef = useRef<{ dayIdx: number; slotIdx: number } | null>(null);
  const [pasteTargetDisplay, setPasteTargetDisplay] = useState<{ dayIdx: number; slotIdx: number } | null>(null);

  // Excel import dialog
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const importTargetRef = useRef<{ dayIdx: number; slotIdx: number } | null>(null);
  const [weekImportDialogOpen, setWeekImportDialogOpen] = useState(false);
  const [weekImportText, setWeekImportText] = useState("");

  // Stable refs for keyboard handler
  const clipboardRef = useRef<ClipEntry[] | null>(null);
  const selectionRef = useRef<{ startDay: number; endDay: number; start: number; end: number } | null>(null);
  const daysRef = useRef<Date[]>([]);
  const entryMapRef = useRef<EntryMap>({});
  const tagListRef = useRef<TagItem[]>([]);
  const fillDownRef = useRef<{
    dayIdx: number;
    dateStr: string;
    startSlot: number;
    endSlot: number;
    tag: TagItem;
    active: boolean;
  } | null>(null);

  const days = useMemo(() => getWeekDays(weekMonday), [weekMonday]);
  const weekNum = getISOWeek(weekMonday);

  useEffect(() => { daysRef.current = days; }, [days]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);
  useEffect(() => { selectionRef.current = selection; }, [selection]);
  useEffect(() => { fillDownRef.current = fillDownState; }, [fillDownState]);

  const startDate = format(weekMonday, "yyyy-MM-dd");
  const endDate = format(days[6], "yyyy-MM-dd");

  const { data: tagList = [] } = trpc.tags.list.useQuery(undefined, { enabled: !!user });

  const { data: rawEntries = [], isLoading } = trpc.entries.getByRange.useQuery(
    { startDate, endDate },
    { enabled: !!user }
  );

  // Always load today's entries for the work blocks panel (independent of selected week)
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayEntries = [] } = trpc.entries.getByRange.useQuery(
    { startDate: todayStr, endDate: todayStr },
    { enabled: !!user }
  );

  // Load last 7 days for efficiency stats (always relative to today)
  // Use useMemo so dates are stable references (won't cause infinite re-renders)
  const last7Start = useMemo(() => format(subDays(new Date(), 6), "yyyy-MM-dd"), []);
  const currentWeekMonStr = useMemo(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"), []);
  const { data: last7Entries = [] } = trpc.entries.getByRange.useQuery(
    { startDate: last7Start, endDate: todayStr },
    { enabled: !!user }
  );
  // Separate query for current week (Mon–today), which may extend beyond last 7 days
  const { data: thisWeekEntries = [] } = trpc.entries.getByRange.useQuery(
    { startDate: currentWeekMonStr, endDate: todayStr },
    { enabled: !!user }
  );

  const entryMap = useMemo<EntryMap>(() => {
    const map: EntryMap = {};
    for (const e of rawEntries) {
      map[`${e.entryDate}_${e.startTime}`] = { tagId: e.tagId ?? null, tagName: e.tagName ?? null };
    }
    entryMapRef.current = map;
    return map;
  }, [rawEntries]);

  useEffect(() => { tagListRef.current = tagList; }, [tagList]);

  const upsertMutation = trpc.entries.upsert.useMutation({
    onMutate: async (entry) => {
      // Cancel in-flight refetches so they don't overwrite our optimistic update
      await utils.entries.getByRange.cancel({ startDate, endDate });
      // Snapshot previous data for rollback
      const prev = utils.entries.getByRange.getData({ startDate, endDate });
      // Optimistically update the cache — replace or add the entry
      utils.entries.getByRange.setData({ startDate, endDate }, (old) => {
        if (!old) return old;
        const existing = old.find(e => e.entryDate === entry.entryDate && e.startTime === entry.startTime);
        if (existing) {
          return old.map(e =>
            e.entryDate === entry.entryDate && e.startTime === entry.startTime
              ? { ...e, tagId: entry.tagId ?? null, tagName: entry.tagName ?? null }
              : e
          );
        }
        // New entry — add a placeholder row
        return [...old, {
          id: -1, userId: -1,
          entryDate: entry.entryDate,
          startTime: entry.startTime,
          endTime: entry.endTime ?? entry.startTime,
          tagId: entry.tagId ?? null,
          tagName: entry.tagName ?? null,
          comment: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }];
      });
      return { prev };
    },
    onError: (_err, _entry, ctx) => {
      // Rollback on error
      if (ctx?.prev !== undefined) {
        utils.entries.getByRange.setData({ startDate, endDate }, ctx.prev);
      }
      toast.error("Ошибка сохранения");
    },
    onSettled: () => {
      // Sync with server after mutation completes
      utils.entries.getByRange.invalidate({ startDate, endDate });
    },
  });

  const bulkMutation = trpc.entries.bulkUpsert.useMutation({
    onMutate: async (entries) => {
      await utils.entries.getByRange.cancel({ startDate, endDate });
      const prev = utils.entries.getByRange.getData({ startDate, endDate });
      utils.entries.getByRange.setData({ startDate, endDate }, (old) => {
        if (!old) return old;
        let updated = [...old];
        for (const entry of entries) {
          const idx = updated.findIndex(e => e.entryDate === entry.entryDate && e.startTime === entry.startTime);
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], tagId: entry.tagId ?? null, tagName: entry.tagName ?? null };
          } else {
            updated.push({
              id: -1, userId: -1,
              entryDate: entry.entryDate,
              startTime: entry.startTime,
              endTime: entry.endTime ?? entry.startTime,
              tagId: entry.tagId ?? null,
              tagName: entry.tagName ?? null,
              comment: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }
        return updated;
      });
      return { prev };
    },
    onError: (_err, _entries, ctx) => {
      if (ctx?.prev !== undefined) {
        utils.entries.getByRange.setData({ startDate, endDate }, ctx.prev);
      }
      toast.error("Ошибка сохранения");
    },
    onSettled: () => {
      utils.entries.getByRange.invalidate({ startDate, endDate });
    },
  });

  const bulkClearMutation = trpc.entries.bulkClear.useMutation({
    onMutate: async (cells) => {
      // Optimistic: remove cleared cells from all cached entry queries immediately
      await utils.entries.getByRange.cancel();
      const cellSet = new Set(cells.map(c => `${c.entryDate}_${c.startTime}`));
      // Update all cached queries by filtering out cleared entries
      utils.entries.getByRange.setData(
        { startDate, endDate },
        (old) => old ? old.filter(e => !cellSet.has(`${e.entryDate}_${e.startTime}`)) : old
      );
      return { cellSet };
    },
    onError: (_err, _cells, ctx) => {
      // Rollback: invalidate to restore from server
      utils.entries.getByRange.invalidate();
      toast.error("Ошибка удаления");
    },
    onSettled: () => {
      utils.entries.getByRange.invalidate();
    },
  });

  const createTagMutation = trpc.tags.create.useMutation({
    onSuccess: () => utils.tags.list.invalidate(),
  });

  const createManyTagsMutation = trpc.tags.createMany.useMutation({
    onSuccess: () => utils.tags.list.invalidate(),
  });

  const handleSetEntry = useCallback((dateStr: string, slotIdx: number, tag: TagItem | null) => {
    const slot = TIME_SLOTS[slotIdx];
    upsertMutation.mutate({
      entryDate: dateStr,
      startTime: slot.start,
      endTime: slot.end,
      tagId: tag?.id ?? null,
      tagName: tag?.name ?? null,
    });
  }, [upsertMutation]);

  const handleBulkSet = useCallback((dateStr: string, startIdx: number, endIdx: number, tag: TagItem | null) => {
    const entries = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const slot = TIME_SLOTS[i];
      entries.push({ entryDate: dateStr, startTime: slot.start, endTime: slot.end, tagId: tag?.id ?? null, tagName: tag?.name ?? null });
    }
    bulkMutation.mutate(entries);
    toast.success(`Заполнено ${entries.length} блоков`);
  }, [bulkMutation]);

  const handleAddTag = useCallback((name: string) => {
    createTagMutation.mutate({ name, color: COLORS[Math.floor(Math.random() * COLORS.length)] });
    toast.success(`Тег «${name}» создан`);
  }, [createTagMutation]);

  const handleCopy = useCallback(() => {
    const sel = selectionRef.current;
    if (!sel || sel.startDay !== sel.endDay) return;
    const dateStr = format(daysRef.current[sel.startDay], "yyyy-MM-dd");
    const copied: ClipEntry[] = [];
    for (let i = sel.start; i <= sel.end; i++) {
      const key = `${dateStr}_${TIME_SLOTS[i].start}`;
      const e = entryMapRef.current[key];
      copied.push({ offset: i - sel.start, tag: e?.tagId ? (tagListRef.current.find(t => t.id === e.tagId) ?? null) : null });
    }
    setClipboard(copied);
    clipboardRef.current = copied;
    toast.success(`Скопировано ${copied.length} блоков`);
  }, []);

  const handleCopyWeek = useCallback(async () => {
    const weekMatrix = TIME_SLOTS.map((slot) =>
      daysRef.current.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const key = `${dateStr}_${slot.start}`;
        const entry = entryMapRef.current[key];
        return entry?.tagName ?? "";
      })
    );

    const text = weekMatrix.map((row) => row.join("\t")).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Скопирована вся неделя: 672 ячейки");
    } catch {
      toast.error("Не удалось скопировать неделю в буфер");
    }
  }, []);

  const processWeekImportText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return false;

    const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) return false;

    const tagListCurrent = tagListRef.current;
    const daysCurrent = daysRef.current;
    const tagByName: Record<string, TagItem> = {};
    for (const t of tagListCurrent) tagByName[t.name.toLowerCase()] = t;

    const parsedCells: Array<{
      dayIdx: number;
      slotIdx: number;
      rawName: string;
      slot: { start: string; end: string };
    }> = [];
    const unknownNamesSet = new Set<string>();

    lines.forEach((line, rowIdx) => {
      if (rowIdx >= TIME_SLOTS.length * 7) return;

      const parts = line.split("\t");
      const values =
        parts.length >= 2 && /^\d{1,2}:\d{2}$/.test(parts[0].trim()) ? parts.slice(1) : parts;
      const rawName = (values[0] ?? "").trim();
      const dayIdx = Math.floor(rowIdx / TIME_SLOTS.length);
      const slotIdx = rowIdx % TIME_SLOTS.length;

      if (dayIdx >= 7) return;

      parsedCells.push({
        dayIdx,
        slotIdx,
        rawName,
        slot: TIME_SLOTS[slotIdx],
      });
      if (rawName && !tagByName[rawName.toLowerCase()]) {
        unknownNamesSet.add(rawName);
      }
    });

    const doUpsert = (tagMap: Record<string, TagItem>) => {
      const entries = parsedCells.map((cell) => {
        const dateStr = format(daysCurrent[cell.dayIdx], "yyyy-MM-dd");
        const matched = tagMap[cell.rawName.toLowerCase()];
        return {
          entryDate: dateStr,
          startTime: cell.slot.start,
          endTime: cell.slot.end,
          tagId: matched?.id ?? null,
          tagName: matched?.name ?? (cell.rawName || null),
        };
      });

      bulkMutation.mutate(entries);
      const newCount = unknownNamesSet.size;
      toast.success(
        newCount > 0
          ? `Импортирована вся неделя: ${entries.length} ячеек. Создано тегов: ${newCount}`
          : `Импортирована вся неделя: ${entries.length} ячеек`
      );
      setWeekImportDialogOpen(false);
      setWeekImportText("");
    };

    if (unknownNamesSet.size > 0) {
      const toCreate = Array.from(unknownNamesSet).map((name, i) => ({
        name,
        color: COLORS[i % COLORS.length],
      }));
      createManyTagsMutation.mutate(toCreate, {
        onSuccess: (created) => {
          const updatedMap = { ...tagByName };
          for (const t of created) updatedMap[t.name.toLowerCase()] = t as TagItem;
          doUpsert(updatedMap);
        },
        onError: () => doUpsert(tagByName),
      });
    } else {
      doUpsert(tagByName);
    }

    return true;
  }, [bulkMutation, createManyTagsMutation]);

  // Process Excel text and paste into target
  const processExcelText = useCallback((text: string, target: { dayIdx: number; slotIdx: number }) => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const lines = trimmed.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return false;

    const tagListCurrent = tagListRef.current;
    const daysCurrent = daysRef.current;
    const dateStr = format(daysCurrent[target.dayIdx], "yyyy-MM-dd");
    const startIdx = target.slotIdx;
    const tagByName: Record<string, TagItem> = {};
    for (const t of tagListCurrent) tagByName[t.name.toLowerCase()] = t;

    type ParsedRow = { idx: number; rawName: string; slot: { start: string; end: string } };
    const parsedRows: ParsedRow[] = [];
    const unknownNamesSet = new Set<string>();

    lines.forEach((line, i) => {
      const idx = startIdx + i;
      if (idx >= TIME_SLOTS.length) return;
      const parts = line.split("\t");
      // Support both "time\ttag" and just "tag" formats
      const rawName = (parts.length >= 2 ? parts[parts.length - 1] : parts[0]).trim();
      parsedRows.push({ idx, rawName, slot: TIME_SLOTS[idx] });
      if (rawName && !tagByName[rawName.toLowerCase()]) unknownNamesSet.add(rawName);
    });

    const doUpsert = (tagMap: Record<string, TagItem>) => {
      const entries = parsedRows.map(row => {
        const matched = tagMap[row.rawName.toLowerCase()];
        return {
          entryDate: dateStr,
          startTime: row.slot.start,
          endTime: row.slot.end,
          tagId: matched?.id ?? null,
          tagName: matched?.name ?? (row.rawName || null),
        };
      });
      bulkMutation.mutate(entries);
      const newCount = unknownNamesSet.size;
      toast.success(newCount > 0
        ? `Вставлено ${entries.length} блоков. Создано тегов: ${newCount}`
        : `Вставлено ${entries.length} блоков`);
      pasteTargetRef.current = null;
      setPasteTargetDisplay(null);
    };

    if (unknownNamesSet.size > 0) {
      const toCreate = Array.from(unknownNamesSet).map((name, i) => ({ name, color: COLORS[i % COLORS.length] }));
      createManyTagsMutation.mutate(toCreate, {
        onSuccess: (created) => {
          const updatedMap = { ...tagByName };
          for (const t of created) updatedMap[t.name.toLowerCase()] = t as TagItem;
          doUpsert(updatedMap);
        },
        onError: () => doUpsert(tagByName),
      });
    } else {
      doUpsert(tagByName);
    }
    return true;
  }, [bulkMutation, createManyTagsMutation]);

  // Paste internal clipboard at target
  const pasteInternal = useCallback((target: { dayIdx: number; slotIdx: number }) => {
    const clip = clipboardRef.current;
    if (!clip) return;
    const dateStr = format(daysRef.current[target.dayIdx], "yyyy-MM-dd");
    const startIdx = target.slotIdx;
    const entries = clip
      .filter(c => startIdx + c.offset < TIME_SLOTS.length)
      .map(c => {
        const idx = startIdx + c.offset;
        const slot = TIME_SLOTS[idx];
        return { entryDate: dateStr, startTime: slot.start, endTime: slot.end, tagId: c.tag?.id ?? null, tagName: c.tag?.name ?? null };
      });
    bulkMutation.mutate(entries);
    toast.success(`Вставлено ${entries.length} блоков`);
    pasteTargetRef.current = null;
    setPasteTargetDisplay(null);
  }, [bulkMutation]);

  // Open import dialog for a target cell
  const openImportDialog = useCallback((target: { dayIdx: number; slotIdx: number }) => {
    importTargetRef.current = target;
    setImportText("");
    setActiveCell(target);
    setImportDialogOpen(true);
  }, []);

  // Handle import dialog confirm
  const handleImportConfirm = useCallback(() => {
    const target = importTargetRef.current;
    if (!target || !importText.trim()) return;
    processExcelText(importText, target);
    setImportDialogOpen(false);
    setImportText("");
    setActiveCell(null);
  }, [importText, processExcelText]);

  const handleWeekImportConfirm = useCallback(() => {
    if (!weekImportText.trim()) return;
    processWeekImportText(weekImportText);
  }, [processWeekImportText, weekImportText]);

  // Week navigation
  const prevWeek = () => setWeekMonday(d => addWeeks(d, -1));
  const nextWeek = () => setWeekMonday(d => addWeeks(d, 1));
  const goToday = () => setWeekMonday(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const goToWeek = (wn: number) => setWeekMonday(getMondayOfWeek(YEAR, wn));

  const allWeeks = useMemo(() => {
    const list: { weekNum: number; label: string }[] = [];
    for (let w = 1; w <= 53; w++) {
      const mon = getMondayOfWeek(YEAR, w);
      const sun = addDays(mon, 6);
      list.push({ weekNum: w, label: `Нед. ${w} · ${format(mon, "d MMM", { locale: ru })} – ${format(sun, "d MMM", { locale: ru })}` });
    }
    return list;
  }, []);

  // Track whether a drag occurred (to distinguish click from drag)
  const wasDragRef = useRef(false);

  // Drag helpers (2D: rows can span multiple days)
  const onSlotMouseDown = (dayIdx: number, slotIdx: number) => {
    wasDragRef.current = false;
    // Close any open menu and clear single-cell context on new mousedown
    setMultiMenuOpen(false);
    setMultiMenuPos(null);
    setMenuCell(null);
    setActiveCell(null);
    setDragState({ startDay: dayIdx, endDay: dayIdx, startSlot: slotIdx, endSlot: slotIdx, active: true });
    setSelection(null);
  };

  const onSlotMouseEnter = (dayIdx: number, slotIdx: number) => {
    if (fillDownState?.active) {
      if (dayIdx === fillDownState.dayIdx) {
        wasDragRef.current = true;
        setFillDownState((s) =>
          s ? { ...s, endSlot: Math.max(slotIdx, s.startSlot) } : s
        );
      }
      return;
    }
    if (dragState?.active) {
      wasDragRef.current = true; // moved to another cell = drag
      setDragState(s => s ? { ...s, endDay: dayIdx, endSlot: slotIdx } : s);
    }
  };

  const onSlotMouseUp = (dayIdx: number, slotIdx: number, e?: React.MouseEvent) => {
    if (fillDownState?.active) {
      const endSlot = Math.max(slotIdx, fillDownState.startSlot);
      if (endSlot > fillDownState.startSlot) {
        const startFill = fillDownState.startSlot + 1;
        handleBulkSet(fillDownState.dateStr, startFill, endSlot, fillDownState.tag);
        const newSel = {
          startDay: fillDownState.dayIdx,
          endDay: fillDownState.dayIdx,
          start: fillDownState.startSlot,
          end: endSlot,
        };
        setSelection(newSel);
        selectionRef.current = newSel;
      }
      setFillDownState(null);
      return;
    }
    if (!dragState?.active) return;
    const minDay = Math.min(dragState.startDay, dayIdx);
    const maxDay = Math.max(dragState.startDay, dayIdx);
    const minSlot = Math.min(dragState.startSlot, slotIdx);
    const maxSlot = Math.max(dragState.startSlot, slotIdx);
    const isMulti = maxSlot > minSlot || maxDay > minDay;
    if (isMulti) {
      const newSel = { startDay: minDay, endDay: maxDay, start: minSlot, end: maxSlot };
      setSelection(newSel);
      selectionRef.current = newSel;
      setPasteTargetDisplay(null);
      pasteTargetRef.current = null;
      // Only show tag menu for single-day selections (multi-day: use Delete key)
      if (e && minDay === maxDay) {
        setMultiMenuPos({ x: e.clientX, y: e.clientY });
        setMultiMenuOpen(true);
      }
    }
    setDragState(null);
  };

  const startFillDown = useCallback(
    (
      dayIdx: number,
      slotIdx: number,
      dateStr: string,
      tag: TagItem,
      e: React.MouseEvent
    ) => {
      e.preventDefault();
      e.stopPropagation();
      wasDragRef.current = true;
      setMultiMenuOpen(false);
      setMultiMenuPos(null);
      setMenuCell(null);
      setFillDownState({
        dayIdx,
        dateStr,
        startSlot: slotIdx,
        endSlot: slotIdx,
        tag,
        active: true,
      });
    },
    []
  );

  // Set paste target — called synchronously on click
  const setPasteTarget = useCallback((dayIdx: number, slotIdx: number) => {
    pasteTargetRef.current = { dayIdx, slotIdx };
    setPasteTargetDisplay({ dayIdx, slotIdx });
  }, []);

  const handleMultiTagSelect = useCallback((tag: TagItem | null) => {
    const sel = selectionRef.current;
    if (!sel) return;
    const entries = [];
    for (let d = sel.startDay; d <= sel.endDay; d++) {
      const dateStr = format(daysRef.current[d], "yyyy-MM-dd");
      for (let i = sel.start; i <= sel.end; i++) {
        const slot = TIME_SLOTS[i];
        entries.push({ entryDate: dateStr, startTime: slot.start, endTime: slot.end, tagId: tag?.id ?? null, tagName: tag?.name ?? null });
      }
    }
    bulkMutation.mutate(entries);
    toast.success(tag ? `«${tag.name}» → ${entries.length} блоков` : `Очищено ${entries.length} блоков`);
    setMultiMenuOpen(false);
    setMultiMenuPos(null);
    setMenuCell(null);
    setActiveCell(null);
  }, [bulkMutation]);

  const handleMultiAddTag = useCallback((name: string) => {
    createTagMutation.mutate({ name, color: COLORS[Math.floor(Math.random() * COLORS.length)] }, {
      onSuccess: (newTag) => {
        if (newTag) handleMultiTagSelect(newTag as TagItem);
      }
    });
  }, [createTagMutation, handleMultiTagSelect]);

  // "Continue" button: copy current cell's tag to next empty block below
  const handleContinue = useCallback(() => {
    const cell = menuCell;
    if (!cell) return;
    const map = entryMapRef.current;
    const currentEntry = map[`${cell.dateStr}_${TIME_SLOTS[cell.slotIdx].start}`];
    if (!currentEntry?.tagId) return;
    const tag = tagListRef.current.find(t => t.id === currentEntry.tagId);
    if (!tag) return;
    // Find next empty slot in same day
    let nextIdx = cell.slotIdx + 1;
    while (nextIdx < TIME_SLOTS.length) {
      const key = `${cell.dateStr}_${TIME_SLOTS[nextIdx].start}`;
      if (!map[key]?.tagId) break;
      nextIdx++;
    }
    if (nextIdx >= TIME_SLOTS.length) { toast.info("Нет пустых блоков ниже"); return; }
    const slot = TIME_SLOTS[nextIdx];
    upsertMutation.mutate({ entryDate: cell.dateStr, startTime: slot.start, endTime: slot.end, tagId: tag.id, tagName: tag.name });
    setMultiMenuOpen(false);
    setMultiMenuPos(null);
    setMenuCell(null);
    setActiveCell(null);
  }, [menuCell, upsertMutation]);

  // Open unified tag menu on single cell click
  const handleSingleCellClick = useCallback((dayIdx: number, slotIdx: number, dateStr: string, e: React.MouseEvent) => {
    // Set single-cell selection so handleMultiTagSelect works
    const newSel = { startDay: dayIdx, endDay: dayIdx, start: slotIdx, end: slotIdx };
    setSelection(newSel);
    selectionRef.current = newSel;
    setMenuCell({ dayIdx, slotIdx, dateStr });
    setActiveCell({ dayIdx, slotIdx });
    setMultiMenuPos({ x: e.clientX, y: e.clientY });
    setMultiMenuOpen(true);
  }, []);

  const isDragHighlighted = (dayIdx: number, slotIdx: number) => {
    if (!dragState?.active) return false;
    const minDay = Math.min(dragState.startDay, dragState.endDay);
    const maxDay = Math.max(dragState.startDay, dragState.endDay);
    if (dayIdx < minDay || dayIdx > maxDay) return false;
    const minSlot = Math.min(dragState.startSlot, dragState.endSlot);
    const maxSlot = Math.max(dragState.startSlot, dragState.endSlot);
    return slotIdx >= minSlot && slotIdx <= maxSlot;
  };

  const isSelected = (dayIdx: number, slotIdx: number) => {
    if (!selection) return false;
    if (dayIdx < selection.startDay || dayIdx > selection.endDay) return false;
    return slotIdx >= selection.start && slotIdx <= selection.end;
  };

  const isPastePreview = (dayIdx: number, slotIdx: number) => {
    const pt = pasteTargetDisplay;
    if (!pt || !clipboard) return false;
    return pt.dayIdx === dayIdx && slotIdx >= pt.slotIdx && slotIdx < pt.slotIdx + clipboard.length;
  };

  // Row height state
  const [rowHeight, setRowHeight] = useState(22);
  const ROW_H = rowHeight;

  // Tag stats (full list for sidebar)
  const tagStats = useMemo(() => {
    const counts: Record<string, { name: string; color: string; count: number }> = {};
    for (const e of rawEntries) {
      if (!e.tagName) continue;
      if (!counts[e.tagName]) counts[e.tagName] = { name: e.tagName, color: tagList.find(t => t.name === e.tagName)?.color ?? "#6b7280", count: 0 };
      counts[e.tagName].count++;
    }
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [rawEntries, tagList]);

  const totalBlocks = tagStats.reduce((s, t) => s + t.count, 0);

  // Top-7 most-used tags this week (for highlighting in the cell menu)
  const top7TagIds = useMemo(() => {
    return new Set(
      tagStats
        .slice(0, 7)
        .map(s => tagList.find(t => t.name === s.name)?.id)
        .filter((id): id is number => id !== undefined)
    );
  }, [tagStats, tagList]);

  // Today's work blocks stats (uses dedicated todayEntries query, independent of selected week)
  const workBlocksToday = useMemo(() => {
    const workTagIds = new Set((tagList as TagItem[]).filter(t => t.isWork).map(t => t.id));
    const workTagNames = new Set((tagList as TagItem[]).filter(t => t.isWork).map(t => t.name.toLowerCase()));
    const counts: Record<string, { name: string; color: string; count: number }> = {};
    let total = 0;
    for (const e of todayEntries) {
      const isWork = (e.tagId && workTagIds.has(e.tagId)) || (e.tagName && workTagNames.has(e.tagName.toLowerCase()));
      if (!isWork || !e.tagName) continue;
      if (!counts[e.tagName]) counts[e.tagName] = { name: e.tagName, color: (tagList as TagItem[]).find(t => t.name === e.tagName)?.color ?? "#f59e0b", count: 0 };
      counts[e.tagName].count++;
      total++;
    }
    return { tags: Object.values(counts).sort((a, b) => b.count - a.count), total };
  }, [todayEntries, tagList]);

  const workPct = blocksToPercent(workBlocksToday.total, workNormBlocks);

  // Efficiency per day for last 7 days
  const DAY_NAMES_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const efficiencyLast7 = useMemo(() => {
    const workTagIds = new Set((tagList as TagItem[]).filter(t => t.isWork).map(t => t.id));
    const workTagNames = new Set((tagList as TagItem[]).filter(t => t.isWork).map(t => t.name.toLowerCase()));
    // Build per-day block counts from last7Entries
    const dayCounts: Record<string, number> = {};
    for (const e of last7Entries) {
      const isWork = (e.tagId && workTagIds.has(e.tagId)) || (e.tagName && workTagNames.has(e.tagName.toLowerCase()));
      if (!isWork) continue;
      dayCounts[e.entryDate] = (dayCounts[e.entryDate] ?? 0) + 1;
    }
    // Build array of last 7 days (oldest → newest)
    const days7: { dateStr: string; label: string; pct: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, "yyyy-MM-dd");
      const dayName = DAY_NAMES_SHORT[d.getDay()];
      const dayNum = format(d, "d MMM", { locale: ru });
      const blocks = dayCounts[dateStr] ?? 0;
      const pct = blocksToPercent(blocks, workNormBlocks);
      days7.push({ dateStr, label: `${dayName} ${dayNum}`, pct });
    }
    return days7;
  }, [last7Entries, tagList, workNormBlocks]);

  // Average efficiency: last 7 days
  const avgLast7 = efficiencyLast7.length > 0
    ? Math.round(efficiencyLast7.reduce((s, d) => s + d.pct, 0) / efficiencyLast7.length)
    : 0;

  // Average efficiency: current week (Mon–today) — uses dedicated thisWeekEntries query
  const efficiencyThisWeek = useMemo(() => {
    const workTagIds = new Set((tagList as TagItem[]).filter(t => t.isWork).map(t => t.id));
    const workTagNames = new Set((tagList as TagItem[]).filter(t => t.isWork).map(t => t.name.toLowerCase()));
    const dayCounts: Record<string, number> = {};
    for (const e of thisWeekEntries) {
      const isWork = (e.tagId && workTagIds.has(e.tagId)) || (e.tagName && workTagNames.has(e.tagName.toLowerCase()));
      if (!isWork) continue;
      dayCounts[e.entryDate] = (dayCounts[e.entryDate] ?? 0) + 1;
    }
    const monDate = new Date(currentWeekMonStr + "T00:00:00");
    const daysElapsed = Math.max(1, Math.round((new Date().getTime() - monDate.getTime()) / 86400000) + 1);
    const daysInRange = Math.min(daysElapsed, 7);
    const totalBlocks = Object.values(dayCounts).reduce((s, v) => s + v, 0);
    return blocksToPercent(totalBlocks / daysInRange, workNormBlocks);
  }, [thisWeekEntries, tagList, currentWeekMonStr, workNormBlocks]);

  const selectedWeekEfficiency = useMemo(() => {
    const workTagIds = new Set((tagList as TagItem[]).filter(t => t.isWork).map(t => t.id));
    const workTagNames = new Set((tagList as TagItem[]).filter(t => t.isWork).map(t => t.name.toLowerCase()));
    const dayCounts: Record<string, number> = {};

    for (const e of rawEntries) {
      const isWork = (e.tagId && workTagIds.has(e.tagId)) || (e.tagName && workTagNames.has(e.tagName.toLowerCase()));
      if (!isWork) continue;
      dayCounts[e.entryDate] = (dayCounts[e.entryDate] ?? 0) + 1;
    }

    return days.map((d) => {
      const dateStr = format(d, "yyyy-MM-dd");
      const dayName = DAY_NAMES_SHORT[d.getDay()];
      const dayNum = format(d, "d MMM", { locale: ru });
      const blocks = dayCounts[dateStr] ?? 0;
      const pct = blocksToPercent(blocks, workNormBlocks);

      return {
        dateStr,
        label: `${dayName} ${dayNum}`,
        pct,
      };
    });
  }, [days, rawEntries, tagList, workNormBlocks]);

  const selectedWeekAvg = selectedWeekEfficiency.length > 0
    ? Math.round(selectedWeekEfficiency.reduce((sum, day) => sum + day.pct, 0) / selectedWeekEfficiency.length)
    : 0;

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;

      // Delete / Backspace: clear selected cells
      if (e.key === "Delete" || e.key === "Backspace") {
        const sel = selectionRef.current;
        if (sel) {
          const cells: { entryDate: string; startTime: string }[] = [];
          for (let d = sel.startDay; d <= sel.endDay; d++) {
            const dateStr = format(daysRef.current[d], "yyyy-MM-dd");
            for (let i = sel.start; i <= sel.end; i++) {
              cells.push({ entryDate: dateStr, startTime: TIME_SLOTS[i].start });
            }
          }
          const totalCells = cells.length;
          // Optimistic update: remove from entryMap immediately
          setSelection(null);
          selectionRef.current = null;
          bulkClearMutation.mutate(cells);
          toast.success(`Удалено ${totalCells} блоков`);
          e.preventDefault();
        }
        return;
      }

      // Ctrl+C: copy selection (single-day only)
      if (e.ctrlKey && e.key === "c") {
        const sel = selectionRef.current;
        if (sel && sel.startDay === sel.endDay) {
          const dateStr = format(daysRef.current[sel.startDay], "yyyy-MM-dd");
          const copied: ClipEntry[] = [];
          for (let i = sel.start; i <= sel.end; i++) {
            const key = `${dateStr}_${TIME_SLOTS[i].start}`;
            const entry = entryMapRef.current[key];
            copied.push({ offset: i - sel.start, tag: entry?.tagId ? (tagListRef.current.find(t => t.id === entry.tagId) ?? null) : null });
          }
          setClipboard(copied);
          clipboardRef.current = copied;
          toast.success(`Скопировано ${copied.length} блоков`);
          e.preventDefault();
        }
      }
    };

    // ── Native paste event: fires when user presses Ctrl+V anywhere on the page ──
    const handlePaste = (e: ClipboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;

      const target = pasteTargetRef.current;
      if (!target) {
        toast.info("Кликните на ячейку, затем нажмите Ctrl+V");
        return;
      }

      const text = e.clipboardData?.getData("text") ?? "";
      e.preventDefault();

      // Try Excel/text import first
      if (text.trim()) {
        processExcelText(text, target);
        return;
      }

      // Fall back to internal clipboard
      pasteInternal(target);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste);
    const handleWindowMouseUp = () => {
      const fill = fillDownRef.current;
      if (!fill?.active) return;
      if (fill.endSlot > fill.startSlot) {
        const startFill = fill.startSlot + 1;
        handleBulkSet(fill.dateStr, startFill, fill.endSlot, fill.tag);
        const newSel = {
          startDay: fill.dayIdx,
          endDay: fill.dayIdx,
          start: fill.startSlot,
          end: fill.endSlot,
        };
        setSelection(newSel);
        selectionRef.current = newSel;
      }
      setFillDownState(null);
    };
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [handleBulkSet, pasteInternal, processExcelText]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-border bg-background">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Week nav */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevWeek}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Select value={String(weekNum)} onValueChange={v => goToWeek(Number(v))}>
              <SelectTrigger className="h-7 w-56 text-xs font-semibold bg-transparent border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {allWeeks.map(w => (
                  <SelectItem key={w.weekNum} value={String(w.weekNum)} className="text-xs">
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextWeek}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={goToday}>
              Сегодня
            </Button>
          </div>

          {/* Copy/Paste toolbar */}
          {selection && (() => {
            const rowCount = selection.end - selection.start + 1;
            const dayCount = selection.endDay - selection.startDay + 1;
            const totalCells = rowCount * dayCount;
            const isSingleDay = selection.startDay === selection.endDay;
            return (
              <div className="flex items-center gap-1">
                {isSingleDay && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleCopy}>
                    <Copy className="w-3 h-3" /> Копировать ({rowCount})
                  </Button>
                )}
                <Button
                  variant="outline" size="sm"
                  className="h-7 text-xs gap-1 text-destructive border-destructive/50 hover:bg-destructive/10"
                  onClick={() => {
                    const sel = selectionRef.current;
                    if (!sel) return;
                    const cells: { entryDate: string; startTime: string }[] = [];
                    for (let d = sel.startDay; d <= sel.endDay; d++) {
                      const dateStr = format(days[d], "yyyy-MM-dd");
                      for (let i = sel.start; i <= sel.end; i++) {
                        cells.push({ entryDate: dateStr, startTime: TIME_SLOTS[i].start });
                      }
                    }
                    bulkClearMutation.mutate(cells);
                    toast.success(`Удалено ${cells.length} блоков`);
                    setSelection(null);
                    selectionRef.current = null;
                  }}
                >
                  <Trash2 className="w-3 h-3" /> Удалить ({totalCells})
                </Button>
                <span className="text-xs text-white/50">или Delete</span>
              </div>
            );
          })()}

          {clipboard && (
            <div className="flex items-center gap-1.5 text-xs text-white/80 bg-primary/20 border border-primary/30 px-2 py-1 rounded">
              <Clipboard className="w-3 h-3" />
              {clipboard.length} блоков в буфере
              {pasteTargetDisplay
                ? <span className="text-green-400 font-medium"> · нажмите Ctrl+V или ПКМ → Вставить</span>
                : <span className="text-white/50"> · кликните на ячейку для вставки</span>
              }
              <button className="hover:text-white ml-1" onClick={() => { setClipboard(null); clipboardRef.current = null; setPasteTargetDisplay(null); pasteTargetRef.current = null; }}>×</button>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleCopyWeek}
          >
            <Copy className="w-3 h-3" />
            Копировать неделю (672)
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setWeekImportDialogOpen(true)}
          >
            <FileInput className="w-3 h-3" />
            Импортировать всю неделю
          </Button>

          {/* Import button */}
          <Button
            variant="outline" size="sm" className="h-7 text-xs gap-1 ml-auto"
            onClick={() => {
              const pt = pasteTargetRef.current;
              if (!pt) {
                toast.info("Сначала кликните на ячейку, куда вставить данные");
                return;
              }
              openImportDialog(pt);
            }}
            title="Импорт из Excel (вставьте данные в диалог)"
          >
            <FileInput className="w-3 h-3" /> Импорт из Excel
          </Button>

          {/* Row height control */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Высота строк</span>
            <Slider
              value={[rowHeight]}
              min={14}
              max={48}
              step={2}
              onValueChange={([v]) => setRowHeight(v)}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground w-6 text-right">{rowHeight}</span>
          </div>
        </div>
      </div>

      {/* ── Grid + Sidebar ── */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Загрузка...</div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* ── Main grid ── */}
          <div
            className="flex-1 overflow-auto"
            style={{ userSelect: "none" }}
            onMouseLeave={() => { if (dragState?.active) setDragState(null); }}
            onMouseUp={() => { if (dragState?.active) setDragState(null); }}
          >
          <table className="w-full border-collapse table-fixed" style={{ minWidth: 700 }}>
            <thead className="sticky top-0 z-20 bg-background">
              <tr>
                <th className="border-b border-r border-border bg-background" style={{ width: 52 }} />
                {days.map((day, di) => {
                  const isWeekend = di >= 5;
                  const isToday = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                  return (
                    <th key={di} className={`border-b border-r border-border text-center py-1.5 font-medium ${isWeekend ? "bg-muted/20" : "bg-background"}`}>
                      <div className={`text-xs ${isWeekend ? "text-primary/80" : "text-muted-foreground"}`}>{DAY_LABELS[di]}</div>
                      <div className={`text-sm font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>{format(day, "d")}</div>
                      <div className="text-[10px] text-muted-foreground/60">{format(day, "MMM", { locale: ru })}</div>
                    </th>
                  );
                })}
                {/* Right time column header */}
                <th className="border-b border-l border-border bg-background sticky right-0 z-20" style={{ width: 52 }} />
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((slot, si) => {
                const isHour = slot.start.endsWith(":00");
                return (
                  <tr key={si} className={isHour ? "border-t border-border/50" : ""} style={{ height: ROW_H }}>
                    {/* Time label left */}
                    <td
                      className="border-r border-border/40 text-right pr-1.5 align-middle sticky left-0 bg-background z-10"
                      style={{ width: 52 }}
                    >
                      <span className="text-[10px] leading-none font-mono text-white font-semibold">
                        {slot.label}
                      </span>
                    </td>

                    {/* Day cells */}
                    {days.map((day, di) => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const key = `${dateStr}_${slot.start}`;
                      const entry = entryMap[key];
                      const tag = entry?.tagId ? tagList.find(t => t.id === entry.tagId) : undefined;
                      const highlighted = isDragHighlighted(di, si);
                      const selected = isSelected(di, si);
                      const isWeekend = di >= 5;
                      const isActive = activeCell?.dayIdx === di && activeCell?.slotIdx === si;
                      const isPaste = isPastePreview(di, si);
                      const isSingleSelectedCell =
                        !!selection &&
                        selection.startDay === selection.endDay &&
                        selection.start === selection.end &&
                        selection.startDay === di &&
                        selection.start === si;
                      const isFillSource =
                        fillDownState?.active &&
                        fillDownState.dayIdx === di &&
                        fillDownState.startSlot === si;
                      const isFillPreview =
                        fillDownState?.active &&
                        fillDownState.dayIdx === di &&
                        si > fillDownState.startSlot &&
                        si <= fillDownState.endSlot;

                      return (
                        <ContextMenu key={di}>
                          <ContextMenuTrigger asChild>
                            <td
                              className={`border-r border-border/20 relative cursor-pointer ${isWeekend ? "bg-muted/5" : ""} ${highlighted ? "bg-primary/25" : ""} ${selected && !highlighted ? "bg-primary/15 outline outline-1 outline-primary/40" : ""} ${isPaste && !highlighted ? "outline outline-1 outline-green-400/60" : ""} ${isFillPreview ? "outline outline-1 outline-cyan-400/60" : ""}`}
                              style={{
                                backgroundColor: isActive && !highlighted
                                  ? "rgba(34,211,238,0.18)"
                                  : isFillPreview
                                    ? (tag ? tag.color + "40" : "rgba(34,211,238,0.15)")
                                  : isPaste && !highlighted
                                    ? "rgba(74,222,128,0.15)"
                                    : (!highlighted && !selected && tag ? tag.color + "33" : undefined),
                                height: ROW_H,
                                boxShadow: isActive && !highlighted ? "inset 0 0 0 2px rgba(34,211,238,0.7)" : undefined,
                              }}
                              onMouseDown={() => onSlotMouseDown(di, si)}
                              onMouseEnter={() => onSlotMouseEnter(di, si)}
                              onMouseUp={(e) => onSlotMouseUp(di, si, e)}
                              onClick={(e) => {
                                setPasteTarget(di, si);
                                // Only open menu on true single click (not after drag)
                                if (!wasDragRef.current) {
                                  handleSingleCellClick(di, si, dateStr, e);
                                }
                                wasDragRef.current = false;
                              }}
                            >
                              {tag && !highlighted && (
                                <span
                                  className="absolute inset-0 flex items-center px-1 text-[11px] font-semibold truncate pointer-events-none leading-none"
                                  style={{ color: "#ffffff", textShadow: `0 0 8px ${tag.color}`, letterSpacing: "-0.01em" }}
                                >
                                  {tag.name}
                                </span>
                              )}
                              {tag && isSingleSelectedCell && (
                                <button
                                  type="button"
                                  className={`absolute bottom-0.5 right-0.5 z-10 h-2.5 w-2.5 rounded-sm border border-cyan-300 ${isFillSource ? "bg-cyan-300" : "bg-cyan-400"} shadow-sm`}
                                  onMouseDown={(e) => startFillDown(di, si, dateStr, tag, e)}
                                  title="Протянуть вниз"
                                />
                              )}
                            </td>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-48">
                            {/* Copy */}
                            <ContextMenuItem
                              disabled={!selection || selection.startDay !== di || selection.startDay !== selection.endDay}
                              onClick={handleCopy}
                            >
                              <Copy className="w-3.5 h-3.5 mr-2" />
                              {selection && selection.startDay === di && selection.startDay === selection.endDay
                                ? `Копировать (${selection.end - selection.start + 1} бл.)`
                                : "Копировать выделение"}
                            </ContextMenuItem>
                            {/* Paste */}
                            <ContextMenuItem
                              onClick={() => {
                                setPasteTarget(di, si);
                                const clip = clipboardRef.current;
                                if (clip) {
                                  pasteInternal({ dayIdx: di, slotIdx: si });
                                } else {
                                  openImportDialog({ dayIdx: di, slotIdx: si });
                                }
                              }}
                            >
                              <Clipboard className="w-3.5 h-3.5 mr-2" />
                              {clipboard ? `Вставить (${clipboard.length} бл.)` : "Вставить..."}
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            {/* Excel import */}
                            <ContextMenuItem
                              onClick={() => openImportDialog({ dayIdx: di, slotIdx: si })}
                            >
                              <FileInput className="w-3.5 h-3.5 mr-2" />
                              Импорт из Excel...
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            {/* Clear */}
                            <ContextMenuItem
                              disabled={!entry?.tagId}
                              className={entry?.tagId ? "text-destructive focus:text-destructive" : ""}
                              onClick={() => { if (entry?.tagId) handleSetEntry(dateStr, si, null); }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Очистить ячейку
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      );
                    })}
                    {/* Time label right */}
                    <td
                      className="border-l border-border/40 text-left pl-1.5 align-middle sticky right-0 bg-background z-10"
                      style={{ width: 52 }}
                    >
                      <span className="text-[10px] leading-none font-mono text-white font-semibold">
                        {slot.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {/* ── Right sidebar: tag stats + work blocks ── */}
          <div className="flex-shrink-0 w-52 border-l border-border bg-background overflow-y-auto">

            {/* ── Work blocks panel (top) ── */}
            <div className="border-b border-border">
              <div className="px-3 py-2 border-b border-border">
                <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  Рабочие блоки
                </div>
                <div className="text-[10px] text-white/80 mt-0.5">
                  Норма: {workNormBlocks} блоков = 100% ({blocksToHours(workNormBlocks).toFixed(1)}ч)
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-white/70 whitespace-nowrap">Дневная норма</span>
                  <Input
                    type="number"
                    min={1}
                    max={96}
                    value={workNormBlocks}
                    onChange={(e) => setWorkNormBlocks(Number.parseInt(e.target.value || "0", 10))}
                    className="h-7 w-16 bg-input px-2 text-xs"
                  />
                  <span className="text-[10px] text-white/50">по 15 минут</span>
                </div>
              </div>

              {/* ─ Today progress ─ */}
              <div className="px-3 pt-3 pb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-white uppercase tracking-wide">Сегодня</span>
                  <span className={`text-sm font-bold ${getEfficiencyTextClass(workPct)}`}>
                    {workPct}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${workPct}%`, backgroundColor: getEfficiencyColor(workPct) }}
                  />
                </div>
                <div className="text-[10px] text-white/80 mt-1">
                  {workBlocksToday.total} бл. • {workBlocksToday.total * 15} мин • {blocksToHours(workBlocksToday.total).toFixed(1)}ч
                </div>
              </div>

              {/* Work tags breakdown */}
              {workBlocksToday.tags.length > 0 && (
                <div className="pb-1">
                  {workBlocksToday.tags.map(t => (
                    <div key={t.name} className="flex items-center gap-2 px-3 py-0.5 hover:bg-muted/20">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="flex-1 text-[10px] text-white truncate">{t.name}</span>
                      <span className="text-[10px] text-white/80 whitespace-nowrap">{(t.count * 15 / 60).toFixed(1)}ч</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ─ Summary stats ─ */}
              <div className="mx-3 mt-1 pt-2 border-t border-border/50 pb-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white">Ср. за неделю</span>
                  <span className={`text-xs font-semibold ${getEfficiencyTextClass(selectedWeekAvg)}`}>
                    {selectedWeekAvg}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white">Ср. за 7 дней</span>
                  <span className={`text-xs font-semibold ${getEfficiencyTextClass(selectedWeekAvg)}`}>
                    {selectedWeekAvg}%
                  </span>
                </div>
              </div>

              {/* ─ Last 7 days breakdown ─ */}
              <div className="mx-3 pt-2 border-t border-border/50 pb-3">
                <div className="text-[10px] text-white uppercase tracking-wide mb-1.5">Последние 7 дней</div>
                <div className="space-y-1">
                  {selectedWeekEfficiency.map(day => (
                    <div key={day.dateStr} className="flex items-center gap-2 opacity-100">
                      <span className="text-[10px] text-white w-14 flex-shrink-0 truncate">{day.label}</span>
                      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${day.pct}%`, backgroundColor: day.pct > 0 ? getEfficiencyColor(day.pct) : "transparent" }}
                        />
                      </div>
                      <span className={`text-[10px] w-7 text-right flex-shrink-0 font-medium ${day.pct > 0 ? getEfficiencyTextClass(day.pct) : "text-white/40"}`}>
                        {day.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Tag stats (below work blocks) ── */}
            <div className="px-3 py-2 border-b border-border">
              <div className="text-xs font-semibold text-white uppercase tracking-wide">Теги недели</div>
            </div>
            {tagStats.length === 0 ? (
              <div className="px-3 py-4 text-xs text-white/80">Нет данных</div>
            ) : (
              <div className="py-1">
                {tagStats.map(t => {
                  const hours = (t.count * 15 / 60);
                  const pct = totalBlocks > 0 ? Math.round(t.count / totalBlocks * 100) : 0;
                  return (
                    <div key={t.name} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/20 transition-colors">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="flex-1 text-xs text-white truncate">{t.name}</span>
                      <span className="text-[10px] text-white/80 whitespace-nowrap">
                        {hours % 1 === 0 ? hours : hours.toFixed(1)}ч ({pct}%)
                      </span>
                    </div>
                  );
                })}
                <div className="mx-3 mt-1 pt-1.5 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white">Итого</span>
                    <span className="text-xs text-white font-medium">{(totalBlocks * 15 / 60).toFixed(1)}ч</span>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Floating unified tag menu ── */}
      {multiMenuOpen && multiMenuPos && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => { setMultiMenuOpen(false); setMultiMenuPos(null); setMenuCell(null); setActiveCell(null); }} />
          <div
            className="fixed z-50 bg-card border border-border rounded-lg shadow-xl p-2 w-52"
            style={{ left: Math.min(multiMenuPos.x + 8, window.innerWidth - 220), top: Math.min(multiMenuPos.y + 4, window.innerHeight - 320) }}
            onMouseDown={e => e.stopPropagation()}
          >
            {/* Continue button — only for single filled cell */}
            {menuCell && (() => {
              const cellEntry = entryMap[`${menuCell.dateStr}_${TIME_SLOTS[menuCell.slotIdx].start}`];
              const cellTag = cellEntry?.tagId ? tagList.find(t => t.id === cellEntry.tagId) : null;
              if (!cellTag) return null;
              return (
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm font-medium bg-primary/20 hover:bg-primary/30 text-primary transition-colors mb-1"
                  onClick={handleContinue}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cellTag.color }} />
                  <span className="flex-1 text-left truncate">Продолжить: {cellTag.name}</span>
                  <span className="text-[10px] opacity-60">→</span>
                </button>
              );
            })()}
            <div className="text-[10px] text-muted-foreground font-medium px-2 pb-1.5 border-b border-border mb-1">
              {menuCell ? "Сменить тег" : selection ? `Выбрано ${(selection.end - selection.start + 1) * (selection.endDay - selection.startDay + 1)} блоков` : "Выбор тега"}
            </div>
            <div className="space-y-0.5 max-h-64 overflow-y-auto">
              {/* Top-7 most-used tags this week — highlighted */}
              {top7TagIds.size > 0 && (() => {
                const top7 = tagList.filter(t => top7TagIds.has(t.id));
                const rest = tagList.filter(t => !top7TagIds.has(t.id));
                return (
                  <>
                    {top7.map(tag => (
                      <button
                        key={tag.id}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors text-left"
                        style={{ backgroundColor: tag.color + "22" }}
                        onClick={() => handleMultiTagSelect(tag)}
                      >
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                        <span className="text-foreground font-medium">{tag.name}</span>
                      </button>
                    ))}
                    {rest.length > 0 && (
                      <>
                        <div className="mx-2 my-1 border-t border-border/40" />
                        {rest.map(tag => (
                          <button
                            key={tag.id}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors text-left"
                            onClick={() => handleMultiTagSelect(tag)}
                          >
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                            <span className="text-foreground">{tag.name}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
              {/* Fallback: no week data yet, show flat list */}
              {top7TagIds.size === 0 && tagList.map(tag => (
                <button
                  key={tag.id}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors text-left"
                  onClick={() => handleMultiTagSelect(tag)}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="text-foreground">{tag.name}</span>
                </button>
              ))}
              <div className="mx-2 my-1 border-t border-border/40" />
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-destructive/20 text-destructive transition-colors"
                onClick={() => handleMultiTagSelect(null)}
              >
                <Trash2 className="w-3 h-3" />
                Очистить
              </button>
            </div>
            <div className="border-t border-border mt-1.5 pt-1.5 flex gap-1">
              <Input
                value={newTagForMulti}
                onChange={e => setNewTagForMulti(e.target.value)}
                placeholder="Новый тег..."
                className="h-7 text-xs bg-input"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter" && newTagForMulti.trim()) { handleMultiAddTag(newTagForMulti.trim()); setNewTagForMulti(""); }
                  if (e.key === "Escape") { setMultiMenuOpen(false); setMultiMenuPos(null); setActiveCell(null); }
                }}
              />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={() => { if (newTagForMulti.trim()) { handleMultiAddTag(newTagForMulti.trim()); setNewTagForMulti(""); } }}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Excel Import Dialog ── */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) setActiveCell(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Импорт из Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Скопируйте данные из Excel (Ctrl+C) и вставьте их ниже (Ctrl+V в поле ввода).
              Поддерживается формат: <code className="text-xs bg-muted px-1 rounded">время[Tab]тег</code> или просто <code className="text-xs bg-muted px-1 rounded">тег</code> на каждой строке.
            </p>
            <textarea
              className="w-full h-48 p-2 text-sm font-mono bg-input border border-border rounded resize-none focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              placeholder={"6:30\tсон\n6:45\tсон\n7:00\tработа\n..."}
              value={importText}
              onChange={e => setImportText(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Данные будут вставлены начиная с выбранной ячейки. Неизвестные теги создадутся автоматически.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportDialogOpen(false); setActiveCell(null); }}>Отмена</Button>
            <Button onClick={handleImportConfirm} disabled={!importText.trim()}>
              Вставить {importText.trim() ? `(${importText.trim().split(/\r?\n/).filter(l => l.trim()).length} строк)` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={weekImportDialogOpen} onOpenChange={(open) => { setWeekImportDialogOpen(open); if (!open) setWeekImportText(""); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Импортировать всю неделю</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Вставьте сюда всю неделю целиком: <code className="text-xs bg-muted px-1 rounded">672 строки подряд</code>.
              Первые 96 строк — понедельник, следующие 96 — вторник, потом среда и так до воскресенья.
              Если из Excel прилетит ещё первый столбец со временем, он тоже поддерживается.
            </p>
            <textarea
              className="w-full h-80 p-2 text-sm font-mono bg-input border border-border rounded resize-none focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              placeholder={"сон\nсон\nработа\n...\n[96 строк понедельника]\nсон\nсон\nтактика\n...\n[96 строк вторника]\n..."}
              value={weekImportText}
              onChange={e => setWeekImportText(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Импорт заполнит текущую открытую неделю целиком. Неизвестные теги будут созданы автоматически.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setWeekImportDialogOpen(false); setWeekImportText(""); }}>
              Отмена
            </Button>
            <Button onClick={handleWeekImportConfirm} disabled={!weekImportText.trim()}>
              Импортировать неделю
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
