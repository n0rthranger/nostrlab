import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { nip19 } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { prisma } from "@/lib/prisma";
import { eventCoordinate } from "@/lib/nostr/event-builder";
import { KIND_TICKET_PROOF } from "@/lib/nostr/kinds";
import { buildTicketProof } from "@/lib/nostr/event-builder";
import type { NostrEvent } from "@/lib/nostr/types";
import { verifyNostrEvent } from "@/lib/nostr/verify";

const TICKET_CREDENTIAL_TYPE = "nostrlab.ticket.v1";

interface TicketProofContent {
  type: "nostrlab.ticket.proof.v1";
  ticketId: string;
  eventId: string;
  eventCoordinate: string;
  buyerPubkey: string;
  issuerPubkey: string;
  tier: string;
  secretHash: string;
  issuedAt: string;
  payment: null | {
    provider: string;
    hash: string;
    amountSats: number;
    preimageHash: string | null;
  };
}

export interface TicketCredential {
  type: typeof TICKET_CREDENTIAL_TYPE;
  version: 1;
  ticketId: string;
  secret: string;
  proof: NostrEvent;
  payment: null | {
    provider: string;
    hash: string;
    amountSats: number;
    preimage: string | null;
  };
}

interface ProofInput {
  ticketId: string;
  secret: string;
  eventId: string;
  eventNostrId?: string;
  organizerPubkey: string;
  eventDTag: string;
  buyerPubkey: string;
  tier: string;
  payment?: {
    provider: string;
    paymentHash: string;
    amountSats: number;
    preimage: string | null;
  } | null;
}

type TicketWithProofData = Awaited<ReturnType<typeof loadTicketForProof>>;

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function ticketSecretHash(secret: string): string {
  return sha256Hex(secret);
}

function preimageHash(preimage: string): string {
  return crypto.createHash("sha256").update(Buffer.from(preimage.toLowerCase(), "hex")).digest("hex");
}

function appSigningKey(): { secretKey: Uint8Array; pubkey: string } {
  const nsec = process.env.NOSTRLAB_APP_NSEC?.trim();
  if (!nsec) throw new Error("NOSTRLAB_APP_NSEC is required to issue signed ticket proofs.");
  const decoded = nip19.decode(nsec);
  if (decoded.type !== "nsec") throw new Error("NOSTRLAB_APP_NSEC must be an nsec.");
  const secretKey = decoded.data as Uint8Array;
  return { secretKey, pubkey: getPublicKey(secretKey) };
}

export function createTicketProofEvent(input: ProofInput): NostrEvent {
  const { secretKey, pubkey } = appSigningKey();
  const secretHash = ticketSecretHash(input.secret);
  const coord = eventCoordinate(input.organizerPubkey, input.eventDTag);
  const payment = input.payment
    ? {
        provider: input.payment.provider,
        hash: input.payment.paymentHash,
        amountSats: input.payment.amountSats,
        preimageHash: input.payment.preimage ? preimageHash(input.payment.preimage) : null,
      }
    : null;
  const content: TicketProofContent = {
    type: "nostrlab.ticket.proof.v1",
    ticketId: input.ticketId,
    eventId: input.eventId,
    eventCoordinate: coord,
    buyerPubkey: input.buyerPubkey,
    issuerPubkey: pubkey,
    tier: input.tier,
    secretHash,
    issuedAt: new Date().toISOString(),
    payment,
  };

  const unsigned = buildTicketProof({
    pubkey,
    ticketId: input.ticketId,
    eventId: input.eventId,
    eventNostrId: input.eventNostrId,
    eventCoordinate: coord,
    buyerPubkey: input.buyerPubkey,
    tier: input.tier,
    secretHash,
    paymentHash: payment?.hash,
    paymentProvider: payment?.provider,
    amountSats: payment?.amountSats,
    content: JSON.stringify(content),
  });

  return finalizeEvent(unsigned, secretKey) as NostrEvent;
}

async function loadTicketForProof(ticketId: string) {
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      event: {
        select: {
          id: true,
          nostrId: true,
          organizerPubkey: true,
          dTag: true,
        },
      },
      payment: {
        select: {
          provider: true,
          paymentHash: true,
          amountSats: true,
          preimage: true,
          status: true,
        },
      },
    },
  });
}

function proofInputFromTicket(ticket: NonNullable<TicketWithProofData>): ProofInput {
  return {
    ticketId: ticket.id,
    secret: ticket.secret,
    eventId: ticket.eventId,
    eventNostrId: ticket.event.nostrId,
    organizerPubkey: ticket.event.organizerPubkey,
    eventDTag: ticket.event.dTag,
    buyerPubkey: ticket.buyerPubkey,
    tier: ticket.tier,
    payment: ticket.payment
      ? {
          provider: ticket.payment.provider,
          paymentHash: ticket.payment.paymentHash,
          amountSats: ticket.payment.amountSats,
          preimage: ticket.payment.preimage,
        }
      : null,
  };
}

async function ensureTicketProof(ticketId: string): Promise<NostrEvent> {
  const ticket = await loadTicketForProof(ticketId);
  if (!ticket) throw new Error("ticket not found");
  if (ticket.rawEvent && ticket.nostrId) return ticket.rawEvent as unknown as NostrEvent;
  if (ticket.payment && ticket.payment.status !== "PAID") {
    throw new Error("paid ticket proof can only be issued after settlement");
  }
  if (ticket.payment && !ticket.payment.preimage) {
    throw new Error("paid ticket proof requires the Lightning payment preimage");
  }

  const proof = createTicketProofEvent(proofInputFromTicket(ticket));
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      nostrId: proof.id,
      rawEvent: proof as unknown as Prisma.InputJsonValue,
    },
  });
  return proof;
}

export async function buildTicketCredential(ticketId: string, secret: string): Promise<TicketCredential> {
  const ticket = await loadTicketForProof(ticketId);
  if (!ticket) throw new Error("ticket not found");
  if (ticket.secret !== secret) throw new Error("ticket secret mismatch");
  const proof = await ensureTicketProof(ticket.id);
  return {
    type: TICKET_CREDENTIAL_TYPE,
    version: 1,
    ticketId: ticket.id,
    secret,
    proof,
    payment: ticket.payment
      ? {
          provider: ticket.payment.provider,
          hash: ticket.payment.paymentHash,
          amountSats: ticket.payment.amountSats,
          preimage: ticket.payment.preimage,
        }
      : null,
  };
}

function tagValue(evt: NostrEvent, name: string): string | undefined {
  return evt.tags.find((tag) => tag[0] === name)?.[1];
}

export function verifyTicketCredential(input: {
  ticketId: string;
  eventId: string;
  buyerPubkey: string;
  tier: string;
  secret: string;
  proof: NostrEvent;
  storedProofId?: string | null;
  payment?: {
    provider: string;
    paymentHash: string;
    amountSats: number;
    preimage: string | null;
  } | null;
  paymentPreimage?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const { proof } = input;
  if (proof.kind !== KIND_TICKET_PROOF) return { ok: false, reason: "wrong ticket proof kind" };
  if (!verifyNostrEvent(proof)) return { ok: false, reason: "invalid ticket proof signature" };
  if (input.storedProofId && proof.id !== input.storedProofId) {
    return { ok: false, reason: "ticket proof does not match issued proof" };
  }

  let content: TicketProofContent;
  try {
    content = JSON.parse(proof.content) as TicketProofContent;
  } catch {
    return { ok: false, reason: "ticket proof content is invalid" };
  }
  if (content.type !== "nostrlab.ticket.proof.v1") return { ok: false, reason: "unknown ticket proof type" };

  const secretHash = ticketSecretHash(input.secret);
  const expected: Array<[string, string | undefined, string]> = [
    ["ticket", input.ticketId, "ticket id"],
    ["event_id", input.eventId, "event id"],
    ["p", input.buyerPubkey, "buyer"],
    ["tier", input.tier, "tier"],
    ["secret_hash", secretHash, "secret hash"],
  ];
  for (const [tag, value, label] of expected) {
    if (tagValue(proof, tag) !== value) return { ok: false, reason: `ticket proof ${label} mismatch` };
  }
  if (
    content.ticketId !== input.ticketId ||
    content.eventId !== input.eventId ||
    content.buyerPubkey !== input.buyerPubkey ||
    content.tier !== input.tier ||
    content.secretHash !== secretHash ||
    content.issuerPubkey !== proof.pubkey
  ) {
    return { ok: false, reason: "ticket proof content mismatch" };
  }

  if (input.payment) {
    if (tagValue(proof, "payment_hash") !== input.payment.paymentHash) {
      return { ok: false, reason: "ticket proof payment hash mismatch" };
    }
    if (content.payment?.hash !== input.payment.paymentHash) {
      return { ok: false, reason: "ticket proof payment content mismatch" };
    }
    const preimage = input.paymentPreimage ?? input.payment.preimage;
    if (!preimage) return { ok: false, reason: "paid ticket credential is missing payment preimage" };
    const hash = preimageHash(preimage);
    if (hash !== input.payment.paymentHash.toLowerCase()) {
      return { ok: false, reason: "payment preimage does not match invoice" };
    }
    if (content.payment.preimageHash && content.payment.preimageHash !== hash) {
      return { ok: false, reason: "ticket proof preimage hash mismatch" };
    }
  }

  return { ok: true };
}
