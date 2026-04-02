import { SelectHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "min-h-12 w-full rounded-[1.05rem] border border-border bg-panelSolid px-4 py-3 text-sm text-text shadow-insetSoft outline-none transition-all duration-200 focus:border-accent focus:bg-panelSolid focus:ring-4 focus:ring-accentSoft",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

