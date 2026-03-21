import { Card } from "@/shared/ui/card";

export function KpiCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-textMuted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-text">{value}</p>
      {hint ? <p className="mt-2 text-xs text-textMuted">{hint}</p> : null}
    </Card>
  );
}
