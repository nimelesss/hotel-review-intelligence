import { Card } from "@/shared/ui/card";
import { cn } from "@/shared/lib/cn";

export function KpiCard({
  label,
  value,
  hint,
  emphasis = "neutral"
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: "neutral" | "accent" | "success" | "danger";
}) {
  const emphasisClass = {
    neutral: "from-white/30 via-transparent to-transparent",
    accent: "from-cyan-300/30 via-transparent to-transparent",
    success: "from-emerald-300/30 via-transparent to-transparent",
    danger: "from-rose-300/30 via-transparent to-transparent"
  }[emphasis];

  return (
    <Card className="metric-tile min-h-[168px] p-0">
      <div className={cn("absolute inset-x-0 top-0 h-24 bg-gradient-to-br", emphasisClass)} />
      <div className="relative p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-textMuted">{label}</p>
        <p className="mt-4 text-[2rem] font-semibold leading-none text-text sm:text-[2.3rem]">{value}</p>
        {hint ? <p className="mt-4 max-w-[18rem] text-sm leading-6 text-textMuted">{hint}</p> : null}
      </div>
    </Card>
  );
}
