import type { User } from "@prisma/client";

type OrganizerIdentity = Pick<User, "nip05" | "website">;

function normalizedHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function nip05Host(nip05: string | null | undefined): string | null {
  if (!nip05) return null;
  const [, domain] = nip05.split("@");
  return domain?.toLowerCase().replace(/^www\./, "") ?? null;
}

function hostMatches(candidate: string | null, verified: string | null): boolean {
  if (!candidate || !verified) return false;
  return candidate === verified || candidate.endsWith(`.${verified}`);
}

export function communityVerificationFor(
  website: string | null | undefined,
  organizer: OrganizerIdentity
): { verifiedAt: Date | null; verifiedMethod: string | null } {
  const websiteHost = normalizedHost(website);
  if (!websiteHost) return { verifiedAt: null, verifiedMethod: null };

  if (hostMatches(websiteHost, nip05Host(organizer.nip05))) {
    return { verifiedAt: new Date(), verifiedMethod: "organizer-nip05-domain" };
  }

  if (hostMatches(websiteHost, normalizedHost(organizer.website))) {
    return { verifiedAt: new Date(), verifiedMethod: "organizer-profile-website" };
  }

  return { verifiedAt: null, verifiedMethod: null };
}
