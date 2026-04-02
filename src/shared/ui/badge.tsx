import { cn } from "@/shared/lib/cn";

type Variant = "default" | "success" | "warning" | "danger" | "info";

const variantClass: Record<Variant, string> = {
  default: "border-border bg-panelSolid text-textMuted",
  success: "border-emerald-500/18 bg-emerald-500/10 text-success",
  warning: "border-amber-500/18 bg-amber-500/10 text-warning",
  danger: "border-rose-500/18 bg-rose-500/10 text-danger",
  info: "border-sky-500/18 bg-sky-500/10 text-info"
};

export function Badge({
  children,
  variant = "default",
  className
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
        variantClass[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

