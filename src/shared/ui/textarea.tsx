import { TextareaHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-[1.15rem] border border-border bg-panelSolid px-4 py-3 text-sm text-text shadow-insetSoft outline-none transition-all duration-200 placeholder:text-textSoft focus:border-accent focus:bg-panelSolid focus:ring-4 focus:ring-accentSoft",
        className
      )}
      {...props}
    />
  );
}

