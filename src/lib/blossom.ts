/**
 * Blossom (BUD-01) client for uploading/downloading blobs.
 * Uses Nostr kind 24242 authorization events.
 */
import type { EventTemplate, Event } from "nostr-tools";
import { signWith, type Signer } from "./nostr";

export const BLOSSOM_AUTH_KIND = 24242;

export const DEFAULT_BLOSSOM_SERVERS = [
  "https://blossom.primal.net",
  "https://blossom.nostr.build",
  "https://blossom.band",
  "https://nostrcheck.me",
  "https://files.sovbit.host",
];

/** Compute SHA-256 hex string of data */
async function sha256hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Create a signed kind 24242 authorization event */
async function createAuthEvent(
  signer: Signer,
  method: "upload" | "get" | "delete",
  contentHash?: string,
): Promise<Event> {
  const expiration = Math.floor(Date.now() / 1000) + 300; // 5 min
  const tags: string[][] = [
    ["t", method],
    ["expiration", String(expiration)],
  ];
  if (contentHash) tags.push(["x", contentHash]);

  const template: EventTemplate = {
    kind: BLOSSOM_AUTH_KIND,
    content: `Authorize ${method}`,
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };
  return signWith(signer, template);
}

/** Encode auth event as base64 for the Authorization header */
function authHeader(event: Event): string {
  const json = JSON.stringify(event);
  return `Nostr ${btoa(json)}`;
}

export interface BlossomUploadResult {
  url: string;
  sha256: string;
  size: number;
}

/**
 * Upload a blob to a Blossom server.
 * Returns the URL where the blob can be fetched.
 */
export async function uploadBlob(
  signer: Signer,
  data: Uint8Array,
  server: string = DEFAULT_BLOSSOM_SERVERS[0],
): Promise<BlossomUploadResult> {
  const hash = await sha256hex(data);
  const authEvent = await createAuthEvent(signer, "upload", hash);

  const response = await fetch(`${server}/upload`, {
    method: "PUT",
    headers: {
      "Authorization": authHeader(authEvent),
      "Content-Type": "application/octet-stream",
    },
    body: data,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Blossom upload failed (${response.status}): ${text}`);
  }

  const result = await response.json();
  const primaryUrl = result.url ?? `${server}/${hash}`;

  // Mirror to other servers in the background for redundancy
  mirrorToServers(signer, data, hash, server).catch(() => {});

  return {
    url: primaryUrl,
    sha256: hash,
    size: data.length,
  };
}

/**
 * Mirror a blob to all other Blossom servers for redundancy.
 * Runs in background, failures are silently ignored.
 */
async function mirrorToServers(
  signer: Signer,
  data: Uint8Array,
  hash: string,
  excludeServer: string,
): Promise<void> {
  const others = DEFAULT_BLOSSOM_SERVERS.filter((s) => s !== excludeServer);
  const authEvent = await createAuthEvent(signer, "upload", hash);
  const auth = authHeader(authEvent);

  await Promise.allSettled(
    others.map((server) =>
      fetch(`${server}/upload`, {
        method: "PUT",
        headers: { "Authorization": auth, "Content-Type": "application/octet-stream" },
        body: data,
      }).catch(() => {})
    ),
  );
}

/**
 * Download a blob from a Blossom URL.
 * No authorization required for public blobs.
 */
export async function downloadBlob(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Blossom download failed (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Check if a URL looks like a Blossom packfile URL */
export function isBlossomUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return DEFAULT_BLOSSOM_SERVERS.some((s) => u.origin === new URL(s).origin) ||
      u.pathname.endsWith(".pack");
  } catch {
    return false;
  }
}
