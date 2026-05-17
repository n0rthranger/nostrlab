import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { prisma } from "../src/lib/prisma";
import { buildEventListing } from "../src/lib/nostr/event-builder";
import { ingestEventListing } from "../src/lib/nostr/ingest-event";
import { createMockInvoice } from "../src/lib/lightning/mock";
import { claimPaymentWithPreimage } from "../src/lib/payments/reconcile";
import { buildTicketCredential, verifyTicketCredential } from "../src/lib/tickets/proof";
import { hexToNpub } from "../src/lib/nostr/encode";
import { closeRelayPool } from "../src/lib/nostr/relay-pool";

const runId = Date.now().toString(36);

function user() {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  return { sk, pubkey };
}

async function ensureUser(pubkey: string) {
  await prisma.user.upsert({
    where: { pubkey },
    create: { pubkey, npub: hexToNpub(pubkey) },
    update: {},
  });
}

async function main() {
  const organizer = user();
  const buyer = user();
  await ensureUser(organizer.pubkey);
  await ensureUser(buyer.pubkey);

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const signedEvent = finalizeEvent(buildEventListing({
    pubkey: organizer.pubkey,
    dTag: `e2e-ticket-proof-${runId}`,
    title: `E2E Real Ticket Proof ${runId}`,
    description: "Paid ticket proof regression.",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
    city: "Chicago",
    venue: "NostrLab Proof Hall",
    mode: "offline",
    capacity: 10,
    priceSats: 21,
    tags: ["e2e", "nostrlab", "meetup"],
  }), organizer.sk);
  const eventResult = await ingestEventListing(signedEvent, {
    trustNostrLabSource: true,
    allowNostrLabHashtag: true,
  });
  if (eventResult.status !== "stored" || !eventResult.id) {
    throw new Error(`event ingest failed: ${JSON.stringify(eventResult)}`);
  }

  const invoice = createMockInvoice(21, "NostrLab ticket proof regression");
  const payment = await prisma.payment.create({
    data: {
      eventId: eventResult.id,
      buyerPubkey: buyer.pubkey,
      amountSats: 21,
      bolt11: invoice.bolt11,
      paymentHash: invoice.paymentHash,
      provider: "mock",
      providerRef: "mock",
      verifyUrl: null,
      expiresAt: invoice.expiresAt,
    },
  });

  const settled = await claimPaymentWithPreimage(payment.id, invoice.preimage);
  if (settled.status !== "PAID" || !settled.ticketId || !settled.ticketSecret) {
    throw new Error(`payment did not issue ticket: ${JSON.stringify(settled)}`);
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: settled.ticketId },
    include: { payment: true },
  });
  if (!ticket?.nostrId || !ticket.rawEvent || !ticket.payment?.preimage) {
    throw new Error("ticket proof was not persisted");
  }

  const credential = await buildTicketCredential(settled.ticketId, settled.ticketSecret);
  if (credential.type !== "nostrlab.ticket.v1" || credential.proof.id !== ticket.nostrId) {
    throw new Error("credential proof mismatch");
  }
  if (credential.payment?.preimage !== invoice.preimage || credential.payment.hash !== invoice.paymentHash) {
    throw new Error("credential payment proof mismatch");
  }

  const verified = verifyTicketCredential({
    ticketId: ticket.id,
    eventId: ticket.eventId,
    buyerPubkey: ticket.buyerPubkey,
    tier: ticket.tier,
    secret: ticket.secret,
    proof: credential.proof,
    storedProofId: ticket.nostrId,
    payment: {
      provider: ticket.payment.provider,
      paymentHash: ticket.payment.paymentHash,
      amountSats: ticket.payment.amountSats,
      preimage: ticket.payment.preimage,
    },
    paymentPreimage: credential.payment.preimage,
  });
  if (!verified.ok) throw new Error(`credential did not verify: ${verified.reason}`);

  console.log(`PASS paid ticket credential - ticket=${ticket.id} proof=${ticket.nostrId.slice(0, 12)} paymentHash=${invoice.paymentHash.slice(0, 12)}`);
}

main()
  .catch((e) => {
    console.error("FAIL e2e-ticket-proof", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    closeRelayPool();
    await prisma.$disconnect();
  });
