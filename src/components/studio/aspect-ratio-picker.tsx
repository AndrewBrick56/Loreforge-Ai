"use client";

import type { AspectRatio } from "@/types/character";
import { cn } from "@/lib/utils";

const RATIOS: { value: AspectRatio; label: string; box: string }[] = [
  { value: "1:1", label: "Square", box: "w-4 h-4" },
  { value: "3:4", label: "Portrait", box: "w-3.5 h-[18px]" },
  { value: "4:3", label: "Landscape", box: "w-[18px] h-3.5" },
  { value: "9:16", label: "Tall", box: "w-3 h-5" },
  { value: "16:9", label: "Wide", box: "w-5 h-3" },
];

interface AspectRatioPickerProps {
  value: AspectRatio;
  onChange: (ratio: AspectRatio) => void;
}

export function AspectRatioPicker({ value, onChange }: AspectRatioPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {RATIOS.map((r) => {
        const active = r.value === value;
        return (
          <button
            key={r.value}
            type="button"
            onClick={() => onChange(r.value)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all cursor-pointer",
              active
                ? "border-lf-purple-light bg-lf-purple/20 text-white"
                : "border-white/10 text-lf-text-dim hover:border-white/25 hover:text-lf-text"
            )}
          >
            <span className={cn("rounded-[2px] border border-current", r.box)} />
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
