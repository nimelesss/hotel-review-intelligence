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
        "anim-fade-up rounded-xl2 border border-border bg-panel p-5 shadow-panel transition-transform duration-300 hover:-translate-y-0.5",
        className
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({
  title,
  subtitle
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-4">
      <h3 className="text-lg font-semibold leading-tight text-text">{title}</h3>
      {subtitle ? (
        <p className="mt-1 text-sm leading-snug text-textMuted">{subtitle}</p>
      ) : null}
    </header>
  );
}
