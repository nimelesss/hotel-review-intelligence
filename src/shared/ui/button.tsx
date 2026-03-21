import { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variantClass: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-[#0b5263] active:bg-[#084552] border-transparent",
  secondary: "bg-panel text-text hover:bg-panelMuted border-border",
  ghost: "bg-transparent text-text hover:bg-panelMuted border-transparent",
  danger: "bg-danger text-white hover:bg-[#9e2f2f] border-transparent"
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variantClass[variant],
        className
      )}
      {...props}
    />
  );
}
