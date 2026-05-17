// Per-event deterministic gradient. Same input always produces the same gradient.

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface GradientSpec {
  cssLight: string;
  cssDark: string;
  cssSolid: string;
  hue: number;
}

const PALETTES: { from: number; to: number }[] = [
  { from: 18, to: 340 },   // orange → magenta
  { from: 198, to: 240 },  // sky → indigo
  { from: 152, to: 200 },  // emerald → cyan
  { from: 280, to: 320 },  // purple → pink
  { from: 28, to: 48 },    // amber → yellow
  { from: 230, to: 280 },  // blue → violet
  { from: 340, to: 18 },   // rose → orange
  { from: 180, to: 220 },  // teal → blue
];

export function eventGradient(seed: string): GradientSpec {
  const h = hash(seed);
  const palette = PALETTES[h % PALETTES.length];
  const from = palette.from;
  const to = palette.to;
  const angle = 110 + (h % 60);

  return {
    cssLight: `linear-gradient(${angle}deg, hsl(${from} 92% 76%) 0%, hsl(${to} 80% 64%) 60%, hsl(${(to + 30) % 360} 70% 56%) 100%)`,
    cssDark:  `linear-gradient(${angle}deg, hsl(${from} 70% 30%) 0%, hsl(${to} 60% 26%) 60%, hsl(${(to + 30) % 360} 55% 22%) 100%)`,
    cssSolid: `hsl(${from} 80% 60%)`,
    hue: from,
  };
}

export function avatarGradient(seed: string): string {
  const h = hash(seed);
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 70%), hsl(${(hue + 40) % 360} 60% 50%))`;
}
