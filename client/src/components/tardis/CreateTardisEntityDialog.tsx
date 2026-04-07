import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type TardisDocumentType } from "@shared/tardis";
import { useMemo, useState } from "react";

type CreateTardisEntityDialogProps = {
  open: boolean;
  mode: "group" | "notebook" | "document";
  title: string;
  onClose: () => void;
  onSubmit: (payload: { title: string; documentType?: TardisDocumentType; periodDate?: string }) => Promise<void> | void;
};

const documentTypeLabels: Record<TardisDocumentType, string> = {
  custom_note: "Свободная заметка",
  strategy: "Strategy",
  tactics: "Tactics",
  daily_tt: "Daily TT",
  weekly_nr: "Weekly NR",
  monthly_mr: "Monthly MR",
  yearly_yr: "Yearly YR",
};

export function CreateTardisEntityDialog({
  open,
  mode,
  title,
  onClose,
  onSubmit,
}: CreateTardisEntityDialogProps) {
  const [name, setName] = useState("");
  const [documentType, setDocumentType] = useState<TardisDocumentType>("custom_note");
  const [periodDate, setPeriodDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const submitLabel = useMemo(() => {
    if (mode === "group") return "Создать группу";
    if (mode === "notebook") return "Создать блокнот";
    return "Создать документ";
  }, [mode]);

  async function handleSubmit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        title: name.trim(),
        documentType: mode === "document" ? documentType : undefined,
        periodDate: mode === "document" && documentType !== "custom_note" ? periodDate : undefined,
      });
      setName("");
      setDocumentType("custom_note");
      setPeriodDate(new Date().toISOString().slice(0, 10));
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={nextOpen => (!nextOpen ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder={
              mode === "group"
                ? "Например, 2026"
                : mode === "notebook"
                  ? "Например, Тактика"
                  : "Название документа"
            }
            value={name}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") handleSubmit();
            }}
            autoFocus
          />

          {mode === "document" ? (
            <>
              <Select value={documentType} onValueChange={value => setDocumentType(value as TardisDocumentType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Тип документа" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(documentTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {documentType !== "custom_note" ? (
                <Input type="date" value={periodDate} onChange={event => setPeriodDate(event.target.value)} />
              ) : null}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
