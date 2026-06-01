import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPubkey } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const pubkey = await getSessionPubkey();
  if (!pubkey) return NextResponse.json({ error: "session required" }, { status: 401 });
  const { id } = await params;
  const deleted = await prisma.savedEventSearch.deleteMany({
    where: { id, pubkey },
  });
  if (deleted.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
