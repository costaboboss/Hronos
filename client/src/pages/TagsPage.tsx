import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Briefcase, Tag, Plus, Pencil, Check, X } from "lucide-react";
import { getTagGoals, setTagGoal } from "@/lib/planning";

// ─── Types ────────────────────────────────────────────────────────────────────

type TagItem = {
  id: number;
  name: string;
  color: string;
  isDefault: boolean;
  isWork: boolean;
};

// ─── Color palette ────────────────────────────────────────────────────────────

const COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#f97316",
  "#8b5cf6", "#06b6d4", "#84cc16", "#ec4899", "#3b82f6",
  "#14b8a6", "#f43f5e", "#a855f7", "#0ea5e9", "#22c55e",
];

// ─── TagsPage ─────────────────────────────────────────────────────────────────

export default function TagsPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: tagList = [], isLoading } = trpc.tags.list.useQuery(undefined, { enabled: !!user });

  const setWorkMutation = trpc.tags.setWork.useMutation({
    onSuccess: () => utils.tags.list.invalidate(),
    onError: () => toast.error("Ошибка сохранения"),
  });

  const updateMutation = trpc.tags.update.useMutation({
    onSuccess: () => { utils.tags.list.invalidate(); setEditingId(null); },
    onError: () => toast.error("Ошибка сохранения"),
  });

  const createMutation = trpc.tags.create.useMutation({
    onSuccess: () => { utils.tags.list.invalidate(); setNewName(""); setNewColor(COLORS[0]); toast.success("Тег создан"); },
    onError: () => toast.error("Ошибка создания тега"),
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [tagGoals, setTagGoals] = useState<Record<string, number>>({});

  useEffect(() => {
    setTagGoals(getTagGoals());
  }, []);

  const workTags = (tagList as TagItem[]).filter(t => t.isWork);
  const nonWorkTags = (tagList as TagItem[]).filter(t => !t.isWork);

  const startEdit = (tag: TagItem) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const saveEdit = (tag: TagItem) => {
    if (!editName.trim()) return;
    updateMutation.mutate({ id: tag.id, name: editName.trim(), color: editColor });
  };

  const cancelEdit = () => setEditingId(null);

  const toggleWork = (tag: TagItem) => {
    setWorkMutation.mutate({ id: tag.id, isWork: !tag.isWork });
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), color: newColor });
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Загрузка...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Tag className="w-5 h-5 text-primary" />
          Категории тегов
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Управляйте тегами и отмечайте «рабочие» — те, которые двигают жизнь вперёд.
          Норма: 40 рабочих блоков в день (10 часов = 100%).
        </p>
      </div>

      {/* ── Work tags section ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Briefcase className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">
            Рабочие теги ({workTags.length})
          </h2>
        </div>
        {workTags.length === 0 ? (
          <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg px-4 py-3 border border-dashed border-border">
            Нет рабочих тегов. Включите переключатель «Рабочий» у нужных тегов ниже.
          </div>
        ) : (
          <div className="space-y-1">
            {workTags.map(tag => (
              <TagRow
                key={tag.id}
                tag={tag}
                goalHours={tagGoals[String(tag.id)] ?? null}
                isEditing={editingId === tag.id}
                editName={editName}
                editColor={editColor}
                onEditName={setEditName}
                onEditColor={setEditColor}
                onStartEdit={() => startEdit(tag)}
                onSaveEdit={() => saveEdit(tag)}
                onCancelEdit={cancelEdit}
                onToggleWork={() => toggleWork(tag)}
                onGoalChange={(hours) => setTagGoals(setTagGoal(tag.id, hours))}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── All tags section ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Tag className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Остальные теги ({nonWorkTags.length})
          </h2>
        </div>
        <div className="space-y-1">
          {nonWorkTags.map(tag => (
            <TagRow
              key={tag.id}
              tag={tag}
              goalHours={tagGoals[String(tag.id)] ?? null}
              isEditing={editingId === tag.id}
              editName={editName}
              editColor={editColor}
              onEditName={setEditName}
              onEditColor={setEditColor}
              onStartEdit={() => startEdit(tag)}
              onSaveEdit={() => saveEdit(tag)}
              onCancelEdit={cancelEdit}
              onToggleWork={() => toggleWork(tag)}
              onGoalChange={(hours) => setTagGoals(setTagGoal(tag.id, hours))}
            />
          ))}
        </div>
      </div>

      {/* ── Create new tag ── */}
      <div className="border border-border rounded-lg p-4 bg-card">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Новый тег
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c}
                className={`w-5 h-5 rounded-full transition-all ${newColor === c ? "ring-2 ring-white ring-offset-1 ring-offset-background scale-110" : "opacity-70 hover:opacity-100"}`}
                style={{ backgroundColor: c }}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Название тега..."
            className="flex-1 h-8 text-sm bg-input"
            onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
          />
          <Button
            size="sm"
            className="h-8"
            onClick={handleCreate}
            disabled={!newName.trim() || createMutation.isPending}
          >
            Создать
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── TagRow ───────────────────────────────────────────────────────────────────

function TagRow({
  tag,
  goalHours,
  isEditing,
  editName,
  editColor,
  onEditName,
  onEditColor,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleWork,
  onGoalChange,
}: {
  tag: TagItem;
  goalHours: number | null;
  isEditing: boolean;
  editName: string;
  editColor: string;
  onEditName: (v: string) => void;
  onEditColor: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleWork: () => void;
  onGoalChange: (hours: number | null) => void;
}) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${tag.isWork ? "border-amber-400/30 bg-amber-400/5" : "border-border bg-card/50"} hover:bg-muted/20`}>
      {/* Color dot */}
      {isEditing ? (
        <div className="flex gap-1 flex-wrap w-32">
          {COLORS.map(c => (
            <button
              key={c}
              className={`w-4 h-4 rounded-full transition-all ${editColor === c ? "ring-2 ring-white ring-offset-1 ring-offset-background scale-110" : "opacity-60 hover:opacity-100"}`}
              style={{ backgroundColor: c }}
              onClick={() => onEditColor(c)}
            />
          ))}
        </div>
      ) : (
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
      )}

      {/* Name */}
      {isEditing ? (
        <Input
          value={editName}
          onChange={e => onEditName(e.target.value)}
          className="flex-1 h-7 text-sm bg-input"
          autoFocus
          onKeyDown={e => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") onCancelEdit(); }}
        />
      ) : (
        <span className="flex-1 text-sm text-foreground">{tag.name}</span>
      )}

      {/* Work badge */}
      {tag.isWork && !isEditing && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400/50 text-amber-400 bg-amber-400/10">
          рабочий
        </Badge>
      )}

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[10px] text-muted-foreground">Р¦РµР»СЊ</span>
        <Input
          type="number"
          min={0}
          step={0.5}
          value={goalHours ?? ""}
          onChange={e => {
            const raw = e.target.value.trim();
            onGoalChange(raw ? Number(raw) : null);
          }}
          placeholder="0"
          className="h-7 w-16 text-xs bg-input"
        />
        <span className="text-[10px] text-muted-foreground">С‡</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isEditing ? (
          <>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400 hover:text-green-300" onClick={onSaveEdit}>
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={onCancelEdit}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={onStartEdit}>
            <Pencil className="w-3 h-3" />
          </Button>
        )}

        {/* Work toggle */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Рабочий</span>
          <Switch
            checked={tag.isWork}
            onCheckedChange={onToggleWork}
            className="scale-75"
          />
        </div>
      </div>
    </div>
  );
}
