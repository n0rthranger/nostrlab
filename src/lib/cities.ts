// Curated directory of major Bitcoin / Nostr meetup hubs around the world.
// These keep the home-page map useful before every city has a listed event.

export interface CityHub {
  slug: string;        // matches Event.city (case-insensitive)
  name: string;        // display name
  country: string;     // ISO 3166-1 alpha-2 or short name
  lat: number;
  lng: number;
}

export type RegionSlug = "na" | "sa" | "eu" | "asia-pacific" | "af" | "virtual";

export const HUBS: CityHub[] = [
  // North America
  { slug: "chicago", name: "Chicago", country: "US", lat: 41.8781, lng: -87.6298 },
  { slug: "new york", name: "New York", country: "US", lat: 40.7128, lng: -74.0060 },
  { slug: "san francisco", name: "San Francisco", country: "US", lat: 37.7749, lng: -122.4194 },
  { slug: "austin", name: "Austin", country: "US", lat: 30.2672, lng: -97.7431 },
  { slug: "miami", name: "Miami", country: "US", lat: 25.7617, lng: -80.1918 },
  { slug: "los angeles", name: "Los Angeles", country: "US", lat: 34.0522, lng: -118.2437 },
  { slug: "nashville", name: "Nashville", country: "US", lat: 36.1627, lng: -86.7816 },
  { slug: "denver", name: "Denver", country: "US", lat: 39.7392, lng: -104.9903 },
  { slug: "toronto", name: "Toronto", country: "CA", lat: 43.6532, lng: -79.3832 },
  { slug: "mexico city", name: "Mexico City", country: "MX", lat: 19.4326, lng: -99.1332 },
  { slug: "vancouver", name: "Vancouver", country: "CA", lat: 49.2827, lng: -123.1207 },

  // Europe
  { slug: "london", name: "London", country: "UK", lat: 51.5074, lng: -0.1278 },
  { slug: "berlin", name: "Berlin", country: "DE", lat: 52.5200, lng: 13.4050 },
  { slug: "lisbon", name: "Lisbon", country: "PT", lat: 38.7223, lng: -9.1393 },
  { slug: "amsterdam", name: "Amsterdam", country: "NL", lat: 52.3676, lng: 4.9041 },
  { slug: "paris", name: "Paris", country: "FR", lat: 48.8566, lng: 2.3522 },
  { slug: "madrid", name: "Madrid", country: "ES", lat: 40.4168, lng: -3.7038 },
  { slug: "barcelona", name: "Barcelona", country: "ES", lat: 41.3851, lng: 2.1734 },
  { slug: "prague", name: "Prague", country: "CZ", lat: 50.0755, lng: 14.4378 },
  { slug: "riga", name: "Riga", country: "LV", lat: 56.9496, lng: 24.1052 },
  { slug: "warsaw", name: "Warsaw", country: "PL", lat: 52.2297, lng: 21.0122 },
  { slug: "stockholm", name: "Stockholm", country: "SE", lat: 59.3293, lng: 18.0686 },
  { slug: "zurich", name: "Zurich", country: "CH", lat: 47.3769, lng: 8.5417 },
  { slug: "milan", name: "Milan", country: "IT", lat: 45.4642, lng: 9.1900 },
  { slug: "athens", name: "Athens", country: "GR", lat: 37.9838, lng: 23.7275 },

  // Asia / Middle East
  { slug: "tokyo", name: "Tokyo", country: "JP", lat: 35.6762, lng: 139.6503 },
  { slug: "singapore", name: "Singapore", country: "SG", lat: 1.3521, lng: 103.8198 },
  { slug: "seoul", name: "Seoul", country: "KR", lat: 37.5665, lng: 126.9780 },
  { slug: "hong kong", name: "Hong Kong", country: "HK", lat: 22.3193, lng: 114.1694 },
  { slug: "bangkok", name: "Bangkok", country: "TH", lat: 13.7563, lng: 100.5018 },
  { slug: "bali", name: "Bali", country: "ID", lat: -8.3405, lng: 115.0920 },
  { slug: "manila", name: "Manila", country: "PH", lat: 14.5995, lng: 120.9842 },
  { slug: "tel aviv", name: "Tel Aviv", country: "IL", lat: 32.0853, lng: 34.7818 },
  { slug: "dubai", name: "Dubai", country: "AE", lat: 25.2048, lng: 55.2708 },
  { slug: "istanbul", name: "Istanbul", country: "TR", lat: 41.0082, lng: 28.9784 },

  // Latin America
  { slug: "buenos aires", name: "Buenos Aires", country: "AR", lat: -34.6037, lng: -58.3816 },
  { slug: "são paulo", name: "São Paulo", country: "BR", lat: -23.5505, lng: -46.6333 },
  { slug: "sao paulo", name: "São Paulo", country: "BR", lat: -23.5505, lng: -46.6333 },
  { slug: "rio de janeiro", name: "Rio de Janeiro", country: "BR", lat: -22.9068, lng: -43.1729 },
  { slug: "bogota", name: "Bogotá", country: "CO", lat: 4.7110, lng: -74.0721 },
  { slug: "medellin", name: "Medellín", country: "CO", lat: 6.2442, lng: -75.5812 },
  { slug: "san salvador", name: "San Salvador", country: "SV", lat: 13.6929, lng: -89.2182 },

  // Africa
  { slug: "cape town", name: "Cape Town", country: "ZA", lat: -33.9249, lng: 18.4241 },
  { slug: "lagos", name: "Lagos", country: "NG", lat: 6.5244, lng: 3.3792 },
  { slug: "nairobi", name: "Nairobi", country: "KE", lat: -1.2921, lng: 36.8219 },
  { slug: "accra", name: "Accra", country: "GH", lat: 5.6037, lng: -0.1870 },

  // Oceania
  { slug: "sydney", name: "Sydney", country: "AU", lat: -33.8688, lng: 151.2093 },
  { slug: "melbourne", name: "Melbourne", country: "AU", lat: -37.8136, lng: 144.9631 },
  { slug: "auckland", name: "Auckland", country: "NZ", lat: -36.8485, lng: 174.7633 },
];

export function normalizeCitySlug(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

const HUB_BY_SLUG = new Map(HUBS.map((h) => [normalizeCitySlug(h.slug), h]));

/** Match a free-form city string to a hub. Case + diacritic tolerant. */
export function findHub(city: string | null | undefined): CityHub | null {
  if (!city) return null;
  return HUB_BY_SLUG.get(normalizeCitySlug(city)) ?? null;
}

export function findHubInText(text: string | null | undefined): CityHub | null {
  if (!text) return null;
  const norm = normalizeCitySlug(text);
  const hubs = [...HUBS].sort((a, b) => b.slug.length - a.slug.length);
  return hubs.find((h) => {
    const slug = normalizeCitySlug(h.slug);
    const name = normalizeCitySlug(h.name);
    return norm.includes(slug) || norm.includes(name);
  }) ?? null;
}

const COUNTRY_REGION_PATTERNS: Array<[RegExp, RegionSlug]> = [
  [/\b(united states|usa|u\.s\.a\.|canada|mexico|puerto rico)\b/i, "na"],
  [/\b(argentina|brazil|brasil|chile|colombia|paraguay|uruguay|peru|ecuador|venezuela|bolivia)\b/i, "sa"],
  [/\b(united kingdom|uk|england|scotland|ireland|france|germany|spain|portugal|netherlands|switzerland|austria|italy|greece|poland|czechia|czech republic|sweden|norway|denmark|belgium|luxembourg|latvia)\b/i, "eu"],
  [/\b(australia|new zealand|indonesia|japan|singapore|korea|hong kong|thailand|philippines|india|israel|uae|turkey)\b/i, "asia-pacific"],
  [/\b(south africa|kenya|nigeria|ghana|morocco|egypt|tanzania|uganda)\b/i, "af"],
];

export function regionForText(text: string | null | undefined): RegionSlug {
  if (!text) return "virtual";
  const match = COUNTRY_REGION_PATTERNS.find(([pattern]) => pattern.test(text));
  return match ? match[1] : "virtual";
}

const COUNTRY_OR_REGION_ONLY = /^(?:united states|usa|u\.s\.a\.|canada|mexico|puerto rico|argentina|brazil|brasil|chile|colombia|paraguay|uruguay|peru|ecuador|venezuela|bolivia|united kingdom|uk|england|scotland|ireland|france|germany|spain|portugal|netherlands|switzerland|austria|italy|greece|poland|czechia|czech republic|sweden|norway|denmark|belgium|latvia|australia|new zealand|indonesia|japan|singapore|korea|hong kong|thailand|philippines|india|israel|uae|turkey|south africa|kenya|nigeria|ghana|morocco|egypt|tanzania|uganda)$/i;
const ADDRESS_WORDS = /\b(st|street|rd|road|ave|avenue|blvd|boulevard|way|lane|ln|drive|dr|highway|hwy|route|sr|passage|strasse|straße|calle|rue|jl|weg|ro|suite|ste|unit|floor|fl|shop|plaza|mall|centre|center)\b/i;
const VENUE_WORDS = /\b(cafe|coffee|restaurant|bar|pub|brewery|winery|hotel|cinema|theatre|theater|room|hall|club|distilling|diner|library|museum|deli|icehouse)\b/i;
const UNRESOLVED_LOCATION_WORDS = /\b(tbd|to be determined|telegram|bekanntgegeben|spontan|seen to attendees)\b/i;
const ADMIN_REGION_WORDS = /\b(regency|province|state|county|bengal)\b/i;

function cleanCityCandidate(segment: string): string {
  return segment
    .replace(/\([^)]*\)/g, "")
    .replace(/\s*\([^)]*$/g, "")
    .replace(/^[A-Z0-9 -]*\d[A-Z0-9 -]*\s+(?=[A-ZÀ-Þa-zà-ÿ])/i, "")
    .replace(/^\d{4,6}\s+/, "")
    .replace(/\s+-\s+[A-Z]{2,4}$/i, "")
    .replace(/\s+[A-Z]{2,3}$/, "")
    .replace(/\s+[A-Z]{2,3}\s+\d[\dA-Z -]*$/i, "")
    .replace(/\s+\d{4,6}(?:-\d+)?$/i, "")
    .trim();
}

function isUsableCityCandidate(segment: string): boolean {
  const candidate = cleanCityCandidate(segment);
  if (candidate.length < 2 || candidate.length > 56) return false;
  if (UNRESOLVED_LOCATION_WORDS.test(candidate)) return false;
  if (ADMIN_REGION_WORDS.test(candidate)) return false;
  if (COUNTRY_OR_REGION_ONLY.test(candidate)) return false;
  if (/^\d/.test(candidate)) return false;
  if (/^[A-Z]{1,4}$/i.test(candidate)) return false;
  if (/^[A-Z]{2,3}\s+[A-Z0-9][A-Z0-9 -]*\d/i.test(candidate)) return false;
  if (/^\d{4,6}(?:-\d+)?$/.test(candidate)) return false;
  if (/\d/.test(candidate)) return false;
  if (ADDRESS_WORDS.test(candidate)) return false;
  if (VENUE_WORDS.test(candidate) && !/\b(city|town|bay|beach|springs|heights|village)\b/i.test(candidate)) return false;
  return true;
}

function trailingInCity(segment: string): string | null {
  const match = segment.match(/\bin\s+([A-ZÀ-Þ][A-Za-zÀ-ÿ .'-]{2,44})(?:,\s*[A-Z]{2,4})?$/);
  if (!match || !isUsableCityCandidate(match[1])) return null;
  return cleanCityCandidate(match[1]);
}

export function inferCityName(city: string | null | undefined, venue: string | null | undefined): string | null {
  const explicit = city?.trim();
  const explicitHub = findHubInText(explicit);
  if (explicitHub) return explicitHub.name;
  const explicitTrailingCity = explicit ? trailingInCity(explicit) : null;
  if (explicitTrailingCity) return explicitTrailingCity;
  if (explicit && isUsableCityCandidate(explicit)) return cleanCityCandidate(explicit);

  const hub = findHubInText(venue);
  if (hub) return hub.name;
  if (!venue) return null;

  const trailingCity = trailingInCity(venue);
  if (trailingCity) return trailingCity;

  const parts = venue
    .split(",")
    .map((part) => cleanCityCandidate(part))
    .filter(Boolean);

  for (let i = parts.length - 1; i >= 0; i--) {
    const cityFromPart = trailingInCity(parts[i]);
    if (cityFromPart) return cityFromPart;
    if (isUsableCityCandidate(parts[i])) return parts[i];
  }
  return null;
}

export function regionForCitySlug(slug: string): RegionSlug {
  const norm = normalizeCitySlug(slug);
  const NA = ["chicago", "new york", "san francisco", "austin", "miami", "los angeles", "nashville", "denver", "toronto", "mexico city", "vancouver"];
  const SA = ["buenos aires", "sao paulo", "rio de janeiro", "bogota", "medellin", "san salvador"];
  const EU = ["london", "berlin", "lisbon", "amsterdam", "paris", "madrid", "barcelona", "prague", "riga", "warsaw", "stockholm", "zurich", "milan", "athens"];
  const AP = ["tokyo", "singapore", "seoul", "hong kong", "bangkok", "bali", "manila", "tel aviv", "dubai", "istanbul", "sydney", "melbourne", "auckland"];
  const AF = ["cape town", "lagos", "nairobi", "accra"];
  if (NA.includes(norm)) return "na";
  if (SA.includes(norm)) return "sa";
  if (EU.includes(norm)) return "eu";
  if (AP.includes(norm)) return "asia-pacific";
  if (AF.includes(norm)) return "af";
  return "virtual";
}

export function regionForCoordinates(lat: number, lng: number): RegionSlug {
  if (lat >= 7 && lat <= 84 && lng >= -170 && lng <= -50) return "na";
  if (lat >= -57 && lat <= 13 && lng >= -92 && lng <= -30) return "sa";
  if (lat >= 34 && lat <= 72 && lng >= -25 && lng <= 45) return "eu";
  if (lat >= -50 && lat <= 56 && lng >= 45 && lng <= 180) return "asia-pacific";
  if (lat >= -36 && lat <= 38 && lng >= -20 && lng <= 55) return "af";
  return "virtual";
}

export function regionLabel(region: RegionSlug): string {
  switch (region) {
    case "na": return "North America";
    case "sa": return "South America";
    case "eu": return "Europe";
    case "asia-pacific": return "Asia & Pacific";
    case "af": return "Africa";
    case "virtual": return "Virtual";
  }
}
