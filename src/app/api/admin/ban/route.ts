import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { banPubkeySchema } from "@/lib/validation";
import { authEventForRequest, verifyAuthEnvelope } from "@/lib/auth";
import { isAdmin, isAdminConfigured } from "@/lib/moderation";

export const dynamic = "force-dynamic";

async function authorize(req: Request, expectedAction: string) {
  if (!isAdminConfigured()) {
    return { ok: false as const, status: 503, error: "NOSTRLAB_ADMIN_PUBKEY not set" };
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return { ok: false as const, status: 400, error: "invalid json" }; }
  const parsed = banPubkeySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false as const, status: 400, error: parsed.error.flatten() };
  }
  const authEvent = authEventForRequest(req, parsed.data.signedAuthEvent);
  if (!authEvent) return { ok: false as const, status: 401, error: "missing auth event" };
  const auth = verifyAuthEnvelope(authEvent, {
    expectedAction,
    expectedTags: { p: parsed.data.pubkey },
    expectedPayload: {
      pubkey: parsed.data.pubkey,
      reason: parsed.data.reason ?? null,
    },
    request: req,
  });
  if (!auth.ok || !auth.pubkey) {
    return { ok: false as const, status: 401, error: auth.reason ?? "unauthorized" };
  }
  if (!isAdmin(auth.pubkey)) {
    return { ok: false as const, status: 403, error: "not admin" };
  }
  return { ok: true as const, body: parsed.data, by: auth.pubkey };
}

export async function POST(req: Request) {
  const a = await authorize(req, "moderation.ban");
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  await prisma.bannedPubkey.upsert({
    where: { pubkey: a.body.pubkey },
    create: { pubkey: a.body.pubkey, reason: a.body.reason ?? null, bannedBy: a.by },
    update: { reason: a.body.reason ?? null, bannedBy: a.by },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const a = await authorize(req, "moderation.unban");
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  await prisma.bannedPubkey.delete({ where: { pubkey: a.body.pubkey } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
