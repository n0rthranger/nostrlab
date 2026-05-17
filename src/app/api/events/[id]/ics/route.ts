import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: { organizer: true },
  });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const location = [event.venue, event.city].filter(Boolean).join(", ");
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/events/${event.id}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NostrLab//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@nostrlab`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.startsAt)}`,
    event.endsAt ? `DTEND:${icsDate(event.endsAt)}` : undefined,
    `SUMMARY:${icsEscape(event.status === "CANCELLED" ? `[CANCELLED] ${event.title}` : event.title)}`,
    `DESCRIPTION:${icsEscape(`${event.description}\n\n${url}`)}`,
    location ? `LOCATION:${icsEscape(location)}` : undefined,
    `URL:${url}`,
    event.status === "CANCELLED" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  return new NextResponse(`${lines}\r\n`, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.id}.ics"`,
    },
  });
}
