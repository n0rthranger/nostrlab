import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { userToDTO } from "@/lib/dto";
import { normalizePubkey } from "@/lib/nostr/encode";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ pubkey: string }> }) {
  const { pubkey: raw } = await params;
  let pubkey: string;
  try { pubkey = normalizePubkey(raw); } catch { return NextResponse.json({ error: "bad pubkey" }, { status: 400 }); }

  const user = await prisma.user.findUnique({ where: { pubkey } });
  if (!user) return NextResponse.json(userToDTO(null, pubkey));
  return NextResponse.json(userToDTO(user));
}
