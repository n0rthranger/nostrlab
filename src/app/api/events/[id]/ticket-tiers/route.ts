import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyAuthEnvelope } from "@/lib/auth";
import { nostrEventSchema } from "@/lib/validation";
import { ticketTierToDTO } from "@/lib/dto";

const tierInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  description: z.string().max(1000).nullable().optional(),
  priceSats: z.coerce.number().int().min(1).max(100_000_000),
  quantity: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
  salesStartAt: z.string().datetime().nullable().optional(),
  salesEndAt: z.string().datetime().nullable().optional(),
});

const updateSchema = z.object({
  tiers: z.array(tierInput).max(12),
  signedAuthEvent: nostrEventSchema,
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tiers = await prisma.ticketTier.findMany({
    where: { eventId: id },
    orderBy: { priceSats: "asc" },
    include: { _count: { select: { tickets: true } } },
  });
  return NextResponse.json({ tiers: tiers.map(ticketTierToDTO) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const event = await prisma.event.findUnique({ where: { id }, include: { cohosts: true } });
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const normalized = parsed.data.tiers.map((t) => ({
    id: t.id,
    name: t.name.trim(),
    description: t.description?.trim() || null,
    priceSats: t.priceSats,
    quantity: t.quantity ?? null,
    salesStartAt: t.salesStartAt ?? null,
    salesEndAt: t.salesEndAt ?? null,
  }));
  const auth = verifyAuthEnvelope(parsed.data.signedAuthEvent, {
    expectedAction: "ticket-tiers.update",
    expectedTags: { e: id },
    expectedPayload: { eventId: id, tiers: normalized },
  });
  if (!auth.ok || !auth.pubkey) return NextResponse.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });
  const allowed = event.organizerPubkey === auth.pubkey || event.cohosts.some((c) => c.pubkey === auth.pubkey);
  if (!allowed) return NextResponse.json({ error: "not an organizer" }, { status: 403 });

  const updated = await prisma.$transaction(async (tx) => {
    const keepIds = normalized.map((t) => t.id).filter(Boolean) as string[];
    if (keepIds.length > 0) {
      await tx.ticketTier.deleteMany({ where: { eventId: id, id: { notIn: keepIds }, tickets: { none: {} } } });
    } else {
      await tx.ticketTier.deleteMany({ where: { eventId: id, tickets: { none: {} } } });
    }
    for (const tier of normalized) {
      const data = {
        name: tier.name,
        description: tier.description,
        priceSats: tier.priceSats,
        quantity: tier.quantity,
        salesStartAt: tier.salesStartAt ? new Date(tier.salesStartAt) : null,
        salesEndAt: tier.salesEndAt ? new Date(tier.salesEndAt) : null,
      };
      if (tier.id) {
        await tx.ticketTier.updateMany({ where: { id: tier.id, eventId: id }, data });
      } else {
        await tx.ticketTier.create({ data: { ...data, eventId: id } });
      }
    }
    return tx.ticketTier.findMany({
      where: { eventId: id },
      orderBy: { priceSats: "asc" },
      include: { _count: { select: { tickets: true } } },
    });
  });

  return NextResponse.json({ tiers: updated.map(ticketTierToDTO) });
}
