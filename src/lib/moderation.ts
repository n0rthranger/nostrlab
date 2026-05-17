// Operational moderation. We refuse writes from banned pubkeys and hide
// their indexed events on read. The events still exist on Nostr — we just
// don't display them. A "selective indexer", not censorship.

import { prisma } from "@/lib/prisma";
import { normalizePubkey } from "@/lib/nostr/encode";

export async function isBanned(pubkey: string): Promise<boolean> {
  const row = await prisma.bannedPubkey.findUnique({ where: { pubkey } });
  return !!row;
}

/** Pre-fetched banned-pubkey set for read paths. Tiny in-memory snapshot. */
export async function bannedSet(): Promise<Set<string>> {
  const all = await prisma.bannedPubkey.findMany({ select: { pubkey: true } });
  return new Set(all.map((r) => r.pubkey));
}

/** Returns true iff the given hex pubkey matches the configured admin npub. */
export function isAdmin(pubkey: string): boolean {
  const adminEnv = process.env.NOSTRLAB_ADMIN_PUBKEY;
  if (!adminEnv) return false;
  try {
    const adminHex = normalizePubkey(adminEnv);
    return adminHex.toLowerCase() === pubkey.toLowerCase();
  } catch {
    return false;
  }
}

export function isAdminConfigured(): boolean {
  return !!process.env.NOSTRLAB_ADMIN_PUBKEY;
}
