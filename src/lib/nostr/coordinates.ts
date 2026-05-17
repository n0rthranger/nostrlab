export interface NostrCoordinate {
  kind: number;
  pubkey: string;
  dTag: string;
}

/**
 * Parse Nostr address coordinates of the form `<kind>:<pubkey>:<d-tag>`.
 * The d-tag may itself contain colons, so only the first two separators are
 * structural.
 */
export function parseNostrCoordinate(raw: string | null | undefined, expectedKind?: number): NostrCoordinate | null {
  if (!raw) return null;

  const first = raw.indexOf(":");
  const second = first >= 0 ? raw.indexOf(":", first + 1) : -1;
  if (first <= 0 || second <= first + 1 || second >= raw.length - 1) return null;

  const kindRaw = raw.slice(0, first);
  if (!/^\d+$/.test(kindRaw)) return null;
  const kind = Number(kindRaw);
  if (!Number.isSafeInteger(kind) || kind < 0) return null;
  if (expectedKind !== undefined && kind !== expectedKind) return null;

  const pubkey = raw.slice(first + 1, second).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(pubkey)) return null;

  const dTag = raw.slice(second + 1);
  if (!dTag) return null;

  return { kind, pubkey, dTag };
}
