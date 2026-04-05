import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Clock } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-6 max-w-sm w-full px-6">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Хронос
          </h1>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Система сплошного хронометража жизни.
          <br />
          Каждый день разбит на 15-минутные интервалы.
        </p>
        <Button
          className="w-full"
          onClick={() => {
            window.location.href = getLoginUrl();
          }}
        >
          Войти через Google
        </Button>
      </div>
    </div>
  );
}
