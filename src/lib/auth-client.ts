import { canonicalJson } from "@/lib/stable-json";

export async function hashAuthPayload(value: Parameters<typeof canonicalJson>[0]): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
