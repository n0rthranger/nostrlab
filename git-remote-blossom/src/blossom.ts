/**
 * Blossom (BUD-01) client for Node.js.
 * Handles uploading/downloading blobs with Nostr kind 24242 auth.
 */
import { createHash } from "crypto";
import { finalizeEvent, type Event } from "nostr-tools";

export const BLOSSOM_AUTH_KIND = 24242;

export const DEFAULT_BLOSSOM_SERVERS = [
  "https://blossom.primal.net",
  "https://cdn.satellite.earth",
];

function sha256hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function createAuthEvent(
  sk: Uint8Array,
  method: "upload" | "get" | "delete",
  contentHash?: string,
): Event {
  const expiration = Math.floor(Date.now() / 1000) + 300;
  const tags: string[][] = [
    ["t", method],
    ["expiration", String(expiration)],
  ];
  if (contentHash) tags.push(["x", contentHash]);

  return finalizeEvent({
    kind: BLOSSOM_AUTH_KIND,
    content: `Authorize ${method}`,
    tags,
    created_at: Math.floor(Date.now() / 1000),
  }, sk);
}

function authHeader(event: Event): string {
  const json = JSON.stringify(event);
  return `Nostr ${Buffer.from(json).toString("base64")}`;
}

export async function uploadBlob(
  sk: Uint8Array,
  data: Uint8Array,
  server: string = DEFAULT_BLOSSOM_SERVERS[0],
): Promise<{ url: string; sha256: string }> {
  const hash = sha256hex(data);
  const authEvent = createAuthEvent(sk, "upload", hash);

  const response = await fetch(`${server}/upload`, {
    method: "PUT",
    headers: {
      "Authorization": authHeader(authEvent),
      "Content-Type": "application/octet-stream",
    },
    body: data as unknown as BodyInit,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Blossom upload failed (${response.status}): ${text}`);
  }

  const result = await response.json();
  return {
    url: result.url ?? `${server}/${hash}`,
    sha256: hash,
  };
}

export async function downloadBlob(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Blossom download failed (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export function isBlossomUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return DEFAULT_BLOSSOM_SERVERS.some((s) => u.origin === new URL(s).origin) ||
      u.pathname.endsWith(".pack");
  } catch {
    return false;
  }
}
