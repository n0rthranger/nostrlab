// Custom kinds used by NostrLab.
//       5 — NIP-09 deletion event
//    1111 — NIP-22 comment
//   10002 — NIP-65 relay list metadata
//   10004 — NIP-51 communities list
//   31924 — NIP-52 calendar list
//   31923 — NIP-52 time-based calendar event (the meetup itself)
//   31925 — NIP-52 RSVP
//   31926 — NostrLab ticket proof with hashed ticket secret
//   34550 — NIP-72 moderated community definition
//    4550 — NIP-72 community post approval
//   31990 — NIP-89 application descriptor used in client tags

export const KIND_EVENT_DELETION = 5;        // NIP-09
export const KIND_COMMENT = 1111;            // NIP-22
export const KIND_RELAY_LIST = 10002;        // NIP-65
export const KIND_COMMUNITY_LIST = 10004;    // NIP-51
export const KIND_EVENT_LISTING = 31923;     // NIP-52 time-based event
export const KIND_CALENDAR_LIST = 31924;     // NIP-52 calendar collection
export const KIND_RSVP = 31925;              // NIP-52
export const KIND_TICKET_PROOF = 31926;      // NostrLab custom
export const KIND_COMMUNITY = 34550;         // NIP-72
export const KIND_COMMUNITY_APPROVAL = 4550; // NIP-72
export const KIND_APP_DESCRIPTOR = 31990;    // NIP-89

// NIP-52 RSVP statuses, plus our local `waitlist` extension.
export const RSVP_STATUSES = ["accepted", "tentative", "declined", "waitlist"] as const;
export type RsvpStatusString = (typeof RSVP_STATUSES)[number];

// User-facing labels for the UI. The wire/protocol values stay NIP-52 compliant.
export const RSVP_LABELS: Record<RsvpStatusString, string> = {
  accepted: "Going",
  tentative: "Maybe",
  declined: "Can't go",
  waitlist: "Waitlist",
};

export const EVENT_MODES = ["online", "offline", "hybrid"] as const;
export type EventModeString = (typeof EVENT_MODES)[number];

// NIP-89 client tag identifier. Concrete coordinate is built at runtime from
// NEXT_PUBLIC_NOSTRLAB_APP_PUBKEY.
export const APP_NAME = "nostrlab";
export const APP_D_TAG = "nostrlab";
