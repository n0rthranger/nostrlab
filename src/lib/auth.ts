// Server-side auth: we don't run a session. Every privileged call carries a
// freshly-signed Nostr event whose pubkey IS the caller's identity.
// We verify (a) the signature, (b) that created_at is recent, (c) any
// challenge tags we expected.

import type { NostrEvent } from "@/lib/nostr/types";
import { verifyNostrEvent } from "@/lib/nostr/verify";
import { canonicalJson } from "@/lib/stable-json";
import crypto from "node:crypto";

const MAX_AUTH_AGE_SEC = 5 * 60;

export interface AuthCheckOptions {
  expectedAction?: string; // matched against an "action" tag if present
  expectedTags?: Record<string, string>;
  expectedPayload?: Parameters<typeof canonicalJson>[0];
  maxAgeSec?: number;
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
    const actual = evt.tags.find((t) => t[0] === "payload_hash")?.[1];
    if (actual !== expected) {
      return { ok: false, reason: "payload mismatch" };
    }
  }
  return { ok: true, pubkey: evt.pubkey };
}

function hashAuthPayloadSync(value: Parameters<typeof canonicalJson>[0]): string {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}
