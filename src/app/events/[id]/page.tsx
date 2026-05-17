import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { eventToDetailDTO } from "@/lib/dto";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { shortNpub } from "@/lib/utils";
import { eventGradient } from "@/lib/gradient";
import { DateBlock } from "@/components/events/DateBlock";
import { EventDetailClient } from "@/components/events/EventDetailClient";
import { NostrLookup } from "@/components/events/NostrLookup";
import { EventLocationMap } from "@/components/events/EventLocationMap";
import { EventDiscussion } from "@/components/events/EventDiscussion";
import { decodeGeohash } from "@/lib/geohash";
import { findHub } from "@/lib/cities";
import { eventToNaddr, eventToNevent } from "@/lib/nostr/encode";
import { KIND_EVENT_LISTING } from "@/lib/nostr/kinds";
import { getClientRelays } from "@/lib/nostr/relays";
import { isBanned } from "@/lib/moderation";

export const dynamic = "force-dynamic";

async function getEvent(id: string) {
  const event = await prisma.event.findUnique({
    where: { id },
      include: {
        organizer: true,
        tags: true,
        cohosts: { include: { user: true } },
        ticketTiers: { include: { _count: { select: { tickets: true } } }, orderBy: { priceSats: "asc" } },
        rsvps: { include: { user: true }, orderBy: { updatedAt: "desc" } },
        _count: { select: { rsvps: true } },
    },
  });
  if (!event) return null;
  if (await isBanned(event.organizerPubkey)) return null;
  const [eventsCreated, pastAttendees] = await Promise.all([
    prisma.event.count({ where: { organizerPubkey: event.organizerPubkey } }),
    prisma.rsvp.count({
      where: {
        status: "GOING",
        event: { organizerPubkey: event.organizerPubkey, startsAt: { lt: new Date() } },
      },
    }),
  ]);
  const profileAgeDays = event.organizer.createdAt
    ? Math.floor((Date.now() - event.organizer.createdAt.getTime()) / 86_400_000)
    : null;
  return {
    detail: eventToDetailDTO(event, { eventsCreated, pastAttendees, profileAgeDays }),
    organizerPubkey: event.organizerPubkey,
    dTag: event.dTag,
    nostrId: event.nostrId,
  };
}

export default async function EventDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getEvent(id);
  if (!data) notFound();
  const { detail, organizerPubkey, dTag, nostrId } = data;
  const grad = eventGradient(detail.id);

  const start = new Date(detail.startsAt);
  const end = detail.endsAt ? new Date(detail.endsAt) : null;
  const dayLong = start.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endTime = end?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const goingUsers = detail.recentRsvps.filter((r) => r.status === "GOING").map((r) => r.user);

  // Resolve coordinates for the map: geohash is precise; city is a fallback.
  const geo = detail.geohash ? decodeGeohash(detail.geohash) : null;
  const hub = !geo && detail.city ? findHub(detail.city) : null;
  const mapPoint = geo
    ? { lat: geo.lat, lng: geo.lng, precise: true }
    : hub
    ? { lat: hub.lat, lng: hub.lng, precise: false }
    : null;

  return (
    <>
      <header className="bg-zinc-950 text-white">
        <div className="relative h-[190px] w-full overflow-hidden sm:h-[250px] md:h-[clamp(400px,43vw,560px)]">
          {detail.bannerUrl ? (
            <img
              src={detail.bannerUrl}
              alt={detail.title}
              className="absolute inset-0 h-full w-full object-cover object-center"
              loading="eager"
            />
          ) : (
            <div className="absolute inset-0" style={{ backgroundImage: grad.cssLight }} />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1)_0%,rgba(0,0,0,0.22)_38%,rgba(0,0,0,0.84)_100%)]" />
          <div className="absolute inset-y-0 left-0 w-3/5 bg-[linear-gradient(90deg,rgba(0,0,0,0.72),transparent)]" />
          <div className="absolute inset-x-0 bottom-0 hidden md:block">
            <div className="mx-auto max-w-6xl px-8 pb-10">
              <div className="max-w-4xl">
                <div className="text-base font-semibold text-white/75">{dayLong}</div>
                <h1 className="mt-3 max-w-4xl text-5xl font-semibold leading-[0.98] text-white lg:text-6xl">
                  {detail.title}
                </h1>
                <div className="mt-5 flex flex-wrap gap-2">
                  {detail.paymentMode === "PAID" ? (
                    <Badge tone="accent" className="border-white/20 bg-white/15 text-white backdrop-blur-md">
                      {(detail.priceSats ?? 0).toLocaleString()} sats
                    </Badge>
                  ) : (
                    <Badge tone="success" className="border-white/20 bg-white/15 text-white backdrop-blur-md">
                      Free
                    </Badge>
                  )}
                  {detail.status === "CANCELLED" && (
                    <Badge tone="danger" className="border-white/20 bg-white/15 text-white backdrop-blur-md">
                      Cancelled
                    </Badge>
                  )}
                  <Badge className="border-white/20 bg-white/15 text-white backdrop-blur-md">
                    {detail.mode === "ONLINE" ? "Online"
                      : detail.mode === "HYBRID" ? "Hybrid"
                      : "In person"}
                  </Badge>
                  {detail.tags.slice(0, 5).map((t) => (
                    <Badge key={t} tone="muted" className="border-white/20 bg-black/25 text-white/85 backdrop-blur-md">
                      #{t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="px-5 py-5 md:hidden">
          <div className="max-w-lg">
            <div className="text-sm font-semibold text-white/75 md:text-base">{dayLong}</div>
            <h1 className="mt-2 text-4xl font-semibold leading-[0.98] text-white">
              {detail.title}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.paymentMode === "PAID" ? (
                <Badge tone="accent" className="border-white/20 bg-white/15 text-white backdrop-blur-md">
                  {(detail.priceSats ?? 0).toLocaleString()} sats
                </Badge>
              ) : (
                <Badge tone="success" className="border-white/20 bg-white/15 text-white backdrop-blur-md">
                  Free
                </Badge>
              )}
              {detail.status === "CANCELLED" && (
                <Badge tone="danger" className="border-white/20 bg-white/15 text-white backdrop-blur-md">
                  Cancelled
                </Badge>
              )}
              <Badge className="border-white/20 bg-white/15 text-white backdrop-blur-md">
                {detail.mode === "ONLINE" ? "Online"
                  : detail.mode === "HYBRID" ? "Hybrid"
                  : "In person"}
              </Badge>
              {detail.tags.slice(0, 5).map((t) => (
                <Badge key={t} tone="muted" className="border-white/20 bg-black/25 text-white/85 backdrop-blur-md">
                  #{t}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </header>

      <article className="max-w-5xl mx-auto px-5 py-10 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_340px] items-start">
          {/* MAIN */}
          <div className="space-y-8 min-w-0">
            {/* Date + time + location summary */}
            <div className="flex items-start gap-5">
              <DateBlock date={start} size="lg" />
              <div className="min-w-0 flex-1 space-y-3 text-sm">
                <Row icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}>
                  {time}{endTime ? ` – ${endTime}` : ""}
                </Row>
                {(detail.city || detail.venue) && (
                  <Row icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>}>
                    <span>{detail.venue && <span className="font-medium">{detail.venue}</span>}{detail.venue && detail.city && " · "}{detail.city}</span>
                  </Row>
                )}
                {detail.capacity && (
                  <Row icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>}>
                    {detail.rsvpsByStatus.GOING} of {detail.capacity} spots filled
                  </Row>
                )}
              </div>
            </div>

            {/* LOCATION MAP */}
            {mapPoint && (
              <div className="border-t border-border pt-6">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-lg font-semibold tracking-tight">Location</h2>
                  {!mapPoint.precise && (
                    <span className="text-xs text-muted">Approximate · {detail.city}</span>
                  )}
                </div>
                <div className="relative h-[320px] rounded-2xl overflow-hidden border border-border bg-zinc-50">
                  <EventLocationMap
                    lat={mapPoint.lat}
                    lng={mapPoint.lng}
                    precise={mapPoint.precise}
                    label={detail.venue ?? detail.city ?? undefined}
                  />
                </div>
              </div>
            )}

            {/* DESCRIPTION */}
            <div className="border-t border-border pt-8">
            <h2 className="text-lg font-semibold tracking-tight mb-3">About this event</h2>
            <div className="text-fg/85 leading-[1.7] text-[15px] space-y-4 whitespace-pre-wrap">
              {detail.description.split(/\n\n/).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </div>

          {/* ATTENDEES */}
          <div className="border-t border-border pt-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-semibold tracking-tight">Who's going</h2>
              <span className="text-sm text-muted">
                {detail.rsvpsByStatus.GOING} going
                {detail.rsvpsByStatus.MAYBE > 0 && ` · ${detail.rsvpsByStatus.MAYBE} maybe`}
              </span>
            </div>
            {goingUsers.length === 0 ? (
              <div className="text-sm text-muted">Be the first to RSVP.</div>
            ) : (
              <div>
                <AvatarStack users={goingUsers} max={10} size={36} />
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {goingUsers.slice(0, 9).map((u) => (
                    <div key={u.pubkey} className="flex items-center gap-2 min-w-0 text-sm">
                      <Avatar src={u.picture} seed={u.pubkey} alt={u.displayName ?? u.npub} size={24} />
                      <span className="truncate">{u.displayName ?? u.name ?? shortNpub(u.npub)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* NOSTR LOOKUP */}
          <div className="border-t border-border pt-6">
            <NostrLookup
              nostrId={nostrId}
              nevent={eventToNevent({
                id: nostrId,
                pubkey: organizerPubkey,
                kind: KIND_EVENT_LISTING,
                relays: getClientRelays().slice(0, 3),
              })}
              naddr={eventToNaddr({
                kind: KIND_EVENT_LISTING,
                pubkey: organizerPubkey,
                dTag,
                relays: getClientRelays().slice(0, 3),
              })}
            />
          </div>
        </div>

          {/* SIDEBAR */}
          <aside className="space-y-4 lg:sticky lg:top-20 self-start">
            {detail.status === "CANCELLED" && (
              <div className="rounded-2xl border border-danger/20 bg-dangerSoft p-4 text-sm text-danger">
                <div className="font-semibold">This event is cancelled.</div>
                {detail.cancellationReason && <div className="mt-1 text-fg2">{detail.cancellationReason}</div>}
              </div>
            )}
            <EventDetailClient
              eventId={detail.id}
              organizerPubkey={organizerPubkey}
              dTag={dTag}
              paymentMode={detail.paymentMode}
              priceSats={detail.priceSats ?? null}
              status={detail.status}
              capacity={detail.capacity ?? null}
              goingCount={detail.rsvpsByStatus.GOING}
              ticketTiers={detail.ticketTiers}
              shareUrl={`/events/${detail.id}`}
            />

            <a
              href={`/api/events/${detail.id}/ics`}
              className="block text-center h-10 leading-[40px] rounded-full border border-border text-sm font-medium hover:bg-surface2 transition-colors"
            >
              Add to calendar
            </a>

            <Link
              href={`/dashboard?npub=${detail.organizer.npub}`}
              className="block rounded-2xl bg-surface border border-border shadow-soft hover:border-subtle transition-colors p-4"
            >
              <div className="text-xs text-muted mb-2">Hosted by</div>
              <div className="flex items-center gap-3">
                <Avatar src={detail.organizer.picture} size={42} seed={detail.organizer.pubkey} alt={detail.organizer.npub} />
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {detail.organizer.displayName ?? detail.organizer.name ?? shortNpub(detail.organizer.npub)}
                  </div>
                  <div className="text-xs text-muted truncate font-mono">{shortNpub(detail.organizer.npub)}</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted">
                <span>{detail.organizerStats.eventsCreated} events hosted</span>
                <span>{detail.organizerStats.pastAttendees} past attendees</span>
              </div>
            </Link>

            {detail.cohosts.length > 0 && (
              <div className="rounded-2xl bg-surface border border-border shadow-soft p-4">
                <div className="text-xs text-muted mb-3">Co-hosts</div>
                <div className="space-y-2">
                  {detail.cohosts.map((c) => (
                    <div key={c.pubkey} className="flex items-center gap-2 text-sm">
                      <Avatar src={c.picture} seed={c.pubkey} alt={c.displayName ?? c.npub} size={26} />
                      <span className="truncate">
                        {c.displayName ?? c.name ?? shortNpub(c.npub)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
        <div className="mt-10 border-t border-border pt-8">
          <EventDiscussion eventId={detail.id} disabled={detail.status === "CANCELLED"} />
        </div>
      </article>
    </>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-7 h-7 rounded-md bg-surface2 grid place-items-center text-muted shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
