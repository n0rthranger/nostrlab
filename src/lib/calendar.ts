import type { EventStatus } from "@prisma/client";

export interface CalendarEventRow {
  id: string;
  nostrId?: string | null;
  title: string;
  description: string;
  startsAt: Date;
  endsAt?: Date | null;
  updatedAt?: Date | null;
  status?: EventStatus;
  city?: string | null;
  venue?: string | null;
  mode?: "ONLINE" | "OFFLINE" | "HYBRID";
}

export function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldIcsLine(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  chunks.push(rest);
  return chunks.join("\r\n ");
}

export function calendarEventLines(event: CalendarEventRow, appUrl: string): string[] {
  const url = new URL(`/events/${event.id}`, appUrl).toString();
  const location = event.mode === "ONLINE"
    ? "Online"
    : [event.venue, event.city].filter(Boolean).join(", ");
  const title = event.status === "CANCELLED" ? `[CANCELLED] ${event.title}` : event.title;
  return [
    "BEGIN:VEVENT",
    `UID:${icsEscape((event.nostrId || event.id) + "@nostrlab")}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.startsAt)}`,
    event.endsAt ? `DTEND:${icsDate(event.endsAt)}` : undefined,
    event.updatedAt ? `LAST-MODIFIED:${icsDate(event.updatedAt)}` : undefined,
    event.status === "CANCELLED" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape(`${event.description}\n\n${url}`)}`,
    location ? `LOCATION:${icsEscape(location)}` : undefined,
    `URL:${icsEscape(url)}`,
    "END:VEVENT",
  ].filter((line): line is string => !!line);
}

export function calendarFeed({
  name,
  description,
  events,
  appUrl,
}: {
  name: string;
  description: string;
  events: CalendarEventRow[];
  appUrl: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NostrLab//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(name)}`,
    `X-WR-CALDESC:${icsEscape(description)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events.flatMap((event) => calendarEventLines(event, appUrl)),
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function calendarResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function requestAppUrl(req: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? req.headers.get("origin") ?? "http://localhost:3000";
}
