import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { eventGradient } from "@/lib/gradient";
import { DateBlock } from "./DateBlock";
import { Avatar } from "@/components/ui/Avatar";
import type { EventListItemDTO } from "@/types";

export function EventCard({ event }: { event: EventListItemDTO }) {
  const grad = eventGradient(event.id);
  const start = new Date(event.startsAt);
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <Link href={`/events/${event.id}`} className="group block">
      <article className="rounded-2xl bg-surface border border-border overflow-hidden lift">
        {/* gradient banner */}
        <div className="aspect-[16/9] relative overflow-hidden">
          {event.bannerUrl ? (
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-[1.04]"
              style={{ backgroundImage: `url(${event.bannerUrl})` }}
            />
          ) : (
            <>
              <div
                className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.04]"
                style={{ backgroundImage: `var(--grad)`, ["--grad" as string]: grad.cssLight }}
              />
              <div className="absolute inset-0 dark:opacity-100 opacity-0 transition-opacity"
                style={{ backgroundImage: grad.cssDark }} />
              <div className="absolute inset-0 grid place-items-center text-white/30">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
            </>
          )}
          {/* date pill floating top-left */}
          <div className="absolute top-3 left-3">
            <DateBlock date={start} size="sm" />
          </div>
          {/* price badge floating top-right */}
          <div className="absolute top-3 right-3">
            {event.status === "CANCELLED" ? (
              <Badge tone="danger" className="bg-bg/90 backdrop-blur shadow-soft">
                Cancelled
              </Badge>
            ) : event.paymentMode === "PAID" ? (
              <Badge tone="accent" className="bg-bg/90 backdrop-blur shadow-soft">
                {(event.priceSats ?? 0).toLocaleString()} sats
              </Badge>
            ) : (
              <Badge tone="success" className="bg-bg/90 backdrop-blur shadow-soft">
                Free
              </Badge>
            )}
          </div>
        </div>

        {/* content */}
        <div className="p-4 flex flex-col gap-3">
          <div>
            <h3 className="font-semibold text-base leading-snug line-clamp-2 group-hover:text-accent transition-colors">
              {event.title}
            </h3>
            <div className="text-sm text-muted mt-1 line-clamp-1">
              {time}
              {event.city && ` · ${event.city}`}
              {event.venue && ` · ${event.venue}`}
              {event.mode === "ONLINE" && " · Online"}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-border">
            <Avatar
              src={event.organizer.picture}
              alt={event.organizer.displayName ?? event.organizer.npub}
              seed={event.organizer.pubkey}
              size={20}
            />
            <span className="text-xs text-muted truncate flex-1">
              {event.organizer.displayName ?? event.organizer.name ?? event.organizer.npub.slice(0, 12) + "…"}
            </span>
            <span className="text-xs text-muted font-medium">
              {event.rsvpCount} {event.rsvpCount === 1 ? "going" : "going"}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
