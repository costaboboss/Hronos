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

type TagItem = {
  id: number;
  name: string;
  color: string;
  isDefault: boolean;
  isWork: boolean;
};

const COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#f97316",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#ec4899",
  "#3b82f6",
  "#14b8a6",
  "#f43f5e",
  "#a855f7",
  "#0ea5e9",
  "#22c55e",
];

export default function TagsPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: tagList = [], isLoading } = trpc.tags.list.useQuery(undefined, {
    enabled: !!user,
  });

  const setWorkMutation = trpc.tags.setWork.useMutation({
    onSuccess: () => utils.tags.list.invalidate(),
    onError: () => toast.error("Ошибка сохранения"),
  });

  const updateMutation = trpc.tags.update.useMutation({
    onSuccess: () => {
      utils.tags.list.invalidate();
      setEditingId(null);
    },
    onError: () => toast.error("Ошибка сохранения"),
  });

  const createMutation = trpc.tags.create.useMutation({
    onSuccess: () => {
      utils.tags.list.invalidate();
      setNewName("");
      setNewColor(COLORS[0]);
      toast.success("Тег создан");
    },
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

  const workTags = (tagList as TagItem[]).filter((tag) => tag.isWork);
  const nonWorkTags = (tagList as TagItem[]).filter((tag) => !tag.isWork);

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
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  return (
    <div className="mx-auto flex-1 w-full max-w-3xl overflow-auto p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Tag className="h-5 w-5 text-primary" />
          Категории тегов
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Управляйте тегами и отмечайте «рабочие» — те, которые двигают жизнь вперёд.
          Норма: 40 рабочих блоков в день (10 часов = 100%).
        </p>
      </div>

      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-400">
            Рабочие теги ({workTags.length})
          </h2>
        </div>
        {workTags.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            Нет рабочих тегов. Включите переключатель «Рабочий» у нужных тегов ниже.
          </div>
        ) : (
          <div className="space-y-1">
            {workTags.map((tag) => (
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

      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Остальные теги ({nonWorkTags.length})
          </h2>
        </div>
        <div className="space-y-1">
          {nonWorkTags.map((tag) => (
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

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plus className="h-4 w-4" />
          Новый тег
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((color) => (
              <button
                key={color}
                className={`h-5 w-5 rounded-full transition-all ${
                  newColor === color
                    ? "scale-110 ring-2 ring-white ring-offset-1 ring-offset-background"
                    : "opacity-70 hover:opacity-100"
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setNewColor(color)}
              />
            ))}
          </div>
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Название тега..."
            className="h-8 flex-1 bg-input text-sm"
            onKeyDown={(event) => {
              if (event.key === "Enter") handleCreate();
            }}
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
  onEditName: (value: string) => void;
  onEditColor: (value: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleWork: () => void;
  onGoalChange: (hours: number | null) => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
        tag.isWork ? "border-amber-400/30 bg-amber-400/5" : "border-border bg-card/50"
      } hover:bg-muted/20`}
    >
      {isEditing ? (
        <div className="flex w-32 flex-wrap gap-1">
          {COLORS.map((color) => (
            <button
              key={color}
              className={`h-4 w-4 rounded-full transition-all ${
                editColor === color
                  ? "scale-110 ring-2 ring-white ring-offset-1 ring-offset-background"
                  : "opacity-60 hover:opacity-100"
              }`}
              style={{ backgroundColor: color }}
              onClick={() => onEditColor(color)}
            />
          ))}
        </div>
      ) : (
        <span
          className="h-3 w-3 flex-shrink-0 rounded-full"
          style={{ backgroundColor: tag.color }}
        />
      )}

      {isEditing ? (
        <Input
          value={editName}
          onChange={(event) => onEditName(event.target.value)}
          className="h-7 flex-1 bg-input text-sm"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") onSaveEdit();
            if (event.key === "Escape") onCancelEdit();
          }}
        />
      ) : (
        <span className="flex-1 text-sm text-foreground">{tag.name}</span>
      )}

      {tag.isWork && !isEditing && (
        <Badge
          variant="outline"
          className="border-amber-400/50 bg-amber-400/10 px-1.5 py-0 text-[10px] text-amber-400"
        >
          рабочий
        </Badge>
      )}

      <div className="flex flex-shrink-0 items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">Цель</span>
        <Input
          type="number"
          min={0}
          step={0.5}
          value={goalHours ?? ""}
          onChange={(event) => {
            const raw = event.target.value.trim();
            onGoalChange(raw ? Number(raw) : null);
          }}
          placeholder="0"
          className="h-7 w-16 bg-input text-xs"
        />
        <span className="text-[10px] text-muted-foreground">ч</span>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {isEditing ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-green-400 hover:text-green-300"
              onClick={onSaveEdit}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={onCancelEdit}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={onStartEdit}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Рабочий</span>
          <Switch checked={tag.isWork} onCheckedChange={onToggleWork} className="scale-75" />
        </div>
      </div>
    </div>
  );
}
