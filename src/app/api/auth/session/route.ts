import { NextResponse } from "next/server";
import { verifyAuthEnvelope } from "@/lib/auth";
import { createSessionCookie, sessionCookieOptions, clearSessionCookieOptions, SESSION_COOKIE, getSessionPubkey } from "@/lib/session";
import { nostrEventSchema } from "@/lib/validation";

const sessionSchema = nostrEventSchema.pick({
  id: true,
  pubkey: true,
  kind: true,
  created_at: true,
  tags: true,
  content: true,
  sig: true,
});

export async function GET() {
  const pubkey = await getSessionPubkey();
  return NextResponse.json({ pubkey });
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const parsed = sessionSchema.safeParse((body as { signedAuthEvent?: unknown })?.signedAuthEvent);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const auth = verifyAuthEnvelope(parsed.data, {
    expectedAction: "session.login",
    expectedTags: { app: "nostrlab" },
  });
  if (!auth.ok || !auth.pubkey) {
    return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });
  }

  const res = NextResponse.json({ pubkey: auth.pubkey });
  res.cookies.set(SESSION_COOKIE, createSessionCookie(auth.pubkey), sessionCookieOptions());
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", clearSessionCookieOptions());
  return res;
}
