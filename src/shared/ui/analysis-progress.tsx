import { AnalysisRun } from "@/entities/types";
import { Card, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/cn";

const STAGES: Array<{ id: string; label: string }> = [
  { id: "fetching_reviews", label: "Сбор отзывов с площадок" },
  { id: "normalizing_reviews", label: "Нормализация текста и метаданных" },
  { id: "deduping_reviews", label: "Проверка качества и удаление дублей" },
  { id: "analyzing_reviews", label: "Анализ тональности, тем и сегментов" },
  { id: "aggregating_insights", label: "Расчет агрегированных метрик и рисков" },
  { id: "completed", label: "Подготовка сводки и рекомендаций" }
];

export function AnalysisProgress({
  run,
  className
}: {
  run?: AnalysisRun | null;
  className?: string;
}) {
  if (!run) {
    return null;
  }

  const pct = Math.max(0, Math.min(100, Math.floor(run.progressPct ?? 0)));
  const isFailed = run.status === "failed";
  const isDone = run.status === "completed";
  const stage = run.stage || "fetching_reviews";

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <div className="anim-shimmer pointer-events-none absolute inset-0 opacity-45" />
      <CardTitle
        title="Статус обработки"
        subtitle="Система выполняет сбор и анализ отзывов. Прогресс обновляется автоматически."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isFailed ? "danger" : isDone ? "success" : "warning"}>
          {translateRunStatus(run.status)}
        </Badge>
        <Badge variant="info">Готовность {pct}%</Badge>
        {run.provider ? <Badge variant="default">Источник: {run.provider}</Badge> : null}
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            isFailed ? "bg-danger" : "bg-accent anim-pulse-soft"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 space-y-2">
        {STAGES.map((item, index) => {
          const currentStageIndex = Math.max(
            0,
            STAGES.findIndex((stageItem) => stageItem.id === stage)
          );
          const isPassed = isDone || currentStageIndex > index;
          const isCurrent = !isDone && !isFailed && currentStageIndex === index;
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm",
                isPassed && "bg-green-50",
                isCurrent && "bg-amber-50"
              )}
            >
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 rounded-full bg-slate-300",
                  isPassed && "bg-success",
                  isCurrent && "bg-warning anim-pulse-soft"
                )}
              />
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>

      {run.errorMessage ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
          {run.errorMessage}
        </p>
      ) : null}
      {run.notes ? <p className="mt-3 text-xs text-textMuted">{run.notes}</p> : null}
    </Card>
  );
}

function translateRunStatus(status: AnalysisRun["status"]): string {
  if (status === "completed") {
    return "Завершено";
  }
  if (status === "running") {
    return "В работе";
  }
  if (status === "failed") {
    return "Ошибка";
  }
  return "Ожидание";
}
