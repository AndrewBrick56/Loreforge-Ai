"use client";

import { ART_STYLES, type ArtStyle } from "@/types/character";
import { cn } from "@/lib/utils";

interface StylePickerProps {
  value: ArtStyle;
  onChange: (style: ArtStyle) => void;
}

export function StylePicker({ value, onChange }: StylePickerProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
      {ART_STYLES.map((style) => {
        const active = style.value === value;
        return (
          <button
            key={style.value}
            type="button"
            onClick={() => onChange(style.value)}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-xs font-medium transition-all cursor-pointer",
              active
                ? "border-lf-purple-light bg-lf-purple/20 text-white shadow-[0_0_16px_-4px_var(--lf-glow-purple)]"
                : "border-white/10 text-lf-text-dim hover:border-white/25 hover:text-lf-text"
            )}
          >
            {style.label}
          </button>
        );
      })}
    </div>
  );
}
