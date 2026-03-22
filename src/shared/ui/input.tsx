import { InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text placeholder:text-textMuted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20",
        className
      )}
      {...props}
    />
  );
}
