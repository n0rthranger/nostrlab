"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { EventListItemDTO, CommunityDTO } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { eventGradient } from "@/lib/gradient";
import { cn, shortNpub } from "@/lib/utils";

export interface CityCount {
  slug: string;
  name: string;
  region: "na" | "sa" | "eu" | "asia-pacific" | "af" | "virtual";
  count: number;
}

export interface CategoryCount {
  slug: string;
  label: string;
  emoji: string;
  count: number;
}

interface Props {
  popularByCity: Map<string, EventListItemDTO[]> | Record<string, EventListItemDTO[]>;
  defaultCity: string;
  categories: CategoryCount[];
  communities: CommunityDTO[];
  cities: CityCount[];
}

const REGION_LABELS: Record<CityCount["region"], string> = {
  na: "North America",
  sa: "South America",
  eu: "Europe",
  "asia-pacific": "Asia & Pacific",
  af: "Africa",
  virtual: "Virtual & Other",
};

const REGION_TABS: CityCount["region"][] = ["na", "sa", "eu", "asia-pacific", "af", "virtual"];

export function DiscoverDirectory({
  popularByCity,
  defaultCity,
  categories,
  communities,
  cities,
}: Props) {
  const popularByCityMap = useMemo(
    () => popularByCity instanceof Map
      ? popularByCity
      : new Map(Object.entries(popularByCity)),
    [popularByCity]
  );
  const popularCities = useMemo(() => [...popularByCityMap.keys()], [popularByCityMap]);

  const [city, setCity] = useState(defaultCity);
  const [region, setRegion] = useState<CityCount["region"]>("na");

  const popular = popularByCityMap.get(city) ?? [];

  const cityList = useMemo(
    () =>
      cities
        .filter((c) => c.region === region)
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.name.localeCompare(b.name);
        }),
    [cities, region]
  );

  return (
    <div className="bg-white text-zinc-950 -mt-px">
      {/* HERO */}
      <section
        className="relative border-b border-zinc-200 overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(45% 70% at 8% 0%, rgb(167 139 250 / 0.18), transparent 60%), radial-gradient(40% 60% at 95% 100%, rgb(249 115 22 / 0.15), transparent 60%)",
        }}
      >
        <div className="relative max-w-[1280px] mx-auto px-6 md:px-10 pt-16 md:pt-20 pb-10">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] mb-4 bg-gradient-to-r from-violet-600 to-orange-500 bg-clip-text text-transparent">
            Worldwide
          </div>
          <h1 className="font-semibold tracking-[-0.03em] leading-[1] text-5xl md:text-7xl text-zinc-950">
            Discover Events
          </h1>
          <p className="text-zinc-600 text-base md:text-lg mt-4 max-w-2xl">
            Explore popular events near you, browse by category, or check out some of the great community calendars.
          </p>
        </div>
      </section>

      {/* POPULAR EVENTS */}
      <section className="border-b border-zinc-200 bg-white">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 pt-12 md:pt-16 pb-6">
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-6">
            <h2 className="font-semibold tracking-[-0.025em] leading-[1] text-3xl md:text-4xl text-zinc-950">
              Popular Events
            </h2>
            <Link
              href={city === "All" ? "/events?view=all&limit=200" : `/events?city=${encodeURIComponent(city)}&limit=200`}
              className="text-sm font-semibold text-zinc-700 hover:text-zinc-950 transition-colors"
            >
              View All →
            </Link>
          </div>

          {popularCities.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {popularCities.map((c) => (
                <button
                  key={c}
                  onClick={() => setCity(c)}
                  className={cn(
                    "shrink-0 h-10 px-5 rounded-full text-sm font-semibold transition-colors border",
                    city === c
                      ? "bg-zinc-950 text-white border-zinc-950"
                      : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-950"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {popular.length === 0 ? (
          <div className="max-w-[1280px] mx-auto px-6 md:px-10 pb-16">
            <div className="rounded-2xl border border-dashed border-zinc-200 p-10 text-center">
              <div className="font-semibold text-zinc-950">
                {city === "All" ? "No events yet." : `No events yet in ${city}.`}
              </div>
              <p className="text-sm text-zinc-600 mt-2">
                Be the first organizer here.
              </p>
              <Link
                href={city === "All" ? "/events/create" : `/events/create?city=${encodeURIComponent(city)}`}
                className="mt-4 inline-flex h-10 px-4 items-center rounded-full bg-zinc-950 text-white text-sm font-semibold hover:bg-zinc-800 transition"
              >
                Host an event
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto pb-12 [scrollbar-width:thin]">
            <div className="flex gap-4 px-6 md:px-10 max-w-[1280px] mx-auto min-w-fit">
              {popular.map((e) => <PopularEventCard key={e.id} event={e} />)}
            </div>
          </div>
        )}
      </section>

      {/* BROWSE BY CATEGORY */}
      <section className="border-b border-zinc-200 bg-zinc-50">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-14 md:py-20">
          <h2 className="font-semibold tracking-[-0.025em] leading-[1] text-3xl md:text-4xl text-zinc-950 mb-8">
            Browse by Category
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {categories.map((c, i) => <CategoryTile key={c.slug} category={c} index={i} />)}
          </div>
        </div>
      </section>

      {/* FEATURED CALENDARS */}
      {communities.length > 0 && (
        <section className="border-b border-zinc-200 bg-white">
          <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-14 md:py-20">
            <h2 className="font-semibold tracking-[-0.025em] leading-[1] text-3xl md:text-4xl text-zinc-950 mb-8">
              Featured Calendars
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {communities.slice(0, 8).map((c) => <CommunityCard key={c.id} community={c} />)}
            </div>
          </div>
        </section>
      )}

      {/* EXPLORE LOCAL */}
      <section className="bg-zinc-50">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-14 md:py-20">
          <h2 className="font-semibold tracking-[-0.025em] leading-[1] text-3xl md:text-4xl text-zinc-950 mb-6">
            Explore Events by Region
          </h2>

          {/* Continent tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-8 [scrollbar-width:thin]">
            {REGION_TABS.map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={cn(
                  "shrink-0 h-10 px-5 rounded-full text-sm font-semibold transition-colors border",
                  region === r
                    ? "bg-zinc-950 text-white border-zinc-950"
                    : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-950"
                )}
              >
                {REGION_LABELS[r]}
              </button>
            ))}
          </div>

          {cityList.length === 0 ? (
            <div className="text-sm text-zinc-600 italic py-10 text-center">
              No cities listed in this region yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {cityList.map((c) => <CityTile key={c.slug} city={c} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function PopularEventCard({ event }: { event: EventListItemDTO }) {
  const grad = eventGradient(event.id);
  const start = new Date(event.startsAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diff = Math.round((dayOnly.getTime() - today.getTime()) / 86_400_000);
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dateLabel =
    diff === 0 ? "Today"
    : diff === 1 ? "Tomorrow"
    : start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <Link
      href={`/events/${event.id}`}
      className="group shrink-0 w-[300px] md:w-[320px]"
    >
      <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-zinc-100 mb-3">
        {event.bannerUrl ? (
          <img
            src={event.bannerUrl}
            alt={event.title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="w-full h-full" style={{ backgroundImage: grad.cssLight }} />
        )}
      </div>
      <div className="text-sm font-semibold text-violet-600 mb-1.5">
        {dateLabel}, {time}
      </div>
      <h3 className="font-semibold text-[17px] leading-snug line-clamp-2 text-zinc-950 group-hover:text-violet-700 transition-colors">
        {event.title}
      </h3>
      <div className="text-sm text-zinc-600 mt-1.5 line-clamp-1">
        {event.venue ?? event.city ?? (event.mode === "ONLINE" ? "Online" : "")}
      </div>
    </Link>
  );
}

function CategoryTile({ category, index }: { category: CategoryCount; index: number }) {
  return (
    <Link
      href={`/events?tag=${encodeURIComponent(category.slug)}`}
      className="group relative rounded-2xl bg-white border border-zinc-200 hover:border-zinc-950 transition-colors p-6 flex flex-col justify-between min-h-[160px] overflow-hidden"
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-mono tracking-[0.15em] text-zinc-400">
          {String(index + 1).padStart(2, "0")}
        </span>
        <svg
          className="w-4 h-4 text-zinc-300 group-hover:text-zinc-950 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </div>
      <div>
        <div className="text-2xl md:text-[26px] font-semibold tracking-[-0.025em] leading-[1.05] text-zinc-950">
          {category.slug === "bitcoin" ? (
            <>
              <span>₿</span>
              {category.label.slice(1)}
            </>
          ) : (
            category.label
          )}
        </div>
        <div className="text-xs text-zinc-500 mt-2">
          {formatCount(category.count)} {category.count === 1 ? "event" : "events"}
        </div>
      </div>
    </Link>
  );
}

function CommunityCard({ community }: { community: CommunityDTO }) {
  return (
    <div className="rounded-2xl bg-white border border-zinc-200 p-5 flex items-start gap-4 hover:border-zinc-300 transition-colors">
      <Link href={`/communities/${community.slug}`} className="shrink-0">
        <Avatar
          src={community.imageUrl}
          alt={community.name}
          fallback={community.name.slice(0, 2)}
          seed={community.id}
          size={56}
          className="!rounded-2xl"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/communities/${community.slug}`}
            className="font-semibold text-zinc-950 hover:text-violet-700 transition-colors min-w-0 truncate"
          >
            {community.name}
          </Link>
          {community.verifiedAt && (
            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
              Verified
            </span>
          )}
          <button className="shrink-0 inline-flex items-center h-8 px-3.5 rounded-full bg-zinc-950 text-white text-xs font-semibold hover:bg-violet-600 transition-colors">
            Subscribe
          </button>
        </div>
        <div className="text-sm text-zinc-600 mt-1.5 line-clamp-2 leading-snug">
          {community.description}
        </div>
        {community.upcomingCount > 0 && (
          <div className="mt-2 text-xs text-zinc-500">
            {community.upcomingCount} upcoming {community.upcomingCount === 1 ? "event" : "events"}
          </div>
        )}
      </div>
    </div>
  );
}

function CityTile({ city }: { city: CityCount }) {
  const dim = city.count === 0;
  return (
    <Link
      href={
        city.slug === "__online__"
          ? "/events?mode=online&limit=200"
          : `/events?city=${encodeURIComponent(city.name)}&limit=200`
      }
      className={cn(
        "group rounded-2xl bg-white border p-4 transition-colors",
        dim
          ? "border-zinc-200 opacity-60 hover:opacity-100"
          : "border-zinc-200 hover:border-zinc-950"
      )}
    >
      <div className="min-w-0">
        <div className="font-semibold text-zinc-950 truncate">
          {city.name}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {city.count} {city.count === 1 ? "Event" : "Events"}
        </div>
      </div>
    </Link>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
