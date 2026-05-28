// Server-side auth: we don't run a session. Every privileged call carries a
// freshly-signed Nostr event whose pubkey IS the caller's identity.
// We verify (a) the signature, (b) that created_at is recent, (c) any
// challenge tags we expected.

import type { NostrEvent } from "@/lib/nostr/types";
import { verifyNostrEvent } from "@/lib/nostr/verify";
import { canonicalJson } from "@/lib/stable-json";
import crypto from "node:crypto";

const MAX_AUTH_AGE_SEC = 5 * 60;
const NIP98_MAX_AUTH_AGE_SEC = 60;

export interface AuthCheckOptions {
  expectedAction?: string; // matched against an "action" tag if present
  expectedTags?: Record<string, string>;
  expectedPayload?: Parameters<typeof canonicalJson>[0];
  maxAgeSec?: number;
  request?: Request;
}

export interface AuthCheckResult {
  ok: boolean;
  pubkey?: string;
  reason?: string;
}

export function verifyAuthEnvelope(
  evt: NostrEvent,
  opts: AuthCheckOptions = {}
): AuthCheckResult {
  if (!verifyNostrEvent(evt)) {
    return { ok: false, reason: "bad signature" };
  }
  const ageSec = Math.floor(Date.now() / 1000) - evt.created_at;
  if (ageSec > (opts.maxAgeSec ?? MAX_AUTH_AGE_SEC) || ageSec < -60) {
    return { ok: false, reason: "stale auth event" };
  }
  const nip98 = verifyNip98IfPresent(evt, opts);
  if (!nip98.ok) return nip98;
  if (opts.expectedAction) {
    const action = evt.tags.find((t) => t[0] === "action")?.[1];
    if (action !== opts.expectedAction) {
      return { ok: false, reason: "wrong action" };
    }
  }
  for (const [name, expected] of Object.entries(opts.expectedTags ?? {})) {
    const actual = evt.tags.find((t) => t[0] === name)?.[1];
    if (actual !== expected) {
      return { ok: false, reason: `wrong ${name}` };
    }
  }
  if (opts.expectedPayload !== undefined) {
    const expected = hashAuthPayloadSync(opts.expectedPayload);
    const actual = evt.tags.find((t) => t[0] === "payload_hash")?.[1] ?? evt.tags.find((t) => t[0] === "payload")?.[1];
    if (actual !== expected) {
      return { ok: false, reason: "payload mismatch" };
    }
  }
  return { ok: true, pubkey: evt.pubkey };
}

function verifyNip98IfPresent(evt: NostrEvent, opts: AuthCheckOptions): AuthCheckResult {
  const url = evt.tags.find((t) => t[0] === "u")?.[1];
  const method = evt.tags.find((t) => t[0] === "method")?.[1];
  if (!url && !method) return { ok: true, pubkey: evt.pubkey };
  if (!url || !method) return { ok: false, reason: "incomplete NIP-98 auth" };
  if (!opts.request) return { ok: false, reason: "NIP-98 request context missing" };
  if (evt.kind !== 27235) return { ok: false, reason: "wrong NIP-98 kind" };
  const ageSec = Math.floor(Date.now() / 1000) - evt.created_at;
  if (ageSec > (opts.maxAgeSec ?? NIP98_MAX_AUTH_AGE_SEC) || ageSec < -60) {
    return { ok: false, reason: "stale NIP-98 auth event" };
  }
  if (!requestUrlCandidates(opts.request).has(url)) return { ok: false, reason: "wrong request URL" };
  if (method.toUpperCase() !== opts.request.method.toUpperCase()) return { ok: false, reason: "wrong request method" };
  if (opts.expectedPayload !== undefined) {
    const expected = hashAuthPayloadSync(opts.expectedPayload);
    const actual = evt.tags.find((t) => t[0] === "payload")?.[1];
    if (actual !== expected) return { ok: false, reason: "request payload mismatch" };
  }
  return { ok: true, pubkey: evt.pubkey };
}

export function authEventFromHeader(req: Request): NostrEvent | null {
  const auth = req.headers.get("authorization") ?? "";
  const match = /^Nostr\s+(.+)$/i.exec(auth.trim());
  if (!match) return null;
  try {
    const json = Buffer.from(match[1], "base64").toString("utf8");
    return JSON.parse(json) as NostrEvent;
  } catch {
    return null;
  }
}

export function authEventForRequest(req: Request, fallback?: NostrEvent): NostrEvent | undefined {
  return authEventFromHeader(req) ?? fallback;
}

function requestUrlCandidates(req: Request): Set<string> {
  const actual = new URL(req.url);
  const candidates = new Set<string>([actual.toString()]);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? actual.protocol.replace(/:$/, "");
    candidates.add(`${proto}://${host}${actual.pathname}${actual.search}`);
  }
  return candidates;
}

function hashAuthPayloadSync(value: Parameters<typeof canonicalJson>[0]): string {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}
