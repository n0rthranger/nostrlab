import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=300",
  };
}

function parseNames(): Record<string, string> {
  const names: Record<string, string> = {};
  const raw = process.env.NOSTRLAB_NIP05_NAMES ?? "";
  for (const entry of raw.split(/[,\n;]/)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.includes("=") ? "=" : ":";
    const [rawName, rawPubkey] = trimmed.split(separator);
    const name = rawName?.trim().toLowerCase();
    const pubkey = rawPubkey?.trim().toLowerCase();
    if (!name || !/^[a-z0-9_.-]+$/.test(name)) continue;
    if (!pubkey || !/^[0-9a-f]{64}$/.test(pubkey)) continue;
    names[name] = pubkey;
  }
  return names;
}

function relayList() {
  return (process.env.NOSTR_RELAYS ?? process.env.NEXT_PUBLIC_NOSTR_RELAYS ?? "")
    .split(",")
    .map((relay) => relay.trim())
    .filter((relay) => relay.startsWith("wss://"));
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function GET(req: Request) {
  const url = new URL(req.url);
  const requestedName = url.searchParams.get("name")?.trim().toLowerCase() ?? null;
  const names = parseNames();
  const selected = requestedName
    ? names[requestedName] ? { [requestedName]: names[requestedName] } : {}
    : names;
  const relays = relayList();
  const relayMap = Object.fromEntries(
    Object.values(selected).map((pubkey) => [pubkey, relays])
  );

  return NextResponse.json(
    { names: selected, relays: relayMap },
    { headers: corsHeaders() }
  );
}
