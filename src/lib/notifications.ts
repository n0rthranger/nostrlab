import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

async function eventRecipientPubkeys(eventId: string, skipPubkey?: string): Promise<string[]> {
  const [rsvps, tickets] = await Promise.all([
    prisma.rsvp.findMany({
      where: { eventId, status: { in: ["GOING", "WAITLIST"] } },
      select: { pubkey: true },
    }),
    prisma.ticket.findMany({
      where: { eventId },
      select: { buyerPubkey: true },
    }),
  ]);
  const recipients = new Set<string>();
  for (const r of rsvps) recipients.add(r.pubkey.toLowerCase());
  for (const t of tickets) recipients.add(t.buyerPubkey.toLowerCase());
  if (skipPubkey) recipients.delete(skipPubkey.toLowerCase());
  return [...recipients];
}

export async function notifyEventRecipients({
  eventId,
  type,
  title,
  body,
  skipPubkey,
  announcementId,
}: {
  eventId: string;
  type: NotificationType;
  title: string;
  body: string;
  skipPubkey?: string;
  announcementId?: string;
}) {
  const recipients = await eventRecipientPubkeys(eventId, skipPubkey);
  if (recipients.length === 0) return;
  await prisma.notification.createMany({
    data: recipients.map((recipientPubkey) => ({
      recipientPubkey,
      type,
      title,
      body,
      eventId,
      announcementId,
    })),
  });
}

export async function notifyPubkey({
  pubkey,
  type,
  title,
  body,
  eventId,
  ticketId,
}: {
  pubkey: string;
  type: NotificationType;
  title: string;
  body: string;
  eventId?: string;
  ticketId?: string;
}) {
  await prisma.notification.create({
    data: {
      recipientPubkey: pubkey.toLowerCase(),
      type,
      title,
      body,
      eventId,
      ticketId,
    },
  });
}
