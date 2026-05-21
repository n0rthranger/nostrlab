import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { eventGradient } from "@/lib/gradient";
import type { EventListItemDTO } from "@/types";
import { HeroMap } from "./HeroMap";
import { LandingMetrics } from "./LandingMetrics";
import { LightningConstellation } from "./LightningConstellation";

interface Props {
  upcoming: EventListItemDTO[];
  totalUpcoming: number;
  totalCommunities: number;
  totalRsvps: number;
}

export function LandingPage({ upcoming, totalUpcoming, totalCommunities, totalRsvps }: Props) {
  const featured = upcoming.slice(0, 32);
  const sampledEvents = randomEvents(upcoming, 4);
  const discoveryEvents = sampledEvents.slice(0, 3);
  const hostEvent = sampledEvents[3] ?? discoveryEvents[0] ?? null;

  return (
    <div className="bg-zinc-950 text-white -mt-px overflow-x-hidden">
      <section className="relative min-h-[760px] overflow-hidden md:min-h-[900px]">
        <img
          src="/hero-cinematic-meetup.png"
          alt=""
          aria-hidden="true"
          className="cinematic-kenburns absolute inset-0 h-full w-full object-cover"
        />
        <div className="hero-phone-screen-mask absolute" aria-hidden="true" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.72)_38%,rgba(0,0,0,0.26)_76%,rgba(0,0,0,0.58)_100%)]" />
        <div className="cinematic-projector absolute inset-y-0 -left-1/3 w-2/3" />
        <div className="cinematic-grain absolute inset-0 opacity-70" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-zinc-950 to-transparent" />

        <div className="relative mx-auto flex min-h-[760px] max-w-[1500px] flex-col justify-end px-6 pb-12 pt-24 md:min-h-[900px] md:px-10 md:pb-18">
          <div className="w-full max-w-6xl">
            <div className="cinematic-rise mb-5 inline-flex max-w-full items-center rounded-full border border-white/20 bg-black/30 px-4 py-2 text-xs font-semibold uppercase leading-tight tracking-[0.14em] text-zinc-200 backdrop-blur">
              Events without platform
              <br />
              lock-in.
            </div>
            <h1 className="cinematic-rise max-w-6xl text-[2.35rem] font-semibold leading-[0.94] text-white sm:text-[5rem] md:text-[6.5rem] lg:text-[7.5rem]" style={{ "--delay": "80ms" } as CSSProperties}>
              Build communities
              <br />
              no platform can lock down.
            </h1>
            <p className="cinematic-rise mt-7 max-w-2xl text-base leading-relaxed text-zinc-200 sm:text-lg md:text-xl lg:max-w-xl" style={{ "--delay": "160ms" } as CSSProperties}>
              NostrLab helps people publish meetups, grow across borders, and manage RSVPs and tickets without locking in the community.
            </p>
            <div className="cinematic-rise mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center" style={{ "--delay": "240ms" } as CSSProperties}>
              <Link
                href="/events/create"
                className="cinematic-cta inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98] sm:w-auto"
              >
                Publish an event
              </Link>
              <Link
                href="/events"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/25 px-6 text-[15px] font-semibold text-white transition hover:bg-white/10 active:scale-[0.98] sm:w-auto"
              >
                Explore events
              </Link>
            </div>
          </div>
        </div>
      </section>

      <LandingMetrics
        totalUpcoming={totalUpcoming}
        totalCommunities={totalCommunities}
        totalRsvps={totalRsvps}
      />

      <SceneSection
        scene="Discovery"
        eyebrow="for attendees"
        title="Find the right meetup faster."
        body="Browse by city, topic, and community. Open a clear event page with the time, place, host, and RSVP status up front."
      >
        <DiscoveryFrame events={discoveryEvents} allEvents={upcoming} />
      </SceneSection>

      <section className="relative min-h-[780px] overflow-hidden bg-zinc-950 text-white">
        <LightningConstellation />
        <div className="relative mx-auto grid min-h-[780px] max-w-[1500px] gap-10 px-6 py-20 md:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
              Organizer tools
            </div>
            <h2 className="mt-5 break-words text-[2.55rem] font-semibold leading-[0.98] sm:text-5xl md:text-7xl">
              Run the room from one place.
            </h2>
            <p className="mt-6 text-base leading-relaxed text-zinc-300 md:text-xl">
              Track RSVPs, send updates, and check people in without rebuilding a spreadsheet before every event.
            </p>
          </div>
          <HostOpsScene event={hostEvent} />
        </div>
      </section>

      <section className="bg-white text-zinc-950">
        <div className="mx-auto max-w-[1500px] px-6 py-20 md:px-10 md:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Global
              </div>
              <h2 className="mt-4 break-words text-[2.55rem] font-semibold leading-[0.98] sm:text-5xl md:text-7xl">
                Find communities across the globe.
              </h2>
            </div>
            <div className="max-w-2xl text-base leading-relaxed text-zinc-600 md:text-xl">
              Discover local and online meetups, then open the event page with the details you need before you go.
            </div>
          </div>

          {featured.length > 0 ? (
            <div
              className="global-event-carousel mt-12 -mx-6 overflow-x-auto px-6 pb-5 md:-mx-10 md:px-10"
              aria-label="Global events"
            >
              <div className="global-event-carousel-track flex w-max gap-4">
                {featured.map((event) => (
                  <EventReelCard
                    key={event.id}
                    event={event}
                  />
                ))}
              </div>
            </div>
          ) : (
            <EmptyReel />
          )}
        </div>
      </section>

      <section className="landing-map-field relative isolate overflow-hidden bg-zinc-950 text-white lg:min-h-[720px]">
        <div className="pointer-events-none absolute inset-0 z-[1] hidden bg-[linear-gradient(90deg,rgba(9,9,11,1)_0%,rgba(9,9,11,0.98)_38%,rgba(9,9,11,0.62)_52%,rgba(9,9,11,0.16)_66%,rgba(9,9,11,0)_100%)] lg:block" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] hidden w-[58%] bg-[linear-gradient(90deg,rgb(9,9,11)_0%,rgba(9,9,11,0.52)_12%,rgba(9,9,11,0.10)_28%,rgba(9,9,11,0)_54%)] lg:block" />
        <div className="pointer-events-none absolute inset-0 z-[1] hidden bg-[radial-gradient(60%_70%_at_77%_45%,rgba(249,115,22,0.15),transparent_56%)] lg:block" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] hidden h-16 bg-gradient-to-b from-zinc-950/85 to-transparent lg:block" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] hidden h-20 bg-gradient-to-t from-zinc-950/80 to-transparent lg:block" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="pointer-events-none relative z-10 mx-auto flex max-w-[1500px] items-center px-6 pb-8 pt-16 md:px-10 md:pb-10 md:pt-20 lg:min-h-[720px] lg:py-20">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full border border-orange-300/25 bg-orange-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-orange-200 backdrop-blur-md">
              Local discovery
            </div>
            <h2 className="mt-5 max-w-4xl break-words text-[2.55rem] font-semibold leading-[0.98] sm:text-5xl md:text-7xl">
              Show people what is happening near them.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-200 md:text-xl">
              City pages and maps help attendees move from a broad search to the event that fits their night.
            </p>
            <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-4 backdrop-blur-md">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Map
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  Nearby events
                </div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-4 backdrop-blur-md">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Directory
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  Upcoming meetups
                </div>
              </div>
            </div>
            <Link
              href="/events"
              className="pointer-events-auto mt-8 inline-flex h-12 items-center rounded-full bg-white px-6 text-[15px] font-semibold text-zinc-950 transition hover:bg-orange-200 active:scale-[0.98]"
            >
              Explore events
            </Link>
          </div>
        </div>
        <div className="landing-map-plane relative z-0 h-[380px] w-full overflow-hidden md:h-[460px] lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[58%]">
          <HeroMap variant="immersive" />
        </div>
      </section>

      <section className="relative min-h-[760px] overflow-hidden bg-zinc-950 text-white">
        <img
          src="/hero-cinematic-meetup.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45"
        />
        <div className="hero-phone-screen-mask absolute opacity-75" aria-hidden="true" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.96),rgba(0,0,0,0.72),rgba(0,0,0,0.90))]" />
        <div className="cinematic-projector absolute inset-y-0 -left-1/3 w-2/3" />
        <div className="cinematic-grain absolute inset-0 opacity-60" />
        <div className="relative mx-auto flex min-h-[760px] max-w-[1500px] flex-col justify-center px-6 py-20 md:px-10">
          <div className="max-w-5xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
              Open source
            </div>
            <h2 className="mt-5 break-words text-[2.6rem] font-semibold leading-[0.96] sm:text-5xl md:text-8xl">
              Build a community that can move.
            </h2>
            <p className="mt-7 max-w-2xl text-base leading-relaxed text-zinc-300 md:text-xl">
              Start a meetup, publish a clear page, and give people one reliable place to RSVP, return, and bring friends.
            </p>
            <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/events/create"
                className="cinematic-cta inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-semibold text-zinc-950 transition hover:bg-zinc-200"
              >
                Start building
              </Link>
              <Link
                href="/communities"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/25 px-6 text-[15px] font-semibold text-white transition hover:bg-white/10"
              >
                Explore communities
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SceneSection({
  scene,
  eyebrow,
  title,
  body,
  children,
}: {
  scene: string;
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="relative min-h-[820px] overflow-hidden bg-white text-zinc-950">
      <div className="mx-auto grid min-h-[820px] max-w-[1500px] gap-12 px-6 py-20 md:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {scene} / {eyebrow}
          </div>
          <h2 className="mt-5 break-words text-[2.55rem] font-semibold leading-[0.98] sm:text-5xl md:text-7xl">
            {title}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-zinc-600 md:text-xl">
            {body}
          </p>
        </div>
        {children}
      </div>
    </section>
  );
}

function randomEvents(events: EventListItemDTO[], count: number) {
  const pool = [...events];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function DiscoveryFrame({
  events,
  allEvents,
}: {
  events: EventListItemDTO[];
  allEvents: EventListItemDTO[];
}) {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thisWeekCount = allEvents.filter((event) => {
    const startsAt = new Date(event.startsAt);
    return startsAt >= now && startsAt <= weekAhead;
  }).length;
  const topicCount = new Set(allEvents.flatMap((event) => event.tags)).size;
  const rsvpCount = allEvents.reduce((total, event) => total + event.rsvpCount, 0);

  return (
    <div className="cinematic-float-slow relative mx-auto w-full max-w-2xl">
      <div className="absolute -left-5 top-8 hidden h-[calc(100%-64px)] w-px bg-zinc-200 md:block" />
      <div className="cinematic-card-glow overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 text-white shadow-2xl">
        <div className="grid border-b border-white/10 md:grid-cols-3">
          <PreviewMetric label="This week" value={thisWeekCount.toLocaleString()} />
          <PreviewMetric label="Topics" value={topicCount.toLocaleString()} />
          <PreviewMetric label="RSVPs" value={rsvpCount.toLocaleString()} />
        </div>
        <div className="grid md:grid-cols-[0.92fr_1.08fr]">
          <div className="border-b border-white/10 p-6 md:border-b-0 md:border-r">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-300">Before you RSVP</div>
            <div className="mt-4 text-3xl font-semibold leading-tight">
              Check the essentials first.
            </div>
            <p className="mt-5 text-sm leading-relaxed text-zinc-400">
              Look for the date, location, available spots, and price. Open any event to see the full page and RSVP.
            </p>
          </div>
          <div className="divide-y divide-white/10">
            {events.length > 0 ? (
              events.map((event) => (
                <DiscoveryRow key={event.id} event={event} />
              ))
            ) : (
              <Link
                href="/events/create"
                className="block p-5 transition hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-300"
              >
                <div className="text-base font-semibold text-white">No upcoming events yet</div>
                <div className="mt-1 text-sm text-zinc-500">Create the first meetup</div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-white/10 px-4 py-4 md:border-r last:md:border-r-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function DiscoveryRow({ event }: { event: EventListItemDTO }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="grid gap-3 p-5 transition hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-300 sm:grid-cols-[1fr_auto] sm:items-center"
    >
      <div className="min-w-0">
        <div className="truncate text-base font-semibold text-white">{event.title}</div>
        <div className="mt-1 truncate text-sm text-zinc-500">{discoveryMeta(event)}</div>
      </div>
      <div className="text-sm font-semibold text-orange-300">{discoveryStatus(event)}</div>
    </Link>
  );
}

function discoveryMeta(event: EventListItemDTO) {
  const location = event.mode === "ONLINE" ? "Online" : event.city ?? event.venue ?? "Local";
  const date = new Date(event.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const attendance = event.capacity
    ? `${event.rsvpCount}/${event.capacity} going`
    : `${event.rsvpCount.toLocaleString()} going`;

  return `${location} · ${date} · ${attendance}`;
}

function discoveryStatus(event: EventListItemDTO) {
  if (event.status === "CANCELLED") return "Cancelled";
  if (event.paymentMode === "PAID") return `${event.priceSats?.toLocaleString() ?? 0} sats`;
  return "View";
}

function hostMeta(event: EventListItemDTO) {
  const location = event.mode === "ONLINE" ? "Online" : event.venue ?? event.city ?? "Local";
  const startsAt = new Date(event.startsAt).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return `${startsAt} · ${location}`;
}

function spotsLeft(event: EventListItemDTO) {
  if (!event.capacity) return "Open";
  return Math.max(event.capacity - event.rsvpCount, 0).toLocaleString();
}

function priceLabel(event: EventListItemDTO) {
  if (event.paymentMode === "PAID") return `${event.priceSats?.toLocaleString() ?? 0} sats`;
  return "Free";
}

function HostOpsScene({ event }: { event: EventListItemDTO | null }) {
  if (!event) {
    return (
      <div className="cinematic-float-slow relative mx-auto w-full max-w-2xl">
        <div className="cinematic-card-glow overflow-hidden rounded-lg border border-white/10 bg-white text-zinc-950 shadow-2xl">
          <div className="p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Host dashboard</div>
            <div className="mt-3 text-3xl font-semibold leading-tight">Create your first event.</div>
            <p className="mt-4 text-sm leading-relaxed text-zinc-600">
              Publish a meetup, then use the dashboard to track RSVPs, edit details, and run check-in.
            </p>
            <Link
              href="/events/create"
              className="mt-6 inline-flex h-11 items-center rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Host an event
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cinematic-float-slow relative mx-auto w-full max-w-2xl">
      <div className="cinematic-card-glow overflow-hidden rounded-lg border border-white/10 bg-white text-zinc-950 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Host dashboard</div>
            <div className="mt-2 text-2xl font-semibold leading-tight">{event.title}</div>
            <div className="mt-1 text-sm text-zinc-500">{hostMeta(event)}</div>
          </div>
          <div className={event.status === "CANCELLED"
            ? "inline-flex w-fit rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700"
            : "inline-flex w-fit rounded-full bg-zinc-950 px-3 py-1 text-xs font-semibold text-white"}
          >
            {event.status === "CANCELLED" ? "Cancelled" : "Live"}
          </div>
        </div>
        <div className="grid border-b border-zinc-200 sm:grid-cols-3">
          <HostMetric label="RSVPs" value={event.rsvpCount.toLocaleString()} />
          <HostMetric label="Spots left" value={spotsLeft(event)} />
          <HostMetric label="Price" value={priceLabel(event)} />
        </div>
        <div className="grid md:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-zinc-200 p-6 md:border-b-0 md:border-r">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Host actions</div>
            <div className="mt-5 divide-y divide-zinc-200">
              <HostAction href="/dashboard" label="Open dashboard" value="Sign in" />
              <HostAction href={`/events/create?duplicate=${event.id}`} label="Reuse setup" value="New event" />
              <HostAction href={`/events/${event.id}`} label="Preview page" value="Public" />
            </div>
          </div>
          <div className="bg-zinc-50 p-6">
            <div className="text-3xl font-semibold leading-tight">
              Use a real event as a starting point.
            </div>
            <p className="mt-5 text-sm leading-relaxed text-zinc-600">
              Sign in to manage your events, or duplicate this setup and publish a new meetup faster.
            </p>
            <Link
              href={`/events/create?duplicate=${event.id}`}
              className="mt-6 inline-flex h-10 items-center rounded-full border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:border-zinc-950"
            >
              Duplicate event
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function HostMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-zinc-200 px-4 py-4 md:border-r last:md:border-r-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-zinc-950">{value}</div>
    </div>
  );
}

function HostAction({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 py-3 transition hover:text-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-500 first:pt-0 last:pb-0"
    >
      <span className="font-semibold text-zinc-950">{label}</span>
      <span className="text-sm text-zinc-500">{value}</span>
    </Link>
  );
}

function EventReelCard({ event }: { event: EventListItemDTO }) {
  const grad = eventGradient(event.id);
  const start = new Date(event.startsAt);
  const dateLabel = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const location = event.mode === "ONLINE" ? "Online" : event.venue ?? event.city ?? "Local";

  return (
    <Link
      href={`/events/${event.id}`}
      className="group block w-[310px] shrink-0 snap-start md:w-[380px]"
    >
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white transition group-hover:border-zinc-950">
        <div className="aspect-[16/11] overflow-hidden bg-zinc-100">
          {event.bannerUrl ? (
            <img
              src={event.bannerUrl}
              alt={event.title}
              className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="h-full w-full" style={{ backgroundImage: grad.cssLight }} />
          )}
        </div>
        <div className="p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
            {dateLabel}
          </div>
          <h3 className="mt-3 line-clamp-2 text-2xl font-semibold leading-tight">
            {event.title}
          </h3>
          <div className="mt-5 flex items-center justify-between gap-4 border-t border-zinc-100 pt-4 text-sm">
            <span className="min-w-0 truncate text-zinc-600">{location}</span>
            <span className="shrink-0 font-semibold text-zinc-950">
              {event.paymentMode === "PAID" ? `${event.priceSats?.toLocaleString()} sats` : "Free"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyReel() {
  return (
    <div className="mt-12 rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center">
      <h3 className="text-xl font-semibold">No upcoming events yet.</h3>
      <p className="mt-2 text-sm text-zinc-600">Start the first meetup in your city.</p>
      <Link
        href="/events/create"
        className="mt-5 inline-flex h-11 items-center rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800"
      >
        Host an event
      </Link>
    </div>
  );
}
