import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { eventGradient } from "@/lib/gradient";
import { DateBlock } from "./DateBlock";
import type { EventListItemDTO } from "@/types";

// Compact list row — used in dashboard sections and dense day groupings.
export function EventListingRow({ event }: { event: EventListItemDTO }) {
  const start = new Date(event.startsAt);
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const grad = eventGradient(event.id);

  return (
    <Link
      href={`/events/${event.id}`}
      className="group flex items-center gap-4 p-3 rounded-xl hover:bg-surface2/60 transition-colors"
    >
      <DateBlock date={start} size="sm" />
      <div
        className="w-12 h-12 rounded-lg shrink-0 bg-cover bg-center"
        style={{
          backgroundImage: event.bannerUrl ? `url(${event.bannerUrl})` : grad.cssLight,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate group-hover:text-accent transition-colors">{event.title}</div>
        <div className="text-xs text-muted truncate">
          {time}
          {event.city && ` · ${event.city}`}
          {event.venue && ` · ${event.venue}`}
        </div>
      </div>
      <div className="text-right hidden sm:block">
        {event.status === "CANCELLED" ? (
          <Badge tone="danger" size="sm">Cancelled</Badge>
        ) : event.paymentMode === "PAID" ? (
          <div className="text-sm font-medium text-accent">
            {(event.priceSats ?? 0).toLocaleString()} <span className="text-xs text-muted">sats</span>
          </div>
        ) : (
          <Badge tone="success" size="sm">Free</Badge>
        )}
        <div className="text-xs text-muted mt-1">{event.rsvpCount} going</div>
      </div>
      <Avatar
        src={event.organizer.picture}
        alt={event.organizer.npub}
        seed={event.organizer.pubkey}
        size={24}
        className="hidden md:block"
      />
    </Link>
  );
}
