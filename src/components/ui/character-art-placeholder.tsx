import { cn } from "@/lib/utils";

const PALETTES: Record<string, [string, string, string]> = {
  purple: ["#9333ea", "#4c1d95", "#22d3ee"],
  cyan: ["#22d3ee", "#0e7490", "#c084fc"],
  pink: ["#f472b6", "#7c3aed", "#22d3ee"],
  amber: ["#f59e0b", "#7c3aed", "#22d3ee"],
};

interface CharacterArtPlaceholderProps {
  seed: string;
  palette?: keyof typeof PALETTES;
  className?: string;
  emoji?: string;
}

// Deterministic pseudo-random blob shape from a seed string, so the same
// character always renders the same placeholder art.
function hashToShapes(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = (n: number) => {
    h = (h * 1103515245 + 12345) >>> 0;
    return (h % n) / n;
  };
  return {
    cx1: 20 + rand(60),
    cy1: 15 + rand(50),
    cx2: 60 + rand(35),
    cy2: 50 + rand(45),
    r1: 30 + rand(25),
    r2: 20 + rand(20),
    rot: rand(360),
  };
}

export function CharacterArtPlaceholder({
  seed,
  palette = "purple",
  className,
  emoji = "✦",
}: CharacterArtPlaceholderProps) {
  const [c1, c2, c3] = PALETTES[palette];
  const s = hashToShapes(seed);

  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-xl",
        className
      )}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id={`g-${seed}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="#0d0a14" />
        <circle cx={s.cx1} cy={s.cy1} r={s.r1} fill={`url(#g-${seed})`} opacity="0.85" />
        <circle cx={s.cx2} cy={s.cy2} r={s.r2} fill={c3} opacity="0.5" />
        <rect width="100" height="100" fill="url(#g-${seed})" opacity="0.06" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-4xl">
        <span style={{ filter: "drop-shadow(0 0 12px rgba(0,0,0,0.4))" }}>{emoji}</span>
      </div>
      <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium tracking-wide text-lf-text-dim backdrop-blur-sm">
        Demo
      </span>
    </div>
  );
}
