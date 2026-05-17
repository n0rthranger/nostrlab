export type EventCategorySlug =
  | "bitcoin"
  | "nostr"
  | "lightning"
  | "hack"
  | "workshop"
  | "online"
  | "social"
  | "meetup";

export interface EventCategoryDef {
  slug: EventCategorySlug;
  label: string;
  emoji: string;
  tags: string[];
  keywords: string[];
  mode?: "ONLINE";
  fallback?: boolean;
}

export const EVENT_CATEGORIES: EventCategoryDef[] = [
  {
    slug: "bitcoin",
    label: "Bitcoin",
    emoji: "₿",
    tags: ["bitcoin", "btc", "satoshi", "bitdevs"],
    keywords: ["bitcoin", "btc", "satoshi", "bitdevs", "pizza day"],
  },
  {
    slug: "nostr",
    label: "Nostr",
    emoji: "N",
    tags: ["nostr", "nip", "relays", "zap"],
    keywords: ["nostr", "nip-", "relay", "relays", "zapathon"],
  },
  {
    slug: "lightning",
    label: "Lightning",
    emoji: "LN",
    tags: ["lightning", "lnurl", "lnbits"],
    keywords: ["lightning", "lnurl", "lnbits", "bolt11"],
  },
  {
    slug: "hack",
    label: "Build Nights",
    emoji: "{}",
    tags: ["hack", "hackathon", "build", "developer", "dev", "bitdevs"],
    keywords: ["hack", "hackathon", "builder", "build night", "developer", "dev meetup", "coding", "bitdevs"],
  },
  {
    slug: "workshop",
    label: "Workshops",
    emoji: "○",
    tags: ["workshop", "tutorial", "intro", "education", "class"],
    keywords: ["workshop", "tutorial", "intro", "class", "learn", "training", "seminar"],
  },
  {
    slug: "online",
    label: "Online",
    emoji: "WWW",
    tags: ["online", "virtual"],
    keywords: ["online", "virtual", "webinar", "livestream"],
    mode: "ONLINE",
  },
  {
    slug: "social",
    label: "Socials",
    emoji: "☕",
    tags: ["bbq", "social", "party", "drinks", "coffee", "brunch", "hiking", "music"],
    keywords: ["bbq", "social", "party", "drinks", "coffee", "brunch", "pizza", "movie", "hike", "hiking", "music"],
  },
  {
    slug: "meetup",
    label: "Meetups",
    emoji: "▲",
    tags: ["meetup", "community"],
    keywords: ["meetup", "community"],
    fallback: true,
  },
];

export const EVENT_CATEGORY_SLUGS = EVENT_CATEGORIES.map((c) => c.slug) as [EventCategorySlug, ...EventCategorySlug[]];
const CATEGORY_MATCH_PRIORITY: EventCategorySlug[] = ["online", "workshop", "hack", "social", "lightning", "nostr", "bitcoin"];

type CategorizableEvent = {
  title: string;
  description?: string | null;
  summary?: string | null;
  mode: string;
  tags: Array<string | { tag: string }>;
};

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

function eventText(event: CategorizableEvent): string {
  return normalize([event.title, event.summary, event.description].filter(Boolean).join(" "));
}

function eventTags(event: CategorizableEvent): Set<string> {
  return new Set(
    event.tags.map((tag) => normalize(typeof tag === "string" ? tag : tag.tag))
  );
}

function matchesCategory(event: CategorizableEvent, category: EventCategoryDef): boolean {
  if (category.mode && event.mode !== category.mode) return false;
  if (category.mode && event.mode === category.mode) return true;

  const tags = eventTags(event);
  if (category.tags.some((tag) => tags.has(normalize(tag)))) return true;

  const text = eventText(event);
  return category.keywords.some((keyword) => text.includes(normalize(keyword)));
}

export function eventCategorySlug(event: CategorizableEvent): EventCategorySlug {
  for (const slug of CATEGORY_MATCH_PRIORITY) {
    const category = EVENT_CATEGORIES.find((item) => item.slug === slug);
    if (!category) continue;
    if (matchesCategory(event, category)) return category.slug;
  }
  return "meetup";
}

export function eventMatchesCategory(event: CategorizableEvent, slug: EventCategorySlug): boolean {
  return eventCategorySlug(event) === slug;
}
