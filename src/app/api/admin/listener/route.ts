import { NextResponse } from "next/server";
import { listenerStats, ensureRelayListener } from "@/lib/nostr/relay-listener";
import { getSessionPubkey } from "@/lib/session";
import { isAdmin, isAdminConfigured } from "@/lib/moderation";

export const dynamic = "force-dynamic";

// Diagnostic endpoint — reports the relay listener's status and ingest counts.
// Triggers a boot if the singleton hasn't started yet (defensive).
export async function GET() {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "admin disabled" }, { status: 503 });
  }
  const pubkey = await getSessionPubkey();
  if (!pubkey || !isAdmin(pubkey)) {
    return NextResponse.json({ error: "not admin" }, { status: 403 });
  }
  await ensureRelayListener();
  return NextResponse.json(listenerStats());
}
