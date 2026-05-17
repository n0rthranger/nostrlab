import crypto from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "nostrlab_session";

const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

interface SessionPayload {
  pubkey: string;
  exp: number;
}

function sessionSecret(): string {
  const secret = process.env.NOSTRLAB_SESSION_SECRET ?? process.env.NOSTRLAB_APP_NSEC;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("NOSTRLAB_SESSION_SECRET must be set in production");
  }
  return secret ?? "nostrlab-dev-session-secret";
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(data).digest("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function createSessionCookie(pubkey: string): string {
  const payload: SessionPayload = {
    pubkey: pubkey.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

function verifySessionCookie(raw: string | undefined): SessionPayload | null {
  if (!raw) return null;
  const [encoded, sig] = raw.split(".");
  if (!encoded || !sig || !timingSafeEqual(sign(encoded), sig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!/^[0-9a-f]{64}$/i.test(payload.pubkey)) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSessionPubkey(): Promise<string | null> {
  const jar = await cookies();
  return verifySessionCookie(jar.get(SESSION_COOKIE)?.value)?.pubkey ?? null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  };
}

export function clearSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}
