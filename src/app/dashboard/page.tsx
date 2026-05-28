"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNostr } from "@/hooks/useNostr";
import { EventCard } from "@/components/events/EventCard";
import { EventListingRow } from "@/components/events/EventListingRow";
import { Empty } from "@/components/ui/Empty";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { CommunityDTO, EventListItemDTO, UserDTO } from "@/types";

interface DashboardData {
  user: UserDTO;
  upcoming: EventListItemDTO[];
  past: EventListItemDTO[];
  attending: EventListItemDTO[];
  followedCommunities: CommunityDTO[];
  notifications: {
    id: string;
    type: string;
    title: string;
    body: string;
    readAt: string | null;
    createdAt: string;
    event: { id: string; title: string; startsAt: string } | null;
    ticketId: string | null;
  }[];
}

export default function DashboardPage() {
  const { identity, login, hasSigner, profile } = useNostr();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!identity) return;
    setLoading(true);
    setErr(null);
    fetch(`/api/dashboard/${identity.npub}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "Sign in again to refresh your server session." : "Could not load dashboard.");
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        setData(null);
        setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [identity]);

  if (!identity) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in to continue</h1>
        <p className="text-muted mt-2">
          Your dashboard lives behind your Nostr key. No email, no password.
        </p>
        <div className="mt-6">
          <Button size="lg" onClick={() => login().catch(() => {})} disabled={!hasSigner}>
            {hasSigner ? "Sign in with Nostr" : "Use header Sign in for Nostr Connect"}
          </Button>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Session expired</h1>
        <p className="text-muted mt-2">{err}</p>
        <div className="mt-6">
          <Button size="lg" onClick={() => login().catch(() => {})} disabled={!hasSigner}>
            {hasSigner ? "Sign in with Nostr" : "Use header Sign in for Nostr Connect"}
          </Button>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-20">
        <div className="skeleton h-12 w-64 rounded-lg mb-6" />
        <div className="grid gap-5 md:grid-cols-3">
          {[1,2,3].map((i) => <div key={i} className="skeleton aspect-[3/4] rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const totalGoing = data.upcoming.reduce((s, e) => s + e.rsvpCount, 0);

  return (
    <div className="max-w-6xl mx-auto px-5 py-10 space-y-10">
      <header
        className="relative rounded-3xl px-6 py-8 md:px-8 md:py-10 border border-border overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(50% 80% at 0% 0%, rgb(167 139 250 / 0.18), transparent 60%), radial-gradient(45% 80% at 100% 100%, rgb(249 115 22 / 0.14), transparent 65%)",
        }}
      >
        <div className="relative flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Avatar src={profile?.picture} size={64} seed={identity.pubkey} alt={profile?.displayName ?? data.user.npub} />
            <div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.025em]">
                {profile?.displayName ?? profile?.name ?? "Welcome"}
              </h1>
              <div className="text-xs text-muted font-mono mt-1 truncate max-w-md">{data.user.npub}</div>
            </div>
          </div>
          <Link href="/events/create"
            className="h-10 px-4 inline-flex items-center gap-1.5 rounded-full bg-fg text-bg text-sm font-medium hover:bg-violet-600 hover:text-white shadow-soft transition active:scale-[0.98]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New event
          </Link>
        </div>

        <div className="relative grid grid-cols-3 gap-3 mt-6">
          <Stat label="Hosting" value={data.upcoming.length} accent="violet" />
          <Stat label="Going" value={data.attending.length} accent="orange" />
          <Stat label="Total RSVPs" value={totalGoing} />
        </div>
      </header>

      <Section title="Hosting" hint={`${data.upcoming.length} upcoming`}>
        {data.upcoming.length === 0 ? (
          <Empty title="No upcoming events" hint="Host your first event in five minutes." action={
            <Link href="/events/create" className="text-accent hover:underline text-sm font-medium">Create event →</Link>
          } />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {data.upcoming.map((e) => (
              <div key={e.id} className="space-y-2">
                <EventCard event={e} />
                <div className="flex items-center gap-2 px-1">
                  <Link href={`/dashboard/events/${e.id}`}
                    className="text-xs text-muted hover:text-fg transition-colors">
                    Manage
                  </Link>
                  <span className="text-subtle">·</span>
                  <Link href={`/dashboard/events/${e.id}/check-in`}
                    className="text-xs text-muted hover:text-fg transition-colors">
                    Check-in
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {data.notifications.length > 0 && (
        <Section title="Notifications" hint={`${data.notifications.filter((n) => !n.readAt).length} unread`}>
          <div className="rounded-2xl bg-surface border border-border shadow-soft divide-y divide-border">
            {data.notifications.map((n) => (
              <Link
                key={n.id}
                href={n.ticketId ? `/tickets/${n.ticketId}` : n.event ? `/events/${n.event.id}` : "/dashboard"}
                className="block px-4 py-3 hover:bg-surface2/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-sm">{n.title}</div>
                  {!n.readAt && <Badge tone="accent" size="sm">new</Badge>}
                </div>
                <div className="text-sm text-muted line-clamp-2 mt-1">{n.body}</div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title="Going to" hint={`${data.attending.length} RSVPs`}>
        {data.attending.length === 0 ? (
          <Empty title="No RSVPs yet" hint="Browse the discover feed and RSVP to events you want to attend." />
        ) : (
          <div className="rounded-2xl bg-surface border border-border shadow-soft p-2 space-y-1">
            {data.attending.map((e) => <EventListingRow key={e.id} event={e} />)}
          </div>
        )}
      </Section>

      {data.followedCommunities.length > 0 && (
        <Section title="Following" hint={`${data.followedCommunities.length} communities`}>
          <div className="grid gap-3 md:grid-cols-2">
            {data.followedCommunities.map((c) => (
              <Link key={c.id} href={`/communities/${c.slug}`} className="rounded-2xl bg-surface border border-border shadow-soft p-4 hover:border-subtle transition-colors">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-sm text-muted mt-1 line-clamp-2">{c.description}</div>
                <div className="text-xs text-muted mt-3">{c.upcomingCount} upcoming · {c.followerCount} following</div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {data.past.length > 0 && (
        <Section title="Past" hint={`${data.past.length} archived`}>
          <div className="rounded-2xl bg-surface border border-border shadow-soft p-2 space-y-1 opacity-80">
            {data.past.slice(0, 8).map((e) => <EventListingRow key={e.id} event={e} />)}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <Badge tone="muted">{hint}</Badge>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "violet" | "orange" }) {
  const accentClass =
    accent === "violet" ? "text-violet-600"
    : accent === "orange" ? "text-orange-500"
    : "text-fg";
  return (
    <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-3xl font-semibold mt-1 leading-none tabular-nums ${accentClass}`}>{value}</div>
    </div>
  );
}
