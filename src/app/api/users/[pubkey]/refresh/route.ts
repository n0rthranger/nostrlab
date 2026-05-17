import { NextResponse } from "next/server";
import { ensureUser } from "@/lib/nostr/profile";
import { userToDTO } from "@/lib/dto";
import { normalizePubkey } from "@/lib/nostr/encode";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(_req: Request, { params }: { params: Promise<{ pubkey: string }> }) {
  const { pubkey: raw } = await params;
  let pubkey: string;
  try { pubkey = normalizePubkey(raw); } catch { return NextResponse.json({ error: "bad pubkey" }, { status: 400 }); }
  const rl = await rateLimit(`profile-refresh:${pubkey}`, { capacity: 4, refillPerSec: 1 / 60 });
  if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });

  // Force a re-fetch by clearing the cache window.
  const { prisma } = await import("@/lib/prisma");
  await prisma.user.updateMany({
    where: { pubkey },
    data: { profileFetched: null },
  });

  const user = await ensureUser(pubkey);
  return NextResponse.json(userToDTO(user));
}
