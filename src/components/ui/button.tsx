import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variantClasses: Record<Variant, string> = {
  primary: "lf-btn-primary text-white",
  secondary:
    "lf-glass lf-glass-hover text-lf-text border-lf-purple-light/30",
  ghost: "text-lf-text-dim hover:text-lf-text",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
