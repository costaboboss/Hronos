import { Download, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function SettingsPage() {
  const exportBackup = trpc.backup.export.useMutation({
    onError: error => {
      toast.error(error.message);
    },
  });

  const handleExportBackup = async () => {
    const backup = await exportBackup.mutateAsync();
    const exportedAt = String(backup.exportedAt ?? new Date().toISOString()).slice(0, 10);
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hronos-backup-${exportedAt}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    toast.success("Резервная копия скачана");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background px-6 py-4">
        <h1 className="text-base font-semibold">Настройки</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Экспорт страховочного backup для Hronos и его встроенных модулей.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid max-w-3xl gap-6">
          <Card className="max-w-2xl">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                  <ShieldCheck className="h-4 w-4 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-sm">Резервная копия</CardTitle>
                  <CardDescription className="mt-1">
                    Скачивает полный JSON-слепок пользовательских данных Hronos: теги, тайм-слоты,
                    Tardis и тренировки. Это ручной backup на случай сбоев Railway, ошибок миграций
                    или любых проблем в приложении.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                В backup входят:
                <div className="mt-2">
                  теги, записи времени, группы и документы Tardis, блоки и связи, упражнения,
                  тренировки, упражнения в тренировках и подходы.
                </div>
              </div>

              <Button onClick={() => void handleExportBackup()} disabled={exportBackup.isPending}>
                {exportBackup.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Скачать backup JSON
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
