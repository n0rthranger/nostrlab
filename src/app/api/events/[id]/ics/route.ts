import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calendarFeed, calendarResponse, requestAppUrl } from "@/lib/calendar";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: { organizer: true },
  });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  return calendarResponse(
    calendarFeed({
      name: event.title,
      description: event.description,
      events: [event],
      appUrl: requestAppUrl(req),
    }),
    `${event.id}.ics`
  );
}
