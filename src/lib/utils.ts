import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function shortNpub(npub: string): string {
  if (npub.length < 16) return npub;
  return `${npub.slice(0, 10)}…${npub.slice(-6)}`;
}

export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp|gif)$/i.test(url)) return url;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

// Naive description sanitizer for the indexer. The DB stores the raw signed
// event JSON for re-broadcast; this is only for the rendered description field.
const SCRIPT_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const HTML_RE = /<\/?[^>]+>/g;
export function sanitizeDescription(s: string): string {
  return s.replace(SCRIPT_RE, "").replace(HTML_RE, "").trim();
}
