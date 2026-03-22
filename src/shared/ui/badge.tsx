import { cn } from "@/shared/lib/cn";

type Variant = "default" | "success" | "warning" | "danger" | "info";

const variantClass: Record<Variant, string> = {
  default: "bg-panelMuted text-text border-border",
  success: "bg-panelMuted text-success border-border",
  warning: "bg-panelMuted text-warning border-border",
  danger: "bg-panelMuted text-danger border-border",
  info: "bg-panelMuted text-info border-border"
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
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        variantClass[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
