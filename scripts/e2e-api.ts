import crypto from "node:crypto";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
} from "nostr-tools";
import { canonicalJson } from "../src/lib/stable-json";
import { buildEventDeletion, buildEventListing, eventCoordinate } from "../src/lib/nostr/event-builder";

const base = process.env.NOSTRLAB_E2E_BASE_URL ?? "http://localhost:3001";
const runId = Date.now().toString(36);

type TestUser = ReturnType<typeof makeUser>;

interface Result {
  name: string;
  detail?: string;
}

const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, detail });
}

function hashPayload(payload: Parameters<typeof canonicalJson>[0]) {
  return crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function makeUser(label: string) {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  return { label, sk, pubkey, npub: nip19.npubEncode(pubkey) };
}

function auth(
  user: TestUser,
  action: string,
  tags: string[][],
  payload?: Parameters<typeof canonicalJson>[0]
) {
  const allTags = [["action", action], ...tags];
  if (payload !== undefined) allTags.push(["payload_hash", hashPayload(payload)]);
  return finalizeEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    tags: allTags,
  }, user.sk);
}

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, init);
}

async function json(path: string, init: RequestInit = {}) {
  const res = await request(path, init);
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

async function session(user: TestUser) {
  const signedAuthEvent = finalizeEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    tags: [["action", "session.login"], ["app", "nostrlab"]],
  }, user.sk);
  const res = await request("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedAuthEvent }),
  });
  if (!res.ok) throw new Error(`session failed ${res.status}: ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("session did not return cookie");
  return setCookie.split(";")[0];
}

async function createEvent(user: TestUser, input: Parameters<typeof buildEventListing>[0]) {
  const signedEvent = finalizeEvent(buildEventListing(input), user.sk);
  const { res, body } = await json("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedEvent }),
  });
  if (!res.ok) throw new Error(`event create failed ${res.status}: ${JSON.stringify(body)}`);
  return body as { id: string; nostrId: string; source: string };
}

function rsvp(user: TestUser, organizer: TestUser, dTag: string, status: string, suffix: string) {
  return finalizeEvent({
    kind: 31925,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    tags: [
      ["d", `rsvp-${runId}-${suffix}`],
      ["a", `31923:${organizer.pubkey}:${dTag}`],
      ["p", organizer.pubkey],
      ["status", status],
    ],
  }, user.sk);
}

async function main() {
  const organizer = makeUser("organizer");
  const attendee = makeUser("attendee");
  const attendee2 = makeUser("attendee2");
  const transferTo = makeUser("transferTo");
  const cohost = makeUser("cohost");
  const paidOrganizer = makeUser("paidOrganizer");
  const organizerCookie = await session(organizer);
  const paidOrganizerCookie = await session(paidOrganizer);
  const attendeeCookie = await session(attendee);
  pass("sessions", "organizer, paid organizer, and attendee cookies established");

  const communityPayload = {
    slug: `e2e-${runId}`,
    name: `E2E Community ${runId}`,
    description: "Automated feature verification community.",
    imageUrl: null,
    website: null,
    tags: ["e2e", "nostrlab"],
    moderators: [cohost.pubkey],
  };
  let r = await json("/api/communities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...communityPayload,
      signedAuthEvent: auth(organizer, "community.create", [["slug", communityPayload.slug]], communityPayload),
    }),
  });
  if (!r.res.ok) throw new Error(`community failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  const community = r.body.community;
  pass("community create", community.slug);

  const communityUpdatePayload = {
    communityId: community.id,
    name: `E2E Community Updated ${runId}`,
    description: "Updated automated feature verification community.",
    imageUrl: null,
    website: null,
    tags: ["e2e", "updated"],
    moderators: [cohost.pubkey],
    transferPubkey: null,
  };
  r = await json(`/api/communities/${community.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...communityUpdatePayload,
      signedAuthEvent: auth(organizer, "community.update", [["community_id", community.id]], communityUpdatePayload),
    }),
  });
  if (!r.res.ok || r.body.community?.name !== communityUpdatePayload.name) {
    throw new Error(`community update failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  pass("community settings update", r.body.community.name);

  r = await json(`/api/communities?host=${organizer.pubkey}`);
  if (!r.res.ok || !r.body.communities?.some((c: any) => c.id === community.id)) {
    throw new Error(`owner host filter missing community: ${JSON.stringify(r.body)}`);
  }
  r = await json(`/api/communities?host=${cohost.pubkey}`);
  if (!r.res.ok || !r.body.communities?.some((c: any) => c.id === community.id)) {
    throw new Error(`approved host filter missing community: ${JSON.stringify(r.body)}`);
  }
  r = await json(`/api/communities?host=${attendee2.pubkey}`);
  if (!r.res.ok || r.body.communities?.some((c: any) => c.id === community.id)) {
    throw new Error(`unapproved host filter leaked community: ${JSON.stringify(r.body)}`);
  }
  pass("community host filter", "owner and approved host only");

  const hostStart = new Date(Date.now() + 36 * 3_600_000);
  const hostEvent = await createEvent(cohost, {
    pubkey: cohost.pubkey,
    dTag: `e2e-host-${runId}`,
    title: `E2E Approved Host Meetup ${runId}`,
    description: "Approved host official community event.",
    startsAt: hostStart,
    endsAt: new Date(hostStart.getTime() + 90 * 60_000),
    city: "Chicago",
    venue: "NostrLab Host Hall",
    mode: "offline",
    capacity: 20,
    tags: ["e2e", "bitcoin"],
    communitySlug: community.slug,
    communityOwnerPubkey: organizer.pubkey,
  });
  pass("approved host official event", hostEvent.id);

  const blockedStart = new Date(Date.now() + 40 * 3_600_000);
  const blockedSignedEvent = finalizeEvent(buildEventListing({
    pubkey: attendee2.pubkey,
    dTag: `e2e-blocked-host-${runId}`,
    title: `E2E Blocked Host Meetup ${runId}`,
    description: "Unapproved host should not publish official community events.",
    startsAt: blockedStart,
    endsAt: new Date(blockedStart.getTime() + 90 * 60_000),
    city: "Chicago",
    venue: "NostrLab Blocked Hall",
    mode: "offline",
    capacity: 20,
    tags: ["e2e", "bitcoin"],
    communitySlug: community.slug,
    communityOwnerPubkey: organizer.pubkey,
  }), attendee2.sk);
  r = await json("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedEvent: blockedSignedEvent }),
  });
  if (r.res.status !== 403 || r.body.message !== "community host approval required") {
    throw new Error(`unapproved community host was not blocked: ${r.res.status} ${JSON.stringify(r.body)}`);
  }
  pass("unapproved host official event blocked", "403");

  const followPayload = { communityId: community.id };
  r = await json(`/api/communities/${community.id}/follow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signedAuthEvent: auth(attendee, "community.follow", [["community_id", community.id]], followPayload),
    }),
  });
  if (!r.res.ok || !r.body.following) {
    throw new Error(`follow failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  pass("community follow", `${r.body.followerCount} follower(s)`);

  const freeDTag = `e2e-free-${runId}`;
  const startsAt = new Date(Date.now() + 2 * 86_400_000);
  const freeEvent = await createEvent(organizer, {
    pubkey: organizer.pubkey,
    dTag: freeDTag,
    title: `E2E Free Meetup ${runId}`,
    description: "Free event API workflow test.",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 2 * 3_600_000),
    city: "Chicago",
    venue: "NostrLab Test Hall",
    mode: "offline",
    capacity: 1,
    tags: ["e2e", "bitcoin"],
    cohostPubkeys: [cohost.pubkey],
    communitySlug: community.slug,
  });
  pass("free event create", freeEvent.id);

  r = await json(`/api/events?q=${encodeURIComponent(runId)}`);
  if (!r.res.ok || !Array.isArray(r.body.events) || !r.body.events.some((e: any) => e.id === freeEvent.id)) {
    throw new Error(`event search did not find free event: ${JSON.stringify(r.body)}`);
  }
  pass("event API search/filter", `${r.body.events.length} result(s)`);

  const deleteDTag = `e2e-delete-${runId}`;
  const deleteStart = new Date(Date.now() + 28 * 3_600_000);
  const deleteSignedEvent = finalizeEvent(buildEventListing({
    pubkey: organizer.pubkey,
    dTag: deleteDTag,
    title: `E2E Mistaken Meetup ${runId}`,
    description: "This event should be deleted through NIP-09.",
    startsAt: deleteStart,
    endsAt: new Date(deleteStart.getTime() + 60 * 60_000),
    city: "Chicago",
    venue: "Delete Test Hall",
    mode: "offline",
    capacity: 20,
    tags: ["e2e", "delete"],
  }), organizer.sk);
  r = await json("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedEvent: deleteSignedEvent }),
  });
  if (!r.res.ok || !r.body.id) throw new Error(`delete fixture create failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  const deleteEventId = r.body.id as string;
  const deletion = finalizeEvent(buildEventDeletion({
    pubkey: organizer.pubkey,
    eventId: deleteSignedEvent.id,
    eventCoordinate: eventCoordinate(organizer.pubkey, deleteDTag),
    reason: "created by mistake",
  }), organizer.sk);
  r = await json(`/api/events/${deleteEventId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedDeletionEvent: deletion }),
  });
  if (!r.res.ok || !r.body.deleted || r.body.deletionNostrId !== deletion.id) {
    throw new Error(`event delete failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  r = await json(`/api/events/${deleteEventId}`);
  if (r.res.status !== 404) throw new Error(`deleted event should 404: ${r.res.status} ${JSON.stringify(r.body)}`);
  r = await json("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedEvent: deleteSignedEvent }),
  });
  if (r.res.status !== 400 || r.body.message !== "deleted by organizer") {
    throw new Error(`deleted event tombstone did not block reindex: ${r.res.status} ${JSON.stringify(r.body)}`);
  }
  pass("event deletion", "NIP-09 tombstone blocks reindex");

  r = await json(`/api/events/${freeEvent.id}/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedEvent: rsvp(attendee, organizer, freeDTag, "accepted", "a1") }),
  });
  if (!r.res.ok || !r.body.ticketId || !r.body.ticketSecret) {
    throw new Error(`free RSVP/ticket failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  const freeTicket = { id: r.body.ticketId as string, secret: r.body.ticketSecret as string };
  pass("free RSVP issues ticket", freeTicket.id);

  r = await json(`/api/events/${freeEvent.id}/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedEvent: rsvp(attendee2, organizer, freeDTag, "accepted", "a2") }),
  });
  if (r.res.status !== 409 || !r.body.canWaitlist) {
    throw new Error(`capacity did not block accepted RSVP: ${r.res.status} ${JSON.stringify(r.body)}`);
  }
  pass("capacity blocks extra RSVP", "409 with canWaitlist");

  r = await json(`/api/events/${freeEvent.id}/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedEvent: rsvp(attendee2, organizer, freeDTag, "waitlist", "w2") }),
  });
  if (!r.res.ok) throw new Error(`waitlist RSVP failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  pass("waitlist RSVP", "accepted");

  r = await json(`/api/events/${freeEvent.id}/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedEvent: rsvp(attendee, organizer, freeDTag, "declined", "d1") }),
  });
  if (!r.res.ok) throw new Error(`decline RSVP failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  const promotePayload = { eventId: freeEvent.id, pubkey: attendee2.pubkey };
  r = await json(`/api/events/${freeEvent.id}/waitlist/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pubkey: attendee2.pubkey,
      signedAuthEvent: auth(organizer, "waitlist.promote", [["e", freeEvent.id]], promotePayload),
    }),
  });
  if (!r.res.ok || r.body.pubkey !== attendee2.pubkey || !r.body.ticketId) {
    throw new Error(`waitlist promotion failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  pass("waitlist promotion", r.body.ticketId);

  const freeRaceDTag = `e2e-free-race-${runId}`;
  const freeRaceEvent = await createEvent(organizer, {
    pubkey: organizer.pubkey,
    dTag: freeRaceDTag,
    title: `E2E Free Capacity Race ${runId}`,
    description: "Concurrent free RSVP capacity test.",
    startsAt: new Date(startsAt.getTime() + 4 * 3_600_000),
    endsAt: new Date(startsAt.getTime() + 5 * 3_600_000),
    city: "Chicago",
    venue: "NostrLab Race Hall",
    mode: "offline",
    capacity: 1,
    tags: ["e2e", "race"],
  });
  const freeRaceUsers = Array.from({ length: 8 }, (_, i) => makeUser(`freeRace${i}`));
  const freeRaceResults = await Promise.all(freeRaceUsers.map(async (user, i) => {
    const attempt = await json(`/api/events/${freeRaceEvent.id}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedEvent: rsvp(user, organizer, freeRaceDTag, "accepted", `race-${i}`) }),
    });
    return { status: attempt.res.status, body: attempt.body };
  }));
  const freeRaceIssued = freeRaceResults.filter((result) => result.status === 200 && result.body.ticketId).length;
  const freeRaceRejected = freeRaceResults.filter((result) => result.status === 409 && result.body.canWaitlist).length;
  if (freeRaceIssued !== 1 || freeRaceRejected !== freeRaceUsers.length - 1) {
    throw new Error(`free capacity race failed: ${JSON.stringify(freeRaceResults)}`);
  }
  pass("concurrent free capacity lock", `${freeRaceIssued} issued, ${freeRaceRejected} rejected`);

  const privateDTag = `e2e-private-${runId}`;
  const privateEvent = await createEvent(organizer, {
    pubkey: organizer.pubkey,
    dTag: privateDTag,
    title: `E2E Private RSVP Meetup ${runId}`,
    description: "Private RSVP API workflow test.",
    startsAt: new Date(startsAt.getTime() + 6 * 3_600_000),
    endsAt: new Date(startsAt.getTime() + 7 * 3_600_000),
    city: "Chicago",
    venue: "NostrLab Private Hall",
    mode: "offline",
    capacity: 5,
    tags: ["e2e", "privacy"],
  });
  const privatePayload = { eventId: privateEvent.id, status: "accepted", private: true };
  r = await json(`/api/events/${privateEvent.id}/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "accepted",
      private: true,
      signedAuthEvent: auth(attendee, "rsvp.private", [["event_id", privateEvent.id], ["status", "accepted"]], privatePayload),
    }),
  });
  if (!r.res.ok || !r.body.ticketId || !r.body.ticketSecret) {
    throw new Error(`private RSVP failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  r = await json(`/api/events/${privateEvent.id}`);
  if (!r.res.ok || r.body.event?.rsvpsByStatus?.GOING !== 1 || r.body.event?.recentRsvps?.some((item: any) => item.user?.pubkey === attendee.pubkey)) {
    throw new Error(`private RSVP leaked public attendee: ${JSON.stringify(r.body)}`);
  }
  pass("private RSVP", "counted without public attendee leak");

  r = await json(`/api/tickets/${freeTicket.id}/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: freeTicket.secret }),
  });
  if (!r.res.ok || !r.body.ok) throw new Error(`ticket reveal failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  pass("ticket reveal", "secret verified");

  const recoverPayload = { ticketId: freeTicket.id };
  r = await json(`/api/tickets/${freeTicket.id}/recover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signedAuthEvent: auth(organizer, "ticket.recover", [["t", freeTicket.id]], recoverPayload),
    }),
  });
  if (!r.res.ok || !String(r.body.ticketUrl).includes(`#secret=${freeTicket.secret}`)) {
    throw new Error(`ticket recovery failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  pass("organizer ticket recovery", "secret link returned");

  const checkPayload = { eventId: freeEvent.id, ticketId: freeTicket.id, ticketSecret: freeTicket.secret };
  r = await json(`/api/tickets/${freeTicket.id}/check-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticketSecret: freeTicket.secret,
      signedAuthEvent: auth(organizer, "checkin", [["event_id", freeEvent.id], ["t", freeTicket.id]], checkPayload),
    }),
  });
  if (!r.res.ok || !r.body.ok) throw new Error(`check-in failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  pass("check-in", "first scan admitted");

  r = await json(`/api/tickets/${freeTicket.id}/check-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticketSecret: freeTicket.secret,
      signedAuthEvent: auth(organizer, "checkin", [["event_id", freeEvent.id], ["t", freeTicket.id]], checkPayload),
    }),
  });
  if (!r.res.ok || !r.body.alreadyCheckedIn) {
    throw new Error(`duplicate check-in not detected ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  pass("duplicate check-in protection", "alreadyCheckedIn");

  const commentPayload = { eventId: freeEvent.id, body: "E2E discussion comment" };
  r = await json(`/api/events/${freeEvent.id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...commentPayload,
      signedAuthEvent: auth(attendee, "event.comment", [["e", freeEvent.id]], commentPayload),
    }),
  });
  if (!r.res.ok || !r.body.comment) throw new Error(`comment failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  pass("event discussion comment", r.body.comment.id);

  const announcementPayload = { eventId: freeEvent.id, title: "E2E Update", body: "Automated announcement." };
  r = await json(`/api/events/${freeEvent.id}/announcements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...announcementPayload,
      signedAuthEvent: auth(organizer, "event.announcement", [["e", freeEvent.id]], announcementPayload),
    }),
  });
  if (!r.res.ok || !r.body.announcement) {
    throw new Error(`announcement failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  pass("organizer announcement", r.body.announcement.id);

  const csvRes = await request(`/api/events/${freeEvent.id}/attendees.csv`, {
    headers: { Cookie: organizerCookie },
  });
  const csvText = await csvRes.text();
  if (!csvRes.ok || !csvText.includes(attendee.pubkey) || !csvText.includes("private_rsvp")) {
    throw new Error(`attendee csv failed ${csvRes.status}: ${csvText.slice(0, 200)}`);
  }
  pass("attendee CSV export", "downloadable");

  r = await json("/api/notifications", { headers: { Cookie: attendeeCookie } });
  if (!r.res.ok || !Array.isArray(r.body.notifications) || !r.body.notifications.some((n: any) => n.type === "ANNOUNCEMENT" && n.event?.id === freeEvent.id)) {
    throw new Error(`notification missing: ${JSON.stringify(r.body)}`);
  }
  pass("notifications", `${r.body.notifications.length} notification(s)`);

  const cancelPayload = { eventId: freeEvent.id, reason: "E2E cancellation test" };
  r = await json(`/api/events/${freeEvent.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "cancel",
      reason: cancelPayload.reason,
      signedAuthEvent: auth(organizer, "event.cancel", [["e", freeEvent.id]], cancelPayload),
    }),
  });
  if (!r.res.ok || r.body.status !== "CANCELLED") {
    throw new Error(`cancel failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  pass("event cancellation", "CANCELLED");

  r = await json(`/api/events/${freeEvent.id}/ics`);
  if (!r.res.ok || !String(r.body).includes("STATUS:CANCELLED")) {
    throw new Error(`ics cancelled status failed ${r.res.status}: ${String(r.body).slice(0, 120)}`);
  }
  pass("calendar export", "ICS includes cancelled status");

  const blockedPayload = { eventId: freeEvent.id, body: "blocked after cancel" };
  r = await json(`/api/events/${freeEvent.id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...blockedPayload,
      signedAuthEvent: auth(attendee, "event.comment", [["e", freeEvent.id]], blockedPayload),
    }),
  });
  if (r.res.status !== 409) throw new Error(`cancelled comment should fail: ${r.res.status} ${JSON.stringify(r.body)}`);
  pass("cancelled event blocks comments", "409");

  const restorePayload = { eventId: freeEvent.id, reason: null };
  r = await json(`/api/events/${freeEvent.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "restore",
      reason: null,
      signedAuthEvent: auth(organizer, "event.restore", [["e", freeEvent.id]], restorePayload),
    }),
  });
  if (!r.res.ok || r.body.status !== "ACTIVE") {
    throw new Error(`restore failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  pass("event restore", "ACTIVE");

  const paidDTag = `e2e-paid-${runId}`;
  const paidStart = new Date(Date.now() + 3 * 86_400_000);
  const paidEvent = await createEvent(paidOrganizer, {
    pubkey: paidOrganizer.pubkey,
    dTag: paidDTag,
    title: `E2E Paid Meetup ${runId}`,
    description: "Paid event API workflow test.",
    startsAt: paidStart,
    endsAt: new Date(paidStart.getTime() + 3_600_000),
    city: "Chicago",
    venue: "Paid Test Hall",
    mode: "offline",
    capacity: 10,
    priceSats: 123,
    tags: ["e2e", "lightning"],
  });
  pass("paid event create", paidEvent.id);

  const tiersPayload = {
    eventId: paidEvent.id,
    tiers: [{ name: "VIP", description: null, priceSats: 456, quantity: 2, salesStartAt: null, salesEndAt: null }],
  };
  r = await json(`/api/events/${paidEvent.id}/ticket-tiers`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...tiersPayload,
      signedAuthEvent: auth(paidOrganizer, "ticket-tiers.update", [["e", paidEvent.id]], tiersPayload),
    }),
  });
  if (!r.res.ok || !r.body.tiers?.[0]?.id) throw new Error(`ticket tier failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  const tierId = r.body.tiers[0].id as string;
  pass("ticket tiers", tierId);

  r = await json("/api/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: attendeeCookie },
    body: JSON.stringify({ eventId: paidEvent.id, buyerPubkey: attendee.pubkey, tierId }),
  });
  if (!r.res.ok || !r.body.paymentId || r.body.amountSats !== 456) {
    throw new Error(`invoice failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  const paymentId = r.body.paymentId as string;
  pass("paid invoice creation", paymentId);

  let paidTicket: { id: string; secret: string } | null = null;
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    r = await json(`/api/invoices/${paymentId}`, { headers: { Cookie: attendeeCookie } });
    if (r.res.ok && r.body.status === "PAID" && r.body.ticketId && r.body.ticketSecret) {
      paidTicket = { id: r.body.ticketId, secret: r.body.ticketSecret };
      break;
    }
  }
  if (!paidTicket) throw new Error(`mock payment did not settle: ${JSON.stringify(r.body)}`);
  pass("mock payment settlement issues ticket", paidTicket.id);

  const transferPayload = { ticketId: paidTicket.id, recipientPubkey: transferTo.pubkey };
  r = await json(`/api/tickets/${paidTicket.id}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: attendeeCookie },
    body: JSON.stringify({
      recipientPubkey: transferTo.pubkey,
      signedAuthEvent: auth(attendee, "ticket.transfer", [["t", paidTicket.id]], transferPayload),
    }),
  });
  if (!r.res.ok || r.body.buyerPubkey !== transferTo.pubkey) {
    throw new Error(`ticket transfer failed ${r.res.status}: ${JSON.stringify(r.body)}`);
  }
  pass("ticket transfer", transferTo.npub);

  const paidRaceDTag = `e2e-paid-race-${runId}`;
  const paidRaceEvent = await createEvent(paidOrganizer, {
    pubkey: paidOrganizer.pubkey,
    dTag: paidRaceDTag,
    title: `E2E Paid Capacity Race ${runId}`,
    description: "Concurrent paid invoice capacity test.",
    startsAt: new Date(paidStart.getTime() + 2 * 3_600_000),
    endsAt: new Date(paidStart.getTime() + 3 * 3_600_000),
    city: "Chicago",
    venue: "Paid Race Hall",
    mode: "offline",
    capacity: 1,
    priceSats: 321,
    tags: ["e2e", "race"],
  });
  const paidRaceUsers = Array.from({ length: 6 }, (_, i) => makeUser(`paidRace${i}`));
  const paidRaceCookies = await Promise.all(paidRaceUsers.map(session));
  const paidRaceResults = await Promise.all(paidRaceUsers.map(async (user, i) => {
    const attempt = await json("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: paidRaceCookies[i] },
      body: JSON.stringify({ eventId: paidRaceEvent.id, buyerPubkey: user.pubkey }),
    });
    return { status: attempt.res.status, body: attempt.body };
  }));
  const paidRaceCreated = paidRaceResults.filter((result) => result.status === 200 && result.body.paymentId).length;
  const paidRaceRejected = paidRaceResults.filter((result) => result.status === 409 && result.body.error === "event is sold out").length;
  if (paidRaceCreated !== 1 || paidRaceRejected !== paidRaceUsers.length - 1) {
    throw new Error(`paid capacity race failed: ${JSON.stringify(paidRaceResults)}`);
  }
  pass("concurrent paid capacity lock", `${paidRaceCreated} invoice, ${paidRaceRejected} rejected`);

  r = await json(`/api/dashboard/${organizer.npub}`, { headers: { Cookie: organizerCookie } });
  if (!r.res.ok || !r.body.upcoming.some((e: any) => e.id === freeEvent.id)) {
    throw new Error(`dashboard missing hosted events: ${JSON.stringify(r.body)}`);
  }
  pass("dashboard hosted events", `${r.body.upcoming.length} upcoming`);

  r = await json(`/api/dashboard/${paidOrganizer.npub}`, { headers: { Cookie: paidOrganizerCookie } });
  if (!r.res.ok || !r.body.upcoming.some((e: any) => e.id === paidEvent.id)) {
    throw new Error(`paid organizer dashboard missing hosted events: ${JSON.stringify(r.body)}`);
  }
  pass("paid organizer dashboard hosted events", `${r.body.upcoming.length} upcoming`);

  for (const result of results) {
    console.log(`PASS ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  }
}

main().catch((err) => {
  console.error("E2E_ERROR", err instanceof Error ? err.stack : err);
  for (const result of results) {
    console.log(`PASS ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  }
  process.exit(1);
});
