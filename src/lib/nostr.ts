import {
  SimplePool,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  type Event,
  type EventTemplate,
} from "nostr-tools";
import type {
  RepoAnnouncement,
  RepoState,
  IssueEvent,
  PatchEvent,
  PullRequestEvent,
  CommentEvent,
  StatusEvent,
  UserProfile,
  StatusKind,
  CodeSnippetEvent,
  NotificationItem,
  ReactionEvent,
  ZapReceiptEvent,
  ReviewEvent,
  ReviewVerdict,
  FileBlobEvent,
  FileEntry,
} from "../types/nostr";
import {
  REPO_ANNOUNCEMENT,
  REPO_STATE,
  PATCH,
  PULL_REQUEST,
  ISSUE,
  COMMENT,
  CODE_SNIPPET,
  CONTACT_LIST,
  STATUS_OPEN,
  STATUS_APPLIED,
  STATUS_CLOSED,
  STATUS_DRAFT,
  REACTION,
  PROFILE_METADATA,
  ZAP_RECEIPT,
  ZAP_REQUEST,
  REPO_FILE_BLOB,
  DELETION,
} from "../types/nostr";

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",       // High uptime, most popular relay
  "wss://nos.lol",              // Zero-failure track record, community-run
  "wss://relay.primal.net",     // Primal's relay, enterprise-grade
  "wss://relay.snort.social",   // Snort client relay, well-maintained
  "wss://nostr.wine",           // Paid relay, high reliability & spam-filtered
  "wss://purplepag.es",         // Profile/metadata discovery relay
  "wss://offchain.pub",         // Reliable free relay
  "wss://nostr.mom",            // Stable general-purpose relay
];

export const pool = new SimplePool();

// ── Helpers ──

function getTagValue(event: Event, tagName: string): string | undefined {
  const tag = event.tags.find((t) => t[0] === tagName);
  return tag?.[1];
}

function getTagValues(event: Event, tagName: string): string[] {
  return event.tags.filter((t) => t[0] === tagName).map((t) => t[1]);
}

function getMultiValueTag(event: Event, tagName: string): string[] {
  const tag = event.tags.find((t) => t[0] === tagName);
  return tag ? tag.slice(1) : [];
}

// ── Signer ──
// Accepts either a raw secret key (Uint8Array) or a signing function (e.g. NIP-07 extension).
// This allows all publish functions to work with both nsec login and browser extensions.
export type Signer = Uint8Array | ((event: EventTemplate) => Promise<Event>);

export async function signWith(signer: Signer, unsignedEvent: EventTemplate): Promise<Event> {
  if (signer instanceof Uint8Array) {
    return finalizeEvent(unsignedEvent, signer);
  }
  return signer(unsignedEvent);
}

// ── Key Management ──

export function generateKeys(): { sk: Uint8Array; pk: string; nsec: string; npub: string } {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  return { sk, pk, nsec: nip19.nsecEncode(sk), npub: nip19.npubEncode(pk) };
}

export function keysFromNsec(nsec: string): { sk: Uint8Array; pk: string; npub: string } {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== "nsec") {
    throw new Error("Invalid key: expected nsec format");
  }
  const sk = decoded.data as Uint8Array;
  const pk = getPublicKey(sk);
  return { sk, pk, npub: nip19.npubEncode(pk) };
}

export function pubkeyFromNpub(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== "npub") {
    throw new Error("Invalid key: expected npub format");
  }
  return decoded.data as string;
}

export function npubFromPubkey(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

export function shortenKey(pubkey: string): string {
  const npub = npubFromPubkey(pubkey);
  return npub.slice(0, 12) + "..." + npub.slice(-4);
}

// ── NIP-07 Browser Extension ──

export async function getPublicKeyFromExtension(): Promise<string | null> {
  const ext = (window as unknown as Record<string, unknown>).nostr as { getPublicKey: () => Promise<string> } | undefined;
  if (!ext) return null;
  try { return await ext.getPublicKey(); } catch { return null; }
}

export async function signEventWithExtension(event: EventTemplate): Promise<Event | null> {
  const ext = (window as unknown as Record<string, unknown>).nostr as { signEvent: (event: EventTemplate) => Promise<Event> } | undefined;
  if (!ext) return null;
  try { return await ext.signEvent(event); } catch { return null; }
}

import { getCached, putCache, TTL } from "./cache";

/** Whether the browser is currently offline */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

// ── Query Functions ──

function isUsableRepo(r: RepoAnnouncement): boolean {
  return r.name.length > 0 && r.cloneUrls.length > 0;
}

export async function fetchRepos(
  relays: string[] = DEFAULT_RELAYS, limit = 50
): Promise<RepoAnnouncement[]> {
  const filter = { kinds: [REPO_ANNOUNCEMENT], limit };
  const parser = (evts: Event[]) => evts.map(parseRepoAnnouncement).filter(Boolean) as RepoAnnouncement[];
  const cached = await getCached(filter, parser);
  if (cached && !cached.stale) return cached.data.filter(isUsableRepo);

  try {
    const events = await pool.querySync(relays, filter);
    const parsed = events.map(parseRepoAnnouncement).filter(Boolean) as RepoAnnouncement[];
    putCache(filter, events, TTL.LIST);
    return parsed.filter(isUsableRepo);
  } catch {
    // Offline: return stale cache if available
    if (cached) return cached.data.filter(isUsableRepo);
    return [];
  }
}

export async function fetchReposByPubkey(
  pubkey: string, relays: string[] = DEFAULT_RELAYS
): Promise<RepoAnnouncement[]> {
  const events = await pool.querySync(relays, { kinds: [REPO_ANNOUNCEMENT], authors: [pubkey] });
  return events.map(parseRepoAnnouncement).filter(Boolean) as RepoAnnouncement[];
}

export async function fetchRepo(
  pubkey: string, identifier: string, relays: string[] = DEFAULT_RELAYS
): Promise<RepoAnnouncement | null> {
  const filter = { kinds: [REPO_ANNOUNCEMENT], authors: [pubkey], "#d": [identifier], limit: 1 };
  const parser = (evts: Event[]) => evts.map(parseRepoAnnouncement).filter(Boolean) as RepoAnnouncement[];
  const cached = await getCached(filter, parser);
  if (cached && !cached.stale && cached.data.length > 0) return cached.data[0];

  try {
    const events = await pool.querySync(relays, filter);
    if (events.length > 0) putCache(filter, events, TTL.REPO);
    return events.length > 0 ? parseRepoAnnouncement(events[0]) : null;
  } catch {
    if (cached && cached.data.length > 0) return cached.data[0];
    return null;
  }
}

export async function fetchRepoState(
  pubkey: string, identifier: string, relays: string[] = DEFAULT_RELAYS
): Promise<RepoState | null> {
  const events = await pool.querySync(relays, {
    kinds: [REPO_STATE], authors: [pubkey], "#d": [identifier], limit: 1,
  });
  if (events.length === 0) return null;
  return parseRepoState(events[0], identifier);
}

export async function fetchIssues(
  repoAddress: string, relays: string[] = DEFAULT_RELAYS
): Promise<IssueEvent[]> {
  const filter = { kinds: [ISSUE], "#a": [repoAddress] };
  const parser = (evts: Event[]) => evts.map(parseIssue).filter(Boolean) as IssueEvent[];
  const cached = await getCached(filter, parser);
  if (cached && !cached.stale) return cached.data;

  try {
    const events = await pool.querySync(relays, filter);
    putCache(filter, events, TTL.LIST);
    return events.map(parseIssue).filter(Boolean) as IssueEvent[];
  } catch {
    if (cached) return cached.data;
    return [];
  }
}

export async function fetchPatches(
  repoAddress: string, relays: string[] = DEFAULT_RELAYS
): Promise<PatchEvent[]> {
  const filter = { kinds: [PATCH], "#a": [repoAddress] };
  const parser = (evts: Event[]) => evts.map(parsePatch).filter(Boolean) as PatchEvent[];
  const cached = await getCached(filter, parser);
  if (cached && !cached.stale) return cached.data;

  try {
    const events = await pool.querySync(relays, filter);
    putCache(filter, events, TTL.LIST);
    return events.map(parsePatch).filter(Boolean) as PatchEvent[];
  } catch {
    if (cached) return cached.data;
    return [];
  }
}

export async function fetchPullRequests(
  repoAddress: string, relays: string[] = DEFAULT_RELAYS
): Promise<PullRequestEvent[]> {
  const filter = { kinds: [PULL_REQUEST], "#a": [repoAddress] };
  const parser = (evts: Event[]) => evts.map(parsePullRequest).filter(Boolean) as PullRequestEvent[];
  const cached = await getCached(filter, parser);
  if (cached && !cached.stale) return cached.data;

  try {
    const events = await pool.querySync(relays, filter);
    putCache(filter, events, TTL.LIST);
    return events.map(parsePullRequest).filter(Boolean) as PullRequestEvent[];
  } catch {
    if (cached) return cached.data;
    return [];
  }
}

export async function fetchComments(
  rootId: string, relays: string[] = DEFAULT_RELAYS
): Promise<CommentEvent[]> {
  try {
    const events = await pool.querySync(relays, { kinds: [COMMENT], "#E": [rootId] });
    return events.map(parseComment).filter(Boolean) as CommentEvent[];
  } catch {
    return [];
  }
}

export async function fetchStatuses(
  targetIds: string[], relays: string[] = DEFAULT_RELAYS
): Promise<StatusEvent[]> {
  if (targetIds.length === 0) return [];
  try {
    const events = await pool.querySync(relays, {
      kinds: [STATUS_OPEN, STATUS_APPLIED, STATUS_CLOSED, STATUS_DRAFT], "#e": targetIds,
    });
    return events.map(parseStatus).filter(Boolean) as StatusEvent[];
  } catch {
    return [];
  }
}

export async function fetchProfiles(
  pubkeys: string[], relays: string[] = DEFAULT_RELAYS
): Promise<Map<string, UserProfile>> {
  if (pubkeys.length === 0) return new Map();
  const unique = [...new Set(pubkeys)];

  const parseProfileEvents = (events: Event[]): UserProfile[] => {
    const results: UserProfile[] = [];
    for (const event of events) {
      try {
        const meta = JSON.parse(event.content);
        // Validate image URLs — only allow http(s) to prevent javascript:/data: XSS
        const sanitizeUrl = (u: unknown): string | undefined => {
          if (typeof u !== "string" || !u) return undefined;
          try { const p = new URL(u); return (p.protocol === "https:" || p.protocol === "http:") ? u : undefined; } catch { return undefined; }
        };
        results.push({
          pubkey: event.pubkey, name: meta.name, displayName: meta.display_name,
          about: meta.about, picture: sanitizeUrl(meta.picture) || sanitizeUrl(meta.image), nip05: meta.nip05, banner: sanitizeUrl(meta.banner), lud16: meta.lud16,
        });
      } catch { /* skip */ }
    }
    return results;
  };

  const filter = { kinds: [0], authors: unique };
  const cached = await getCached(filter, parseProfileEvents);
  if (cached && !cached.stale) {
    const profiles = new Map<string, UserProfile>();
    for (const p of cached.data) profiles.set(p.pubkey, p);
    return profiles;
  }

  try {
    const events = await pool.querySync(relays, filter);
    putCache(filter, events, TTL.PROFILE);
    const profiles = new Map<string, UserProfile>();
    for (const p of parseProfileEvents(events)) profiles.set(p.pubkey, p);
    return profiles;
  } catch {
    if (cached) {
      const profiles = new Map<string, UserProfile>();
      for (const p of cached.data) profiles.set(p.pubkey, p);
      return profiles;
    }
    return new Map();
  }
}

// ── Snippets ──

const CODE_EXTENSIONS = /\.(js|ts|jsx|tsx|py|rs|go|rb|java|c|cpp|h|cs|php|sh|bash|zsh|sql|html|css|scss|json|yaml|yml|toml|xml|md|sol|zig|lua|swift|kt|dart|ex|exs|hs|ml|r|pl|ps1|bat|asm|wasm|nix|tf)$/i;

function looksLikeCode(s: CodeSnippetEvent): boolean {
  if (s.language) return true;
  if (s.name && CODE_EXTENSIONS.test(s.name)) return true;
  if (s.content.split('\n').length >= 3) return true;
  return false;
}

export async function fetchSnippets(
  relays: string[] = DEFAULT_RELAYS, limit = 50
): Promise<CodeSnippetEvent[]> {
  const events = await pool.querySync(relays, { kinds: [CODE_SNIPPET], limit });
  return (events.map(parseSnippet).filter(Boolean) as CodeSnippetEvent[]).filter(looksLikeCode);
}

export async function fetchSnippetById(
  id: string, relays: string[] = DEFAULT_RELAYS
): Promise<CodeSnippetEvent | null> {
  const events = await pool.querySync(relays, { kinds: [CODE_SNIPPET], ids: [id], limit: 1 });
  return events.length > 0 ? parseSnippet(events[0]) : null;
}

export async function publishSnippet(
  sk: Signer,
  snippet: {
    content: string; language?: string; name?: string;
    description?: string; runtime?: string; license?: string; repoAddress?: string;
  },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const tags: string[][] = [];
  if (snippet.language) tags.push(["l", snippet.language]);
  if (snippet.name) tags.push(["name", snippet.name]);
  if (snippet.description) tags.push(["description", snippet.description]);
  if (snippet.runtime) tags.push(["runtime", snippet.runtime]);
  if (snippet.license) tags.push(["license", snippet.license]);
  if (snippet.repoAddress) tags.push(["a", snippet.repoAddress]);
  if (snippet.name) {
    const ext = snippet.name.split(".").pop();
    if (ext) tags.push(["extension", ext]);
  }
  const event = await signWith(sk,
    { kind: CODE_SNIPPET, content: snippet.content, tags, created_at: Math.floor(Date.now() / 1000) }
  );
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

// ── Notifications ──

export async function fetchNotifications(
  pubkey: string, since: number, relays: string[] = DEFAULT_RELAYS
): Promise<NotificationItem[]> {
  const events = await pool.querySync(relays, {
    kinds: [COMMENT, ISSUE, PATCH, PULL_REQUEST, STATUS_OPEN, STATUS_APPLIED, STATUS_CLOSED, BOUNTY],
    "#p": [pubkey], since, limit: 100,
  });
  return events
    .filter((e) => e.pubkey !== pubkey)
    .map((e) => ({
      id: e.id, kind: e.kind,
      content: e.content.slice(0, 120),
      fromPubkey: e.pubkey,
      targetId: getTagValue(e, "e") ?? getTagValue(e, "E") ?? e.id,
      createdAt: e.created_at,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ── Publish Functions ──

export async function publishRepo(
  sk: Signer,
  repo: {
    identifier: string; name: string; description: string;
    cloneUrls: string[]; webUrls?: string[]; relays?: string[];
    tags?: string[]; isFork?: boolean; isPrivate?: boolean; upstreamAddress?: string;
  },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const tags: string[][] = [
    ["d", repo.identifier], ["name", repo.name], ["description", repo.description],
  ];
  if (repo.cloneUrls.length > 0) tags.push(["clone", ...repo.cloneUrls]);
  if (repo.webUrls && repo.webUrls.length > 0) tags.push(["web", ...repo.webUrls]);
  if (repo.relays && repo.relays.length > 0) tags.push(["relays", ...repo.relays]);
  if (repo.isFork) tags.push(["t", "personal-fork"]);
  if (repo.isPrivate) tags.push(["t", "private"]);
  if (repo.upstreamAddress) tags.push(["a", repo.upstreamAddress]);
  for (const t of repo.tags ?? []) tags.push(["t", t]);

  const event = await signWith(sk,
    { kind: REPO_ANNOUNCEMENT, content: "", tags, created_at: Math.floor(Date.now() / 1000) }
  );
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

export async function publishIssue(
  sk: Signer,
  issue: { repoAddress: string; repoPubkey: string; subject: string; content: string; labels?: string[] },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const tags: string[][] = [
    ["a", issue.repoAddress], ["p", issue.repoPubkey], ["subject", issue.subject],
  ];
  for (const l of issue.labels ?? []) tags.push(["t", l]);
  const event = await signWith(sk,
    { kind: ISSUE, content: issue.content, tags, created_at: Math.floor(Date.now() / 1000) }
  );
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

export async function publishPatch(
  sk: Signer,
  patch: {
    repoAddress: string;
    repoPubkey: string;
    content: string;
    commitId?: string;
    parentCommitId?: string;
  },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const tags: string[][] = [
    ["a", patch.repoAddress],
    ["p", patch.repoPubkey],
    ["t", "root"],
  ];
  if (patch.commitId) tags.push(["commit", patch.commitId]);
  if (patch.parentCommitId) tags.push(["parent-commit", patch.parentCommitId]);
  const event = await signWith(sk,
    { kind: PATCH, content: patch.content, tags, created_at: Math.floor(Date.now() / 1000) }
  );
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

export async function publishPullRequest(
  sk: Signer,
  pr: {
    repoAddress: string;
    repoPubkey: string;
    subject: string;
    content: string;
    cloneUrl: string;
    branchName: string;
    commitId?: string;
    mergeBase?: string;
    labels?: string[];
  },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const tags: string[][] = [
    ["a", pr.repoAddress],
    ["p", pr.repoPubkey],
    ["subject", pr.subject],
    ["clone", pr.cloneUrl],
    ["branch-name", pr.branchName],
  ];
  if (pr.commitId) tags.push(["c", pr.commitId]);
  if (pr.mergeBase) tags.push(["merge-base", pr.mergeBase]);
  for (const l of pr.labels ?? []) tags.push(["t", l]);
  const event = await signWith(sk,
    { kind: PULL_REQUEST, content: pr.content, tags, created_at: Math.floor(Date.now() / 1000) }
  );
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

export async function publishBountyClaim(
  sk: Signer,
  params: {
    bountyId: string;
    bountyPubkey: string;
    repoAddress: string;
    content: string;
  },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const event = await signWith(sk, {
    kind: BOUNTY,
    content: params.content,
    tags: [
      ["e", params.bountyId, "", "reply"],
      ["a", params.repoAddress],
      ["p", params.bountyPubkey],
      ["status", "claimed"],
    ],
    created_at: Math.floor(Date.now() / 1000),
  });
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

export async function publishBountyPayment(
  sk: Signer,
  params: {
    bountyId: string;
    claimantPubkey: string;
    repoAddress: string;
    content: string;
  },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const event = await signWith(sk, {
    kind: BOUNTY,
    content: params.content,
    tags: [
      ["e", params.bountyId, "", "reply"],
      ["a", params.repoAddress],
      ["p", params.claimantPubkey],
      ["status", "paid"],
    ],
    created_at: Math.floor(Date.now() / 1000),
  });
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

export async function fetchBountyUpdates(
  bountyIds: string[],
  relays: string[] = DEFAULT_RELAYS
): Promise<Map<string, { status: "claimed" | "paid"; claimedBy?: string }>> {
  if (bountyIds.length === 0) return new Map();
  const events = await pool.querySync(relays, { kinds: [BOUNTY], "#e": bountyIds });
  const result = new Map<string, { status: "claimed" | "paid"; claimedBy?: string }>();

  // Process events in chronological order so latest status wins
  const sorted = events.sort((a, b) => a.created_at - b.created_at);
  for (const e of sorted) {
    const bountyId = e.tags.find((t) => t[0] === "e")?.[1];
    const status = e.tags.find((t) => t[0] === "status")?.[1];
    if (!bountyId || (status !== "claimed" && status !== "paid")) continue;

    const existing = result.get(bountyId);
    if (status === "claimed") {
      result.set(bountyId, { status: "claimed", claimedBy: e.pubkey });
    } else if (status === "paid") {
      result.set(bountyId, { status: "paid", claimedBy: existing?.claimedBy ?? e.tags.find((t) => t[0] === "p")?.[1] });
    }
  }
  return result;
}

export async function publishComment(
  sk: Signer,
  comment: {
    rootId: string; rootKind: number; rootPubkey: string;
    parentId: string; parentKind: number; parentPubkey: string;
    content: string; repoAddress?: string;
    filePath?: string; lineNumber?: number; diffSide?: "old" | "new";
  },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const tags: string[][] = [
    ["E", comment.rootId], ["K", String(comment.rootKind)], ["P", comment.rootPubkey],
    ["e", comment.parentId], ["k", String(comment.parentKind)], ["p", comment.parentPubkey],
  ];
  if (comment.repoAddress) tags.push(["a", comment.repoAddress]);
  if (comment.filePath) tags.push(["file", comment.filePath]);
  if (comment.lineNumber !== undefined)
    tags.push(["line", String(comment.lineNumber), comment.diffSide ?? "new"]);

  const event = await signWith(sk,
    { kind: COMMENT, content: comment.content, tags, created_at: Math.floor(Date.now() / 1000) }
  );
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

export async function publishStatus(
  sk: Signer,
  status: { kind: StatusKind; targetId: string; targetPubkey: string; repoAddress?: string; content?: string },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const tags: string[][] = [["e", status.targetId, "", "root"], ["p", status.targetPubkey]];
  if (status.repoAddress) tags.push(["a", status.repoAddress]);
  const event = await signWith(sk,
    { kind: status.kind, content: status.content ?? "", tags, created_at: Math.floor(Date.now() / 1000) }
  );
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

// ── Parsers ──

export function parseRepoAnnouncement(event: Event): RepoAnnouncement | null {
  const identifier = getTagValue(event, "d");
  if (!identifier) return null;
  const tTags = getTagValues(event, "t");
  const isFork = tTags.includes("personal-fork");
  // If it's a fork, find the upstream repo address from `a` tags
  let upstreamAddress: string | undefined;
  if (isFork) {
    const aTag = event.tags.find(
      (t) => t[0] === "a" && t[1]?.startsWith(`${REPO_ANNOUNCEMENT}:`)
    );
    if (aTag) upstreamAddress = aTag[1];
  }
  return {
    id: event.id, pubkey: event.pubkey, identifier,
    name: getTagValue(event, "name") ?? identifier,
    description: getTagValue(event, "description") ?? "",
    webUrls: getMultiValueTag(event, "web"),
    cloneUrls: getMultiValueTag(event, "clone"),
    relays: getMultiValueTag(event, "relays"),
    earliestUniqueCommit: event.tags.find((t) => t[0] === "r" && t[2] === "euc")?.[1],
    maintainers: getMultiValueTag(event, "maintainers"),
    tags: tTags.filter((t) => t !== "personal-fork" && t !== "private"),
    isPersonalFork: isFork,
    isPrivate: tTags.includes("private"),
    upstreamAddress,
    createdAt: event.created_at,
  };
}

function parseRepoState(event: Event, identifier: string): RepoState {
  const refs: Record<string, string> = {};
  let head: string | undefined;
  for (const tag of event.tags) {
    if (tag[0] === "HEAD") {
      head = tag[1];
    } else if (tag[0]?.startsWith("refs/")) {
      refs[tag[0]] = tag[1];
    }
  }
  return { identifier, refs, head };
}

export function parseIssue(event: Event): IssueEvent | null {
  return {
    id: event.id, pubkey: event.pubkey, content: event.content,
    repoAddress: getTagValue(event, "a") ?? "",
    subject: getTagValue(event, "subject") ?? "(no subject)",
    labels: getTagValues(event, "t"), createdAt: event.created_at,
  };
}

export function parsePatch(event: Event): PatchEvent | null {
  const tTags = getTagValues(event, "t");
  return {
    id: event.id, pubkey: event.pubkey, content: event.content,
    repoAddress: getTagValue(event, "a") ?? "",
    isRoot: tTags.includes("root"), isRootRevision: tTags.includes("root-revision"),
    commitId: getTagValue(event, "commit"),
    parentCommitId: getTagValue(event, "parent-commit"),
    createdAt: event.created_at,
  };
}

export function parsePullRequest(event: Event): PullRequestEvent | null {
  return {
    id: event.id, pubkey: event.pubkey, content: event.content,
    repoAddress: getTagValue(event, "a") ?? "",
    subject: getTagValue(event, "subject") ?? "(no subject)",
    commitId: getTagValue(event, "c") ?? "",
    cloneUrls: getMultiValueTag(event, "clone"),
    branchName: getTagValue(event, "branch-name"),
    labels: getTagValues(event, "t"),
    mergeBase: getTagValue(event, "merge-base"),
    createdAt: event.created_at,
  };
}

export function parseComment(event: Event): CommentEvent | null {
  const fileTag = event.tags.find((t) => t[0] === "file");
  const lineTag = event.tags.find((t) => t[0] === "line");
  return {
    id: event.id, pubkey: event.pubkey, content: event.content,
    rootId: getTagValue(event, "E") ?? "",
    rootKind: parseInt(getTagValue(event, "K") ?? "0", 10),
    parentId: getTagValue(event, "e") ?? "",
    parentKind: parseInt(getTagValue(event, "k") ?? "0", 10),
    createdAt: event.created_at,
    filePath: fileTag?.[1],
    lineNumber: lineTag ? parseInt(lineTag[1], 10) : undefined,
    diffSide: lineTag?.[2] as "old" | "new" | undefined,
  };
}

function parseStatus(event: Event): StatusEvent | null {
  const eTag = event.tags.find((t) => t[0] === "e");
  if (!eTag) return null;
  return {
    id: event.id, pubkey: event.pubkey, kind: event.kind as StatusKind,
    content: event.content, targetId: eTag[1],
    repoAddress: getTagValue(event, "a"), createdAt: event.created_at,
  };
}

function tryDecodeBase64(str: string): string | null {
  // Only attempt if it looks like base64: single line of valid chars, length is a multiple of 4 (or has padding)
  if (!/^[A-Za-z0-9+/\n\r]+=*$/.test(str.trim())) return null;
  // Must be reasonably long and not contain obvious plaintext patterns
  const trimmed = str.trim();
  if (trimmed.length < 20) return null;
  try {
    const decoded = atob(trimmed.replace(/\s/g, ""));
    // Verify it produced valid UTF-8 text (not binary garbage)
    // Check that most characters are printable ASCII or common whitespace
    let printable = 0;
    for (let i = 0; i < Math.min(decoded.length, 200); i++) {
      const c = decoded.charCodeAt(i);
      if ((c >= 32 && c <= 126) || c === 9 || c === 10 || c === 13) printable++;
    }
    const ratio = printable / Math.min(decoded.length, 200);
    if (ratio > 0.9) return decoded;
  } catch {
    // not valid base64
  }
  return null;
}

function parseSnippet(event: Event): CodeSnippetEvent | null {
  // Some clients encode snippet content as base64 — detect and decode
  const rawContent = event.content;
  const decoded = tryDecodeBase64(rawContent);

  return {
    id: event.id, pubkey: event.pubkey, content: decoded ?? rawContent,
    language: getTagValue(event, "l"),
    name: getTagValue(event, "name"),
    extension: getTagValue(event, "extension"),
    description: getTagValue(event, "description"),
    runtime: getTagValue(event, "runtime"),
    license: getTagValue(event, "license"),
    repoAddress: getTagValue(event, "a"),
    createdAt: event.created_at,
  };
}

// ── Reactions (NIP-25) ──

export async function fetchReactions(
  targetIds: string[], relays: string[] = DEFAULT_RELAYS
): Promise<ReactionEvent[]> {
  if (targetIds.length === 0) return [];
  const events = await pool.querySync(relays, { kinds: [REACTION], "#e": targetIds });
  return events.map((e) => ({
    id: e.id,
    pubkey: e.pubkey,
    content: e.content,
    targetId: getTagValue(e, "e") ?? "",
    targetPubkey: getTagValue(e, "p") ?? "",
    createdAt: e.created_at,
  })).filter((r) => r.content === "+" || r.content === "🤙" || r.content === "⭐");
}

export async function publishReaction(
  sk: Signer,
  reaction: { targetId: string; targetPubkey: string; content?: string },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const event = await signWith(sk, {
    kind: REACTION,
    content: reaction.content ?? "+",
    tags: [["e", reaction.targetId], ["p", reaction.targetPubkey]],
    created_at: Math.floor(Date.now() / 1000),
  });
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

// ── Reviews (NIP-25 with review tag) ──

export async function fetchReviews(
  targetIds: string[], relays: string[] = DEFAULT_RELAYS
): Promise<ReviewEvent[]> {
  if (targetIds.length === 0) return [];
  const events = await pool.querySync(relays, { kinds: [REACTION], "#e": targetIds });
  return events
    .filter((e) => e.tags.some((t) => t[0] === "review"))
    .map((e) => {
      const verdict = e.content as ReviewVerdict;
      if (verdict !== "approve" && verdict !== "request-changes" && verdict !== "comment") return null;
      const reviewTag = e.tags.find((t) => t[0] === "review");
      return {
        id: e.id,
        pubkey: e.pubkey,
        content: reviewTag?.[1] ?? "",
        targetId: getTagValue(e, "e") ?? "",
        verdict,
        createdAt: e.created_at,
      };
    })
    .filter(Boolean) as ReviewEvent[];
}

export async function publishReview(
  sk: Signer,
  review: { targetId: string; targetPubkey: string; verdict: ReviewVerdict; comment?: string },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const event = await signWith(sk, {
    kind: REACTION,
    content: review.verdict,
    tags: [
      ["e", review.targetId],
      ["p", review.targetPubkey],
      ["review", review.comment ?? ""],
    ],
    created_at: Math.floor(Date.now() / 1000),
  });
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

// ── Deletion (NIP-09) ──

export async function publishDeletion(
  sk: Signer,
  eventIds: string[],
  reason = "",
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const event = await signWith(sk, {
    kind: 5,
    content: reason,
    tags: eventIds.map((id) => ["e", id]),
    created_at: Math.floor(Date.now() / 1000),
  });
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

// ── Profile (NIP-01) ──

export async function publishProfile(
  sk: Signer,
  profile: { name?: string; displayName?: string; about?: string; picture?: string; nip05?: string; banner?: string; lud16?: string },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const content = JSON.stringify({
    name: profile.name,
    display_name: profile.displayName,
    about: profile.about,
    picture: profile.picture,
    nip05: profile.nip05,
    banner: profile.banner,
    lud16: profile.lud16,
  });
  const event = await signWith(sk, {
    kind: PROFILE_METADATA,
    content,
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  });
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

// ── Zaps (NIP-57) ──

export async function fetchZapReceipts(
  targetIds: string[], relays: string[] = DEFAULT_RELAYS
): Promise<ZapReceiptEvent[]> {
  if (targetIds.length === 0) return [];
  const events = await pool.querySync(relays, { kinds: [ZAP_RECEIPT], "#e": targetIds });
  return events.map((e) => {
    const bolt11 = getTagValue(e, "bolt11") ?? "";
    const descTag = getTagValue(e, "description");
    let amountMsats = 0;
    if (descTag) {
      try {
        const desc = JSON.parse(descTag);
        const amountTag = desc.tags?.find((t: string[]) => t[0] === "amount");
        if (amountTag) {
          const parsed = parseInt(amountTag[1], 10);
          if (Number.isFinite(parsed) && parsed >= 0) amountMsats = parsed;
        }
      } catch { /* skip */ }
    }
    return {
      id: e.id,
      pubkey: e.pubkey,
      targetId: getTagValue(e, "e") ?? "",
      targetPubkey: getTagValue(e, "p") ?? "",
      bolt11,
      amountMsats,
      createdAt: e.created_at,
    };
  });
}

// ── Zap Sending (NIP-57) ──

export interface LnurlPayInfo {
  callback: string;
  minSendable: number; // msats
  maxSendable: number; // msats
  allowsNostr: boolean;
  nostrPubkey?: string;
}

export async function resolveLud16(lud16: string): Promise<LnurlPayInfo> {
  const [name, domain] = lud16.split("@");
  if (!name || !domain) throw new Error("Invalid lightning address");
  // Validate domain to prevent SSRF against internal networks
  if (domain.length > 253 || !/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(domain)) {
    throw new Error("Invalid domain in lightning address");
  }
  const lowerDomain = domain.toLowerCase();
  if (lowerDomain === "localhost" || lowerDomain.endsWith(".local") || lowerDomain.endsWith(".internal")) {
    throw new Error("Invalid domain in lightning address");
  }
  // Validate name to prevent path traversal
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error("Invalid username in lightning address");
  }
  const res = await fetch(`https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("Failed to reach lightning address server");
  const data = await res.json();
  if (data.status === "ERROR") throw new Error(data.reason || "LNURL error");
  return {
    callback: data.callback,
    minSendable: data.minSendable ?? 1000,
    maxSendable: data.maxSendable ?? 100000000000,
    allowsNostr: !!data.allowsNostr,
    nostrPubkey: data.nostrPubkey,
  };
}

export async function requestZapInvoice(
  sk: Signer,
  params: {
    recipientPubkey: string;
    targetId: string;
    amountMsats: number;
    lnurlPayInfo: LnurlPayInfo;
    content?: string;
    relays?: string[];
  }
): Promise<string> {
  const relays = params.relays ?? DEFAULT_RELAYS;

  // Build NIP-57 zap request (kind 9734)
  const zapRequest = await signWith(sk, {
    kind: ZAP_REQUEST,
    content: params.content ?? "",
    tags: [
      ["p", params.recipientPubkey],
      ["e", params.targetId],
      ["amount", String(params.amountMsats)],
      ["relays", ...relays],
    ],
    created_at: Math.floor(Date.now() / 1000),
  });

  // Validate callback URL before sending (SSRF prevention)
  let callbackUrl: URL;
  try {
    callbackUrl = new URL(params.lnurlPayInfo.callback);
  } catch {
    throw new Error("Invalid callback URL from lightning server");
  }
  if (callbackUrl.protocol !== "https:") {
    throw new Error("Callback URL must use HTTPS");
  }
  const cbHost = callbackUrl.hostname.toLowerCase();
  if (
    cbHost === "localhost" ||
    cbHost === "[::1]" ||
    /^127\./.test(cbHost) ||
    cbHost.endsWith(".local") ||
    cbHost.endsWith(".internal") ||
    cbHost.endsWith(".localhost") ||
    /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.)/.test(cbHost) ||
    cbHost === "169.254.169.254" || cbHost === "metadata.google.internal" ||
    /^\[?(fe80|fc|fd|::1|::ffff:127)/i.test(cbHost)
  ) {
    throw new Error("Callback URL points to a private network");
  }
  const separator = params.lnurlPayInfo.callback.includes("?") ? "&" : "?";
  const url = `${params.lnurlPayInfo.callback}${separator}amount=${params.amountMsats}&nostr=${encodeURIComponent(JSON.stringify(zapRequest))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to get invoice from lightning server");
  const data = await res.json();
  if (data.status === "ERROR") throw new Error(data.reason || "Invoice error");
  if (!data.pr) throw new Error("No invoice returned");
  return data.pr; // bolt11 invoice
}

// ── Contact List (NIP-02) ──

export async function fetchFollowing(
  pubkey: string, relays: string[] = DEFAULT_RELAYS
): Promise<string[]> {
  const events = await pool.querySync(relays, { kinds: [CONTACT_LIST], authors: [pubkey], limit: 1 });
  if (events.length === 0) return [];
  const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
  return latest.tags.filter((t) => t[0] === "p").map((t) => t[1]);
}

export async function fetchFollowers(
  pubkey: string, relays: string[] = DEFAULT_RELAYS
): Promise<string[]> {
  const events = await pool.querySync(relays, { kinds: [CONTACT_LIST], "#p": [pubkey], limit: 500 });
  return [...new Set(events.map((e) => e.pubkey))];
}

export async function publishContactList(
  sk: Signer, following: string[], relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  const tags = following.map((pk) => ["p", pk]);
  const event = await signWith(sk, {
    kind: CONTACT_LIST, content: "", tags, created_at: Math.floor(Date.now() / 1000),
  });
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

// ── Utilities ──

export function repoAddress(pubkey: string, identifier: string): string {
  return `${REPO_ANNOUNCEMENT}:${pubkey}:${identifier}`;
}

export function parseRepoAddress(addr: string): { pubkey: string; identifier: string } | null {
  const parts = addr.split(":");
  if (parts.length !== 3 || parts[0] !== String(REPO_ANNOUNCEMENT)) return null;
  return { pubkey: parts[1], identifier: parts[2] };
}

export function statusColor(kind: StatusKind): string {
  switch (kind) {
    case STATUS_OPEN: return "text-green";
    case STATUS_APPLIED: return "text-purple";
    case STATUS_CLOSED: return "text-red";
    case STATUS_DRAFT: return "text-text-secondary";
    default: return "text-text-secondary";
  }
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

// ── NIP-98 Media Upload ──

const NIP98_KIND = 27235;

/**
 * Upload a file to a NIP-96 compatible media server using NIP-98 HTTP Auth.
 * Returns the public URL of the uploaded file.
 */
export async function uploadImage(
  sk: Signer,
  file: File,
  uploadUrl = "https://nostr.build/api/v2/upload/files"
): Promise<string> {
  // Validate upload URL to prevent SSRF — only allow HTTPS to known image hosts
  try {
    const u = new URL(uploadUrl);
    if (u.protocol !== "https:") throw new Error("Upload URL must use HTTPS");
  } catch (e: unknown) {
    throw new Error(e instanceof Error ? e.message : "Invalid upload URL");
  }
  // Create NIP-98 auth event (kind 27235)
  const authEvent = await signWith(sk, {
    kind: NIP98_KIND,
    content: "",
    tags: [
      ["u", uploadUrl],
      ["method", "POST"],
    ],
    created_at: Math.floor(Date.now() / 1000),
  });

  // Base64-encode the signed event for the Authorization header
  const token = btoa(JSON.stringify(authEvent));

  const formData = new FormData();
  formData.append("file[]", file);

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Nostr ${token}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }

  const json = await res.json();

  if (json.status !== "success" || !json.data?.[0]?.url) {
    throw new Error(json.message || "Upload failed — no URL returned");
  }

  return json.data[0].url;
}

// ── Repo File Blobs ──

export async function fetchRepoFiles(
  addr: string,
  relays: string[] = DEFAULT_RELAYS,
  branch?: string
): Promise<FileBlobEvent[]> {
  const events = await pool.querySync(relays, {
    kinds: [REPO_FILE_BLOB],
    "#a": [addr],
    limit: 500,
  });

  // Filter by branch client-side
  // Files without a branch tag are considered to be on "main" branch
  const filtered = branch
    ? events.filter((e) => {
        const fileBranch = e.tags.find((t: string[]) => t[0] === "branch")?.[1] ?? "main";
        return fileBranch === branch;
      })
    : events;

  // Deduplicate by d-tag (keep latest created_at)
  const byDTag = new Map<string, FileBlobEvent>();
  for (const e of filtered) {
    const dTag = getTagValue(e, "d") ?? "";
    const existing = byDTag.get(dTag);
    if (existing && existing.createdAt >= e.created_at) continue;
    const filePath = getTagValue(e, "path") ?? "";
    if (!filePath) continue;
    const isDeleted = e.tags.some((t) => t[0] === "deleted" && t[1] === "true");
    byDTag.set(dTag, {
      id: e.id,
      pubkey: e.pubkey,
      content: e.content,
      repoAddress: getTagValue(e, "a") ?? addr,
      filePath,
      mimeType: getTagValue(e, "m"),
      isDeleted,
      createdAt: e.created_at,
    });
  }

  // Filter out deleted files
  return [...byDTag.values()].filter((f) => !f.isDeleted);
}

export async function fetchFileHistory(
  repoAddr: string,
  filePath: string,
  relays: string[] = DEFAULT_RELAYS
): Promise<FileBlobEvent[]> {
  const dTag = `${repoAddr}/${filePath}`;
  const events = await pool.querySync(relays, {
    kinds: [REPO_FILE_BLOB],
    "#d": [dTag],
    limit: 50,
  });
  return events
    .map((e) => ({
      id: e.id,
      pubkey: e.pubkey,
      content: e.content,
      repoAddress: getTagValue(e, "a") ?? repoAddr,
      filePath: getTagValue(e, "path") ?? filePath,
      mimeType: getTagValue(e, "m"),
      isDeleted: e.tags.some((t: string[]) => t[0] === "deleted" && t[1] === "true"),
      createdAt: e.created_at,
    }))
    .filter((f) => !f.isDeleted)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchRepoBranches(
  addr: string,
  relays: string[] = DEFAULT_RELAYS
): Promise<string[]> {
  const events = await pool.querySync(relays, {
    kinds: [REPO_FILE_BLOB],
    "#a": [addr],
    limit: 500,
  });
  const branches = new Set<string>(["main"]);
  for (const e of events) {
    const branch = e.tags.find((t: string[]) => t[0] === "branch")?.[1];
    if (branch) branches.add(branch);
  }
  return [...branches].sort();
}

export async function publishFileBlob(
  sk: Signer,
  file: {
    repoAddress: string;
    repoPubkey: string;
    filePath: string;
    content: string;
    mimeType?: string;
    branch?: string;
  },
  relays: string[] = DEFAULT_RELAYS
): Promise<Event> {
  // Defense-in-depth path validation
  const normalized = file.filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error("Invalid file path");
  }
  const dTag = `${file.repoAddress}/${normalized}`;
  const tags: string[][] = [
    ["d", dTag],
    ["a", file.repoAddress],
    ["path", normalized],
    ["p", file.repoPubkey],
  ];
  if (file.mimeType) tags.push(["m", file.mimeType]);
  if (file.branch) tags.push(["branch", file.branch]);

  const event = await signWith(sk, {
    kind: REPO_FILE_BLOB, content: file.content, tags, created_at: Math.floor(Date.now() / 1000),
  });
  await Promise.allSettled(pool.publish(relays, event));
  return event;
}

export async function deleteFileBlob(
  sk: Signer,
  file: { repoAddress: string; filePath: string; pubkey: string },
  relays: string[] = DEFAULT_RELAYS
): Promise<void> {
  const dTag = `${file.repoAddress}/${file.filePath}`;
  // Publish tombstone (replacement with deleted flag)
  const tombstone = await signWith(sk, {
    kind: REPO_FILE_BLOB,
    content: "",
    tags: [
      ["d", dTag],
      ["a", file.repoAddress],
      ["path", file.filePath],
      ["deleted", "true"],
    ],
    created_at: Math.floor(Date.now() / 1000),
  });
  await Promise.allSettled(pool.publish(relays, tombstone));

  // Also publish NIP-09 deletion event
  const deletion = await signWith(sk, {
    kind: DELETION,
    content: "File deleted",
    tags: [["a", `${REPO_FILE_BLOB}:${file.pubkey}:${dTag}`]],
    created_at: Math.floor(Date.now() / 1000),
  });
  await Promise.allSettled(pool.publish(relays, deletion));
}

export function buildFileTree(files: FileBlobEvent[]): FileEntry[] {
  const root: FileEntry[] = [];

  for (const file of files) {
    const parts = file.filePath.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const path = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;

      const existing = current.find((e) => e.name === name);
      if (existing) {
        if (!isFile && existing.children) {
          current = existing.children;
        }
      } else {
        const entry: FileEntry = {
          name,
          path,
          type: isFile ? "file" : "dir",
          children: isFile ? undefined : [],
        };
        current.push(entry);
        if (!isFile && entry.children) {
          current = entry.children;
        }
      }
    }
  }

  // Sort: dirs first, then files, alphabetically
  function sortEntries(entries: FileEntry[]) {
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const e of entries) {
      if (e.children) sortEntries(e.children);
    }
  }
  sortEntries(root);
  return root;
}
