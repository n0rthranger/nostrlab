// Bech32 encode/decode shims around nostr-tools/nip19.
import { nip19 } from "nostr-tools";

export function hexToNpub(hex: string): string {
  return nip19.npubEncode(hex);
}

function npubToHex(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== "npub") throw new Error("not an npub");
  return decoded.data as string;
}

function isHexPubkey(s: string): boolean {
  return /^[0-9a-f]{64}$/i.test(s);
}

function isNpub(s: string): boolean {
  return s.startsWith("npub1") && s.length > 60;
}

export function normalizePubkey(input: string): string {
  if (isHexPubkey(input)) return input.toLowerCase();
  if (isNpub(input)) return npubToHex(input).toLowerCase();
  throw new Error("invalid pubkey");
}

/** nevent — points at an immutable event id, optionally with relay hints. */
export function eventToNevent(opts: {
  id: string;
  pubkey: string;
  relays?: string[];
  kind?: number;
}): string {
  return nip19.neventEncode({
    id: opts.id,
    author: opts.pubkey,
    relays: opts.relays,
    kind: opts.kind,
  });
}

/** naddr — points at a parameterized replaceable address (kind:pubkey:dTag). */
export function eventToNaddr(opts: {
  kind: number;
  pubkey: string;
  dTag: string;
  relays?: string[];
}): string {
  return nip19.naddrEncode({
    identifier: opts.dTag,
    pubkey: opts.pubkey,
    kind: opts.kind,
    relays: opts.relays,
  });
}
