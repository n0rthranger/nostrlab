import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { buildEventListing, eventCoordinate } from "../src/lib/nostr/event-builder";
import { ingestEventListing } from "../src/lib/nostr/ingest-event";
import { ingestRsvp } from "../src/lib/nostr/ingest-rsvp";
import { prisma } from "../src/lib/prisma";
import { closeRelayPool } from "../src/lib/nostr/relay-pool";

const runId = Date.now().toString(36);

function user() {
  const sk = generateSecretKey();
  return { sk, pubkey: getPublicKey(sk) };
}

async function main() {
  const organizer = user();
  const attendee = user();
  const dTag = `e2e-colon-${runId}:room:main`;
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const coord = eventCoordinate(organizer.pubkey, dTag);

  const event = finalizeEvent(buildEventListing({
    pubkey: organizer.pubkey,
    dTag,
    title: `E2E Colon Coordinate Meetup ${runId}`,
    description: "Regression test for external RSVP ingest when the event d tag contains colons.",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
    city: "Chicago",
    venue: "NostrLab Test Room",
    mode: "offline",
    capacity: 20,
    tags: ["e2e", "nostrlab", "meetup"],
  }), organizer.sk);

  const eventResult = await ingestEventListing(event, {
    trustNostrLabSource: true,
    allowNostrLabHashtag: true,
  });
  if (eventResult.status !== "stored" || !eventResult.id) {
    throw new Error(`event ingest failed: ${JSON.stringify(eventResult)}`);
  }

  const rsvp = finalizeEvent({
    kind: 31925,
    created_at: Math.floor(Date.now() / 1000),
    content: "External RSVP regression",
    tags: [
      ["a", coord],
      ["d", `rsvp:${coord}`],
      ["status", "accepted"],
      ["fb", "busy"],
      ["p", organizer.pubkey],
    ],
  }, attendee.sk);

  const rsvpResult = await ingestRsvp(rsvp);
  if (rsvpResult !== "stored") {
    throw new Error(`RSVP ingest returned ${rsvpResult}`);
  }

  const row = await prisma.rsvp.findUnique({
    where: { eventId_pubkey: { eventId: eventResult.id, pubkey: attendee.pubkey } },
  });
  if (!row || row.status !== "GOING" || row.nostrId !== rsvp.id) {
    throw new Error(`RSVP row mismatch: ${JSON.stringify(row)}`);
  }

  console.log(`PASS external RSVP ingest with colon d-tag - event=${eventResult.id} status=${row.status}`);
}

main()
  .catch((e) => {
    console.error("FAIL e2e-nostr-ingest", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    closeRelayPool();
    await prisma.$disconnect();
  });
