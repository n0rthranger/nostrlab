import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface EventActivityCounts {
  rsvps: number;
  tickets: number;
  payments: number;
  checkIns: number;
  comments: number;
  announcements: number;
}

type Tx = PrismaClient | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export function hasEventActivity(counts: EventActivityCounts): boolean {
  return Object.values(counts).some((count) => count > 0);
}

export function eventDeleteBlockedReason(counts: EventActivityCounts): string | null {
  const labels: string[] = [];
  if (counts.rsvps > 0) labels.push(`${counts.rsvps} RSVP${counts.rsvps === 1 ? "" : "s"}`);
  if (counts.tickets > 0) labels.push(`${counts.tickets} ticket${counts.tickets === 1 ? "" : "s"}`);
  if (counts.payments > 0) labels.push(`${counts.payments} payment${counts.payments === 1 ? "" : "s"}`);
  if (counts.checkIns > 0) labels.push(`${counts.checkIns} check-in${counts.checkIns === 1 ? "" : "s"}`);
  if (counts.comments > 0) labels.push(`${counts.comments} comment${counts.comments === 1 ? "" : "s"}`);
  if (counts.announcements > 0) labels.push(`${counts.announcements} announcement${counts.announcements === 1 ? "" : "s"}`);
  if (labels.length === 0) return null;
  return `Delete is blocked because this event already has ${labels.join(", ")}. Cancel it instead so records remain available.`;
}

export async function eventActivityCounts(eventId: string, db: Tx = prisma): Promise<EventActivityCounts> {
  const [rsvps, tickets, payments, checkIns, comments, announcements] = await Promise.all([
    db.rsvp.count({ where: { eventId } }),
    db.ticket.count({ where: { eventId } }),
    db.payment.count({ where: { eventId } }),
    db.checkIn.count({ where: { eventId } }),
    db.eventComment.count({ where: { eventId } }),
    db.eventAnnouncement.count({ where: { eventId } }),
  ]);
  return { rsvps, tickets, payments, checkIns, comments, announcements };
}
