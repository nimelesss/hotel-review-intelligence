import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/cn";

export function PageHeader({
  title,
  subtitle,
  badge,
  rightSlot,
  className
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  rightSlot?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 rounded-xl2 border border-border bg-panel p-5 shadow-soft md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold leading-tight text-text">{title}</h1>
          {badge ? <Badge variant="info">{badge}</Badge> : null}
        </div>
        {subtitle ? <p className="mt-2 text-sm text-textMuted">{subtitle}</p> : null}
      </div>
      {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
    </div>
  );
}
