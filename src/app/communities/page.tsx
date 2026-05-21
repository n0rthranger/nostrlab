import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { communityToDTO } from "@/lib/dto";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Empty } from "@/components/ui/Empty";

export const dynamic = "force-dynamic";

async function loadCommunities() {
  const communities = await prisma.community.findMany({
    orderBy: { createdAt: "desc" },
    include: { organizer: true, tags: true, _count: { select: { events: true, followers: true } } },
  });
  const upcomingCounts = await prisma.event.groupBy({
    by: ["communityId"],
    where: { communityId: { in: communities.map((c) => c.id) }, startsAt: { gte: new Date() }, duplicateOfId: null },
    _count: { _all: true },
  });
  const map = new Map(upcomingCounts.map((u) => [u.communityId!, u._count._all]));
  return communities.map((c) => communityToDTO(c, map.get(c.id) ?? 0));
}

export default async function CommunitiesPage() {
  const communities = await loadCommunities();

  return (
    <div className="max-w-5xl mx-auto px-5 py-10 md:py-14">
      <header
        className="relative rounded-3xl px-6 py-8 md:px-8 md:py-10 mb-10 border border-border overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(45% 80% at 0% 0%, rgb(167 139 250 / 0.18), transparent 60%), radial-gradient(40% 80% at 100% 100%, rgb(249 115 22 / 0.14), transparent 65%)",
        }}
      >
        <div className="relative flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] mb-3 bg-gradient-to-r from-violet-600 to-orange-500 bg-clip-text text-transparent">
              Calendars
            </div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-[-0.025em]">Communities</h1>
            <p className="text-muted text-lg mt-2 max-w-prose">
              Every organizer has a calendar here. Subscribe to follow the ones whose events you actually attend.
            </p>
          </div>
          <Link
            href="/communities/new"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-zinc-950 text-white text-sm font-semibold hover:bg-violet-600 transition-colors active:scale-[0.98] shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New community
          </Link>
        </div>
      </header>

      {communities.length === 0 ? (
        <Empty title="No communities yet" hint="Communities group recurring events under one roof." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {communities.map((c) => (
            <Link key={c.id} href={`/communities/${c.slug}`}
              className="group rounded-2xl bg-surface border border-border shadow-soft p-5 lift">
              <div className="flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-xl shrink-0 bg-cover bg-center ring-1 ring-black/5"
                  style={c.imageUrl ? { backgroundImage: `url(${c.imageUrl})` } : { background: "linear-gradient(135deg, rgb(251 146 60), rgb(167 139 250))" }}
                >
                  {!c.imageUrl && (
                    <div className="w-full h-full grid place-items-center text-white text-2xl font-semibold">
                      {c.name.slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-lg leading-tight truncate group-hover:text-violet-700 transition-colors">
                    {c.name}
                  </h3>
                  {c.verifiedAt && (
                    <div className="text-xs text-success font-medium mt-1">Verified community</div>
                  )}
                  <p className="text-sm text-muted line-clamp-2 mt-1">{c.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-semibold leading-none">{c.upcomingCount}</div>
                  <div className="text-[11px] text-muted mt-1">upcoming</div>
                  <div className="text-[11px] text-muted mt-1">{c.followerCount} following</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Avatar src={c.organizer.picture} size={20} seed={c.organizer.pubkey} alt={c.organizer.npub} />
                  <span className="text-xs text-muted truncate">
                    {c.organizer.displayName ?? c.organizer.npub.slice(0, 12) + "…"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {c.tags.slice(0, 3).map((t) => <Badge key={t} tone="muted" size="sm">#{t}</Badge>)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
