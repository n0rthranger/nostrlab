// Profile metadata cache. Resolves a pubkey to a User row, fetching kind:0
// from relays if we don't have it yet (or if it's stale).

import { prisma } from "@/lib/prisma";
import { fetchProfileMetadata } from "./relay-pool";
import { hexToNpub } from "./encode";

const PROFILE_TTL_MS = 1000 * 60 * 60 * 6; // 6h

interface Kind0Content {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  lud16?: string;
  lud06?: string;
  website?: string;
}

function safeParseKind0(content: string): Kind0Content {
  try {
    const parsed = JSON.parse(content);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export async function ensureUser(pubkey: string) {
  const existing = await prisma.user.findUnique({ where: { pubkey } });
  if (existing) {
    const fresh =
      existing.profileFetched &&
      Date.now() - existing.profileFetched.getTime() < PROFILE_TTL_MS;
    if (fresh) return existing;
  }

  const npub = hexToNpub(pubkey);
  const evt = await fetchProfileMetadata(pubkey);
  const meta = evt ? safeParseKind0(evt.content) : {};

  return prisma.user.upsert({
    where: { pubkey },
    create: {
      pubkey,
      npub,
      displayName: meta.display_name ?? meta.name,
      name: meta.name,
      about: meta.about,
      picture: meta.picture,
      banner: meta.banner,
      nip05: meta.nip05,
      lud16: meta.lud16 ?? meta.lud06,
      website: meta.website,
      profileFetched: new Date(),
    },
    update: {
      displayName: meta.display_name ?? meta.name ?? existing?.displayName,
      name: meta.name ?? existing?.name,
      about: meta.about ?? existing?.about,
      picture: meta.picture ?? existing?.picture,
      banner: meta.banner ?? existing?.banner,
      nip05: meta.nip05 ?? existing?.nip05,
      lud16: meta.lud16 ?? meta.lud06 ?? existing?.lud16,
      website: meta.website ?? existing?.website,
      profileFetched: new Date(),
    },
  });
}
