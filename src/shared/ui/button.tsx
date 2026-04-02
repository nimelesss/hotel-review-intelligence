import { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary:
    "border-transparent bg-accent text-white shadow-glow hover:bg-accentStrong hover:shadow-panel active:translate-y-px",
  secondary:
    "border-border bg-panelSolid text-text hover:border-borderStrong hover:bg-panelMuted hover:text-text active:translate-y-px",
  ghost:
    "border-transparent bg-transparent text-textMuted hover:bg-panelMuted hover:text-text",
  danger:
    "border-transparent bg-danger text-white hover:bg-[#9e3838] active:translate-y-px"
};

const sizeClass: Record<Size, string> = {
  sm: "min-h-10 px-3.5 text-xs",
  md: "min-h-11 px-4.5 text-sm",
  lg: "min-h-12 px-5 text-sm"
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border font-semibold tracking-[-0.01em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-55",
        sizeClass[size],
        variantClass[variant],
        className
      )}
      {...props}
    />
  );
}

