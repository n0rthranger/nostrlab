import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPubkey } from "@/lib/session";
import { isAdmin, isAdminConfigured } from "@/lib/moderation";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "admin disabled" }, { status: 503 });
  }
  const pubkey = await getSessionPubkey();
  if (!pubkey || !isAdmin(pubkey)) {
    return NextResponse.json({ error: "not admin" }, { status: 403 });
  }
  const list = await prisma.bannedPubkey.findMany({
    orderBy: { bannedAt: "desc" },
    select: { pubkey: true, reason: true, bannedAt: true },
  });
  return NextResponse.json({ list });
}
