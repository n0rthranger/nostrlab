/**
 * Nostr relay queries and event publishing for git-remote-blossom.
 */
import "websocket-polyfill";
import { SimplePool, finalizeEvent, nip19, type Event, type Filter } from "nostr-tools";

const REPO_ANNOUNCEMENT = 30617;
const REPO_STATE = 30618;

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relayable.org",
];

const pool = new SimplePool();

export interface RepoInfo {
  pubkey: string;
  identifier: string;
  name: string;
  description: string;
  cloneUrls: string[];
  tags: string[];
  relays: string[];
}

export interface RepoRefs {
  refs: Record<string, string>; // "refs/heads/main" -> commit sha
  head?: string; // "refs/heads/main"
}

async function queryWithTimeout(
  relays: string[],
  filters: Filter[],
  timeoutMs: number = 8000,
): Promise<Event[]> {
  return Promise.race([
    pool.querySync(relays, filters as unknown as Filter),
    new Promise<Event[]>((resolve) => setTimeout(() => resolve([]), timeoutMs)),
  ]);
}

/**
 * Resolve a repo announcement from relays.
 */
export async function fetchRepoAnnouncement(
  pubkey: string,
  identifier: string,
  relays: string[] = DEFAULT_RELAYS,
): Promise<RepoInfo | null> {
  const events = await queryWithTimeout(relays, [{
    kinds: [REPO_ANNOUNCEMENT],
    authors: [pubkey],
    "#d": [identifier],
    limit: 1,
  }]);

  if (events.length === 0) return null;

  const event = events[0];
  const getTag = (name: string) => event.tags.find((t) => t[0] === name);
  const getTags = (name: string) => event.tags.filter((t) => t[0] === name);

  return {
    pubkey: event.pubkey,
    identifier: getTag("d")?.[1] ?? identifier,
    name: getTag("name")?.[1] ?? identifier,
    description: getTag("description")?.[1] ?? "",
    cloneUrls: getTag("clone")?.slice(1) ?? [],
    tags: getTags("t").map((t) => t[1]),
    relays: getTag("relays")?.slice(1) ?? relays,
  };
}

/**
 * Fetch repo state (refs) from relays.
 */
export async function fetchRepoState(
  pubkey: string,
  identifier: string,
  relays: string[] = DEFAULT_RELAYS,
): Promise<RepoRefs | null> {
  const events = await queryWithTimeout(relays, [{
    kinds: [REPO_STATE],
    authors: [pubkey],
    "#d": [identifier],
    limit: 1,
  }]);

  if (events.length === 0) return null;

  const event = events[0];
  const refs: Record<string, string> = {};
  let head: string | undefined;

  for (const tag of event.tags) {
    if (tag[0] === "HEAD" && tag[1]) {
      head = tag[1].replace("ref: ", "");
    } else if (tag[0].startsWith("refs/") && tag[1]) {
      refs[tag[0]] = tag[1];
    }
  }

  return { refs, head };
}

/**
 * Publish an updated repo announcement with new clone URLs.
 */
export async function publishRepoAnnouncement(
  sk: Uint8Array,
  repo: RepoInfo,
  relays: string[] = DEFAULT_RELAYS,
): Promise<void> {
  const tags: string[][] = [
    ["d", repo.identifier],
    ["name", repo.name],
    ["description", repo.description],
  ];
  if (repo.cloneUrls.length > 0) tags.push(["clone", ...repo.cloneUrls]);
  if (repo.relays.length > 0) tags.push(["relays", ...repo.relays]);
  for (const t of repo.tags) tags.push(["t", t]);

  const event = finalizeEvent({
    kind: REPO_ANNOUNCEMENT,
    content: "",
    tags,
    created_at: Math.floor(Date.now() / 1000),
  }, sk);

  await Promise.allSettled(pool.publish(relays, event));
}

/**
 * Publish repo state (refs) to relays.
 */
export async function publishRepoState(
  sk: Uint8Array,
  identifier: string,
  refs: Record<string, string>,
  head?: string,
  relays: string[] = DEFAULT_RELAYS,
): Promise<void> {
  const tags: string[][] = [["d", identifier]];
  if (head) tags.push(["HEAD", `ref: ${head}`]);
  for (const [ref, sha] of Object.entries(refs)) {
    tags.push([ref, sha]);
  }

  const event = finalizeEvent({
    kind: REPO_STATE,
    content: "",
    tags,
    created_at: Math.floor(Date.now() / 1000),
  }, sk);

  await Promise.allSettled(pool.publish(relays, event));
}

/**
 * Decode a blossom:// URL identifier.
 * Supports: naddr1..., npub1.../repo-name, raw-hex-pubkey/repo-name
 */
export function resolveIdentifier(
  identifier: string,
): { pubkey: string; repoIdentifier: string; relays: string[] } {
  // naddr format
  if (identifier.startsWith("naddr1")) {
    const decoded = nip19.decode(identifier);
    if (decoded.type === "naddr") {
      const data = decoded.data;
      return {
        pubkey: data.pubkey,
        repoIdentifier: data.identifier,
        relays: data.relays ?? DEFAULT_RELAYS,
      };
    }
  }

  // npub/repo-name or hex-pubkey/repo-name
  const parts = identifier.split("/");
  if (parts.length >= 2) {
    let pubkey = parts[0];
    const repoName = parts.slice(1).join("/");

    if (pubkey.startsWith("npub1")) {
      const decoded = nip19.decode(pubkey);
      if (decoded.type === "npub") {
        pubkey = decoded.data as string;
      }
    }

    return { pubkey, repoIdentifier: repoName, relays: DEFAULT_RELAYS };
  }

  throw new Error(
    `Invalid blossom:// URL. Use one of:\n` +
    `  blossom://naddr1...\n` +
    `  blossom://npub1.../repo-name\n` +
    `  blossom://<hex-pubkey>/repo-name`
  );
}

export function closePool(): void {
  pool.close(DEFAULT_RELAYS);
}
