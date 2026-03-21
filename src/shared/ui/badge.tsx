import { cn } from "@/shared/lib/cn";

type Variant = "default" | "success" | "warning" | "danger" | "info";

const variantClass: Record<Variant, string> = {
  default: "bg-panelMuted text-text border-border",
  success: "bg-green-50 text-success border-green-200",
  warning: "bg-amber-50 text-warning border-amber-200",
  danger: "bg-red-50 text-danger border-red-200",
  info: "bg-blue-50 text-info border-blue-200"
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
