import { NextResponse } from "next/server";
import { normalizePubkey } from "@/lib/nostr/encode";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = process.env.NOSTRLAB_ADMIN_PUBKEY;
  if (!env) return NextResponse.json({ adminPubkey: null });
  try {
    return NextResponse.json({ adminPubkey: normalizePubkey(env) });
  } catch {
    return NextResponse.json({ adminPubkey: null, error: "invalid NOSTRLAB_ADMIN_PUBKEY" });
  }
}
