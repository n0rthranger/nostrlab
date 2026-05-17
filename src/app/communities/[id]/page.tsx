import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { eventToListDTO } from "@/lib/dto";
import { EventCard } from "@/components/events/EventCard";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Empty } from "@/components/ui/Empty";
import { shortNpub } from "@/lib/utils";
import { getSessionPubkey } from "@/lib/session";
import { CommunityFollowButton } from "@/components/communities/CommunityFollowButton";

export const dynamic = "force-dynamic";

export default async function CommunityPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const community = await prisma.community.findUnique({
    where: { slug },
    include: {
      organizer: true, tags: true,
      moderators: { include: { user: true } },
      followers: true,
      _count: { select: { followers: true } },
      events: {
        include: { organizer: true, tags: true, _count: { select: { rsvps: true } } },
        orderBy: { startsAt: "asc" },
      },
    },
  });
  if (!community) notFound();
  const pubkey = await getSessionPubkey();
  const isFollowing = !!pubkey && community.followers.some((f) => f.pubkey === pubkey);
  const isOwner = !!pubkey && community.organizerPubkey === pubkey;
  const canHost = !!pubkey && (
    community.organizerPubkey === pubkey || community.moderators.some((m) => m.pubkey === pubkey)
  );
  const now = Date.now();
  const upcoming = community.events.filter((e) => e.startsAt.getTime() >= now);
  const past = community.events.filter((e) => e.startsAt.getTime() < now);

  return (
    <div className="max-w-5xl mx-auto px-5 py-10 md:py-14 space-y-12">
      {/* HEADER */}
      <header className="rounded-3xl bg-surface border border-border shadow-soft overflow-hidden">
        <div
          className="h-40 relative"
          style={community.imageUrl
            ? { backgroundImage: `url(${community.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: "linear-gradient(135deg, rgb(251 146 60), rgb(167 139 250))" }}
        />
        <div className="px-6 md:px-8 pb-8 -mt-12">
          <div
            className="w-24 h-24 rounded-2xl bg-surface ring-4 ring-bg shadow-soft bg-cover bg-center"
            style={community.imageUrl ? { backgroundImage: `url(${community.imageUrl})` } : { background: "linear-gradient(135deg, rgb(251 146 60), rgb(167 139 250))" }}
          >
            {!community.imageUrl && (
              <div className="w-full h-full grid place-items-center text-white text-4xl font-semibold">
                {community.name.slice(0, 1)}
              </div>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.025em] mt-4">
            {community.name}
          </h1>
          <p className="text-muted text-lg mt-3 max-w-prose leading-relaxed">{community.description}</p>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {community.tags.map((t) => <Badge key={t.tag} tone="muted">#{t.tag}</Badge>)}
            {community.verifiedAt && <Badge tone="success">Verified</Badge>}
          </div>
          {community.website && (
            <a
              href={community.website}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-sm font-medium text-accent hover:underline"
            >
              {new URL(community.website).hostname.replace(/^www\./, "")}
            </a>
          )}
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <CommunityFollowButton
              communityId={community.id}
              initiallyFollowing={isFollowing}
              initialFollowerCount={community._count.followers}
            />
            {canHost ? (
              <Link
                href={`/events/create?community=${encodeURIComponent(community.slug)}`}
                className="h-9 px-4 inline-flex items-center rounded-full border border-border text-sm font-medium hover:bg-surface2 transition-colors"
              >
                Host here
              </Link>
            ) : (
              <span className="text-xs text-muted">
                Official events are limited to approved community hosts.
              </span>
            )}
            {isOwner && (
              <Link
                href={`/communities/${encodeURIComponent(community.slug)}/settings`}
                className="h-9 px-4 inline-flex items-center rounded-full border border-border text-sm font-medium hover:bg-surface2 transition-colors"
              >
                Settings
              </Link>
            )}
          </div>
        </div>
      </header>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight mb-5">Upcoming events</h2>
        {upcoming.length === 0 ? (
          <Empty title="Nothing scheduled" />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((e) => <EventCard key={e.id} event={eventToListDTO(e)} />)}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold tracking-tight mb-5">Past events</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 opacity-80">
            {past.map((e) => <EventCard key={e.id} event={eventToListDTO(e)} />)}
          </div>
        </section>
      )}

      <aside className="grid md:grid-cols-2 gap-4">
        <Link
          href={`/dashboard?npub=${community.organizer.npub}`}
          className="rounded-2xl bg-surface border border-border shadow-soft p-5 lift block"
        >
          <div className="text-xs text-muted mb-2">Organized by</div>
          <div className="flex items-center gap-3">
            <Avatar src={community.organizer.picture} size={40} seed={community.organizer.pubkey} alt={community.organizer.npub} />
            <div className="min-w-0">
              <div className="font-medium truncate">
                {community.organizer.displayName ?? community.organizer.name ?? shortNpub(community.organizer.npub)}
              </div>
              <div className="text-xs text-muted font-mono truncate">{shortNpub(community.organizer.npub)}</div>
            </div>
          </div>
        </Link>
        {community.moderators.length > 0 && (
          <div className="rounded-2xl bg-surface border border-border shadow-soft p-5">
            <div className="text-xs text-muted mb-3">Approved hosts</div>
            <div className="space-y-2">
              {community.moderators.map((m) => (
                <div key={m.pubkey} className="flex items-center gap-2 text-sm">
                  <Avatar src={m.user.picture} seed={m.pubkey} alt={m.user.displayName ?? m.user.npub} size={24} />
                  <span className="truncate">
                    {m.user.displayName ?? m.user.name ?? shortNpub(m.user.npub)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
