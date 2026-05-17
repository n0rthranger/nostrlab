import { prisma } from "@/lib/prisma";

export async function canManageEvent(eventId: string, pubkey: string): Promise<boolean> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      organizerPubkey: true,
      cohosts: { select: { pubkey: true } },
    },
  });
  if (!event) return false;
  return event.organizerPubkey === pubkey || event.cohosts.some((c) => c.pubkey === pubkey);
}
