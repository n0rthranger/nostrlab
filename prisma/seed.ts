// Seed local organizers and a Chicago-flavored set of events with RSVPs.
// Creates keypairs so the events are signed Nostr events
// (NIP-52 kind:31923 with NIP-89 client tag) that would be valid if
// re-broadcast to relays.

import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import { PrismaClient } from "@prisma/client";
import { buildEventListing, buildRsvp, eventCoordinate, rsvpDTag } from "../src/lib/nostr/event-builder";
import { parseEventListing, parseRsvp, rsvpStatusToDb, eventModeToDb } from "../src/lib/nostr/parse";

const prisma = new PrismaClient();

interface SeedUser {
  sk: Uint8Array;
  pubkey: string;
  npub: string;
  name: string;
  displayName: string;
  about: string;
  picture?: string;
  lud16?: string;
  nip05?: string;
}

function makeUser(name: string, displayName: string, about: string, picture?: string, lud16?: string, nip05?: string): SeedUser {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  return {
    sk,
    pubkey,
    npub: nip19.npubEncode(pubkey),
    name,
    displayName,
    about,
    picture,
    lud16,
    nip05,
  };
}

async function upsertUser(u: SeedUser) {
  await prisma.user.upsert({
    where: { pubkey: u.pubkey },
    create: {
      pubkey: u.pubkey,
      npub: u.npub,
      name: u.name,
      displayName: u.displayName,
      about: u.about,
      picture: u.picture,
      lud16: u.lud16,
      nip05: u.nip05,
      profileFetched: new Date(),
    },
    update: {
      displayName: u.displayName,
      about: u.about,
      picture: u.picture,
      lud16: u.lud16,
      nip05: u.nip05,
    },
  });
}

interface SeedEvent {
  organizer: SeedUser;
  title: string;
  description: string;
  startsAt: Date;
  endsAt?: Date;
  city: string;
  venue: string;
  bannerUrl?: string;
  tags: string[];
  capacity?: number;
  priceSats?: number;
  cohosts?: SeedUser[];
}

async function publishSeedEvent(e: SeedEvent, attendees: SeedUser[]) {
  const dTag = `${e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;
  const unsigned = buildEventListing({
    pubkey: e.organizer.pubkey,
    dTag,
    title: e.title,
    description: e.description,
    bannerUrl: e.bannerUrl,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    city: e.city,
    venue: e.venue,
    mode: "offline",
    tags: e.tags,
    capacity: e.capacity,
    priceSats: e.priceSats,
    cohostPubkeys: e.cohosts?.map((c) => c.pubkey) ?? [],
  });
  const signed = finalizeEvent(unsigned, e.organizer.sk);
  const parsed = parseEventListing(signed);
  const isPaid = !!(parsed.priceSats && parsed.priceSats > 0);

  const eventRow = await prisma.event.upsert({
    where: { organizerPubkey_dTag: { organizerPubkey: parsed.organizerPubkey, dTag: parsed.dTag } },
    create: {
      nostrId: parsed.nostrId,
      dTag: parsed.dTag,
      organizerPubkey: parsed.organizerPubkey,
      title: parsed.title,
      description: parsed.description,
      bannerUrl: parsed.bannerUrl,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      city: parsed.city,
      venue: parsed.venue,
      mode: eventModeToDb(parsed.mode),
      capacity: parsed.capacity,
      paymentMode: isPaid ? "PAID" : "FREE",
      priceSats: isPaid ? parsed.priceSats : null,
      clientTag: parsed.clientTag,
      summary: parsed.summary,
      rawEvent: signed as object,
      tags: { create: parsed.hashtags.map((t) => ({ tag: t.toLowerCase() })) },
      cohosts: { create: parsed.cohostPubkeys.map((p) => ({ pubkey: p })) },
    },
    update: {
      nostrId: parsed.nostrId,
      title: parsed.title,
      summary: parsed.summary,
      description: parsed.description,
      bannerUrl: parsed.bannerUrl,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      paymentMode: isPaid ? "PAID" : "FREE",
      priceSats: isPaid ? parsed.priceSats : null,
      clientTag: parsed.clientTag,
      rawEvent: signed as object,
    },
  });

  // RSVPs
  for (const a of attendees) {
    const coord = eventCoordinate(e.organizer.pubkey, dTag);
    const rsvpUnsigned = buildRsvp({
      pubkey: a.pubkey,
      eventCoordinate: coord,
      organizerPubkey: e.organizer.pubkey,
      status: "accepted",
      dTag: rsvpDTag(coord),
    });
    const rsvpSigned = finalizeEvent(rsvpUnsigned, a.sk);
    const parsedRsvp = parseRsvp(rsvpSigned);
    await prisma.rsvp.upsert({
      where: { eventId_pubkey: { eventId: eventRow.id, pubkey: a.pubkey } },
      create: {
        eventId: eventRow.id,
        pubkey: a.pubkey,
        status: rsvpStatusToDb(parsedRsvp.status),
        nostrId: parsedRsvp.nostrId,
        rawEvent: rsvpSigned as object,
      },
      update: {
        status: rsvpStatusToDb(parsedRsvp.status),
        nostrId: parsedRsvp.nostrId,
        rawEvent: rsvpSigned as object,
      },
    });
  }

  return eventRow;
}

async function main() {
  console.log("seeding…");

  const alice = makeUser(
    "alice",
    "Alice — Chicago BTC",
    "Building local Bitcoin culture in Chicago.",
    "https://avatars.githubusercontent.com/u/108554348?v=4",
    "alice@stacker.news",
    "alice@nostrlab.dev"
  );
  const bob = makeUser(
    "bob",
    "Bob the Builder",
    "Nostr dev. PRs welcome.",
    "https://avatars.githubusercontent.com/u/30733?v=4",
    "bob@strike.me",
    "bob@nostrlab.dev"
  );
  const carol = makeUser("carol", "Carol", "RSVP enthusiast.");
  const dave = makeUser("dave", "Dave", "Showed up for the BBQ.");
  const eve = makeUser("eve", "Eve", "I'll be there.");

  for (const u of [alice, bob, carol, dave, eve]) await upsertUser(u);

  const community = await prisma.community.upsert({
    where: { slug: "chi-bitcoin" },
    create: {
      slug: "chi-bitcoin",
      name: "Chicago Bitcoin Collective",
      description:
        "A casual gathering of Chicagoland bitcoiners — meetups, BBQs, talks, and the occasional run club.",
      organizerPubkey: alice.pubkey,
      imageUrl: undefined,
      tags: { create: [{ tag: "bitcoin" }, { tag: "chicago" }] },
      moderators: { create: [{ pubkey: bob.pubkey }] },
    },
    update: {},
  });

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const seedEvents: SeedEvent[] = [
    {
      organizer: alice,
      title: "Chicago Bitcoin BBQ",
      description:
        "Burgers, brisket, builders. Bring a node and a friend. We accept sats at the bar (LN only).",
      // April 25, 2026 · 1pm – 5pm CDT (UTC-5)
      startsAt: new Date("2026-04-25T18:00:00Z"),
      endsAt: new Date("2026-04-25T22:00:00Z"),
      city: "Chicago",
      venue: "Fork & Coin Portage Park",
      bannerUrl: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1600",
      tags: ["bitcoin", "chicago", "bbq", "lightning"],
      capacity: 80,
    },
    {
      organizer: bob,
      title: "Nostr Hack Night",
      description:
        "Pair up on a NIP, finish that bot you've been putting off, ship a relay. Pizza on the house if 5+ PRs land.",
      startsAt: new Date(now + 7 * day + 19 * 60 * 60 * 1000),
      endsAt: new Date(now + 7 * day + 23 * 60 * 60 * 1000),
      city: "Chicago",
      venue: "Merchandise Mart 1871",
      bannerUrl: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=1600",
      tags: ["nostr", "hackathon", "chicago"],
      capacity: 40,
      cohosts: [alice],
    },
    {
      organizer: alice,
      title: "Lightning Workshop: Open Your First Channel",
      description:
        "We'll go from a bare laptop to a routing node in two hours. Bring a fresh sat or two for testing.",
      startsAt: new Date(now + 21 * day + 18 * 30 * 60 * 1000),
      endsAt: new Date(now + 21 * day + 21 * 60 * 60 * 1000),
      city: "Chicago",
      venue: "Chicago Bitcoin Collective HQ",
      bannerUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600",
      tags: ["bitcoin", "lightning", "workshop"],
      capacity: 25,
      priceSats: 21000,
    },
    {
      organizer: bob,
      title: "Nostr 101 — Online",
      description: "Free intro session to the Nostr protocol, NIPs, and how to build with it.",
      startsAt: new Date(now + 3 * day + 17 * 60 * 60 * 1000),
      endsAt: new Date(now + 3 * day + 19 * 60 * 60 * 1000),
      city: "Online",
      venue: "Jitsi link in event description",
      tags: ["nostr", "intro", "online"],
      capacity: 250,
    },
  ];

  const created = [];
  for (const e of seedEvents) {
    const row = await publishSeedEvent(e, [carol, dave, eve]);
    created.push(row);
  }

  await prisma.event.updateMany({
    where: { id: { in: created.map((c) => c.id) } },
    data: { communityId: community.id },
  });

  console.log("seeded:");
  console.log(`  alice npub:  ${alice.npub}`);
  console.log(`  bob   npub:  ${bob.npub}`);
  console.log(`  ${created.length} events under community ${community.slug}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
