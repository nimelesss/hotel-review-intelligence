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
        "glass-panel surface-ring anim-fade-up relative overflow-hidden rounded-[1.9rem] border border-border bg-panel px-5 py-5 shadow-panel sm:px-6 sm:py-6",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      <div className="pointer-events-none absolute -right-8 top-0 h-32 w-32 rounded-full bg-accentSoft blur-3xl" />
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl">
          {badge ? <Badge variant="info">{badge}</Badge> : null}
          <h1 className="mt-3 text-3xl font-semibold leading-[1.02] text-text sm:text-[2.5rem]">{title}</h1>
          {subtitle ? <p className="mt-3 max-w-2xl text-sm leading-7 text-textMuted sm:text-[15px]">{subtitle}</p> : null}
        </div>
        {rightSlot ? <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">{rightSlot}</div> : null}
      </div>
    </div>
  );
}
