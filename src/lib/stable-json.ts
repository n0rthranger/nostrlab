type Jsonish =
  | null
  | boolean
  | number
  | string
  | Jsonish[]
  | { [key: string]: Jsonish | undefined };

function normalize(value: Jsonish | undefined): Jsonish {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => normalize(v));

  const out: Record<string, Jsonish> = {};
  for (const key of Object.keys(value).sort()) {
    const next = value[key];
    if (next !== undefined) out[key] = normalize(next);
  }
  return out;
}

export function canonicalJson(value: Jsonish | undefined): string {
  return JSON.stringify(normalize(value));
}
