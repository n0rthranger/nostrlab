import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools";
import { buildEventListing, buildRsvp, eventCoordinate, rsvpDTag } from "../src/lib/nostr/event-builder";

const base = process.env.NOSTRLAB_LOAD_BASE_URL ?? process.env.NOSTRLAB_E2E_BASE_URL ?? "http://localhost:3030";
const users = Math.max(1, Math.min(250, Number(process.env.NOSTRLAB_LOAD_USERS ?? 30)));
const runId = Date.now().toString(36);

function makeUser() {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  return { sk, pubkey };
}

async function json(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { res, body };
}

async function main() {
  const organizer = makeUser();
  const dTag = `load-${runId}`;
  const startsAt = new Date(Date.now() + 5 * 86_400_000);
  const signedEvent = finalizeEvent(buildEventListing({
    pubkey: organizer.pubkey,
    dTag,
    title: `Load Smoke Meetup ${runId}`,
    description: "Concurrent RSVP load smoke test.",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 90 * 60_000),
    city: "Chicago",
    venue: "NostrLab Load Hall",
    mode: "offline",
    capacity: users,
    tags: ["load", "smoke", "meetup"],
  }), organizer.sk);

  let r = await json("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedEvent }),
  });
  if (!r.res.ok || !r.body.id) throw new Error(`event create failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  const eventId = r.body.id as string;

  const coord = eventCoordinate(organizer.pubkey, dTag);
  const attendees = Array.from({ length: users }, makeUser);
  const started = Date.now();
  const results = await Promise.all(attendees.map(async (attendee) => {
    const signedEvent = finalizeEvent(buildRsvp({
      pubkey: attendee.pubkey,
      eventCoordinate: coord,
      organizerPubkey: organizer.pubkey,
      status: "accepted",
      dTag: rsvpDTag(coord),
    }), attendee.sk);
    const attempt = await json(`/api/events/${eventId}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedEvent }),
    });
    return attempt.res.status;
  }));
  const ms = Date.now() - started;
  const ok = results.filter((status) => status === 200).length;
  const failed = results.length - ok;
  if (failed > 0) throw new Error(`RSVP load had ${failed} failures: ${JSON.stringify(results)}`);

  r = await json(`/api/events?q=${encodeURIComponent(runId)}`);
  if (!r.res.ok || !Array.isArray(r.body.events) || !r.body.events.some((event: any) => event.id === eventId)) {
    throw new Error(`created event missing from search: ${JSON.stringify(r.body)}`);
  }

  console.log(`PASS load smoke - ${ok} concurrent RSVPs in ${ms}ms against ${base}`);
}

main().catch((err) => {
  console.error("LOAD_SMOKE_ERROR", err instanceof Error ? err.stack : err);
  process.exit(1);
});
