import { cn } from "@/shared/lib/cn";

export function Card({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "glass-panel surface-ring anim-fade-up rounded-[1.6rem] border border-border bg-panel px-5 py-5 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-panel sm:px-6",
        className
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({
  title,
  subtitle,
  kicker,
  action
}: {
  title: string;
  subtitle?: string;
  kicker?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {kicker ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-textMuted">{kicker}</p>
        ) : null}
        <h3 className="mt-1 text-[1.05rem] font-semibold leading-tight text-text sm:text-[1.12rem]">{title}</h3>
        {subtitle ? <p className="mt-2 max-w-[52rem] text-sm leading-6 text-textMuted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
