export function parseRelayList(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("ws://") || s.startsWith("wss://"));
}

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

export function getServerRelays(): string[] {
  return parseRelayList(process.env.NOSTR_RELAYS, DEFAULT_RELAYS);
}

export function getClientRelays(): string[] {
  // Available to the browser; do NOT put server-only relays here.
  return parseRelayList(process.env.NEXT_PUBLIC_NOSTR_RELAYS, DEFAULT_RELAYS);
}
