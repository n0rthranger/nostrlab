// Station positions on a 1400x800 canvas. Geography is approximate so the map
// stays legible at small sizes.

export interface Station {
  slug: string;
  name: string;
  x: number;
  y: number;
  region: "na" | "sa" | "eu" | "af" | "asia" | "oc" | "virtual";
}

export const STATIONS: Station[] = [
  // North America (left)
  { slug: "vancouver",      name: "Vancouver",       x:  100, y: 200, region: "na" },
  { slug: "san francisco",  name: "San Francisco",   x:   80, y: 320, region: "na" },
  { slug: "los angeles",    name: "Los Angeles",     x:  140, y: 400, region: "na" },
  { slug: "denver",         name: "Denver",          x:  220, y: 320, region: "na" },
  { slug: "chicago",        name: "Chicago",         x:  300, y: 280, region: "na" },
  { slug: "austin",         name: "Austin",          x:  260, y: 440, region: "na" },
  { slug: "nashville",      name: "Nashville",       x:  360, y: 380, region: "na" },
  { slug: "toronto",        name: "Toronto",         x:  400, y: 200, region: "na" },
  { slug: "new york",       name: "New York",        x:  460, y: 240, region: "na" },
  { slug: "miami",          name: "Miami",           x:  440, y: 480, region: "na" },
  { slug: "mexico city",    name: "Mexico City",     x:  300, y: 540, region: "na" },

  // South America
  { slug: "bogota",         name: "Bogotá",          x:  460, y: 580, region: "sa" },
  { slug: "medellin",       name: "Medellín",        x:  440, y: 620, region: "sa" },
  { slug: "san salvador",   name: "San Salvador",    x:  380, y: 600, region: "sa" },
  { slug: "buenos aires",   name: "Buenos Aires",    x:  520, y: 720, region: "sa" },
  { slug: "sao paulo",      name: "São Paulo",       x:  580, y: 680, region: "sa" },
  { slug: "rio de janeiro", name: "Rio de Janeiro",  x:  620, y: 660, region: "sa" },

  // Europe (center)
  { slug: "lisbon",         name: "Lisbon",          x:  660, y: 320, region: "eu" },
  { slug: "madrid",         name: "Madrid",          x:  700, y: 340, region: "eu" },
  { slug: "barcelona",      name: "Barcelona",       x:  720, y: 320, region: "eu" },
  { slug: "london",         name: "London",          x:  700, y: 200, region: "eu" },
  { slug: "paris",          name: "Paris",           x:  720, y: 260, region: "eu" },
  { slug: "amsterdam",      name: "Amsterdam",       x:  760, y: 220, region: "eu" },
  { slug: "berlin",         name: "Berlin",          x:  820, y: 220, region: "eu" },
  { slug: "milan",          name: "Milan",           x:  780, y: 300, region: "eu" },
  { slug: "prague",         name: "Prague",          x:  820, y: 280, region: "eu" },
  { slug: "warsaw",         name: "Warsaw",          x:  860, y: 240, region: "eu" },
  { slug: "stockholm",      name: "Stockholm",       x:  860, y: 140, region: "eu" },
  { slug: "riga",           name: "Riga",            x:  900, y: 180, region: "eu" },
  { slug: "zurich",         name: "Zurich",          x:  760, y: 280, region: "eu" },
  { slug: "athens",         name: "Athens",          x:  880, y: 360, region: "eu" },
  { slug: "istanbul",       name: "Istanbul",        x:  920, y: 340, region: "eu" },

  // Middle East + Africa
  { slug: "tel aviv",       name: "Tel Aviv",        x:  940, y: 380, region: "af" },
  { slug: "dubai",          name: "Dubai",           x: 1000, y: 420, region: "asia" },
  { slug: "cape town",      name: "Cape Town",       x:  860, y: 700, region: "af" },
  { slug: "lagos",          name: "Lagos",           x:  760, y: 560, region: "af" },
  { slug: "nairobi",        name: "Nairobi",         x:  880, y: 580, region: "af" },
  { slug: "accra",          name: "Accra",           x:  720, y: 540, region: "af" },

  // Asia (right)
  { slug: "tokyo",          name: "Tokyo",           x: 1240, y: 280, region: "asia" },
  { slug: "seoul",          name: "Seoul",           x: 1180, y: 280, region: "asia" },
  { slug: "hong kong",      name: "Hong Kong",       x: 1160, y: 380, region: "asia" },
  { slug: "bangkok",        name: "Bangkok",         x: 1080, y: 440, region: "asia" },
  { slug: "singapore",      name: "Singapore",       x: 1100, y: 500, region: "asia" },
  { slug: "manila",         name: "Manila",          x: 1200, y: 460, region: "asia" },
  { slug: "bali",           name: "Bali",            x: 1180, y: 580, region: "asia" },

  // Oceania
  { slug: "sydney",         name: "Sydney",          x: 1240, y: 660, region: "oc" },
  { slug: "melbourne",      name: "Melbourne",       x: 1180, y: 700, region: "oc" },
  { slug: "auckland",       name: "Auckland",        x: 1320, y: 660, region: "oc" },

  // Virtual terminal — separate from continents, like an airport sigil
  { slug: "__online__",     name: "Online",          x: 1320, y: 140, region: "virtual" },
];

const STATION_BY_SLUG = new Map(STATIONS.map((s) => [s.slug, s]));

// MTA-inspired line palette. Communities cycle through.
export const LINE_COLORS = [
  "#ff5722", // bitcoin orange — line A
  "#2563eb", // royal blue
  "#10b981", // emerald
  "#a855f7", // purple
  "#facc15", // yellow
  "#ec4899", // hot pink
  "#06b6d4", // cyan
  "#dc2626", // red
];

export function findStation(city: string | null | undefined): Station | null {
  if (!city) return null;
  const norm = city
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  if (norm === "online" || norm === "virtual" || norm === "remote") {
    return STATION_BY_SLUG.get("__online__") ?? null;
  }
  return STATION_BY_SLUG.get(norm) ?? null;
}
