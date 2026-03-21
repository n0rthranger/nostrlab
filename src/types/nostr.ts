// NIP-34 Event Kinds
export const REPO_ANNOUNCEMENT = 30617;
export const REPO_STATE = 30618;
export const PATCH = 1617;
export const PULL_REQUEST = 1618;
export const PR_UPDATE = 1619;
export const ISSUE = 1621;
export const COMMENT = 1111; // NIP-22
export const CODE_SNIPPET = 1337; // NIP-C0
export const GRASP_LIST = 10317;

// Contact List (NIP-02)
export const CONTACT_LIST = 3;

// Reaction (NIP-25)
export const REACTION = 7;

// Profile metadata (NIP-01)
export const PROFILE_METADATA = 0;

// Zap (NIP-57)
export const ZAP_REQUEST = 9734;
export const ZAP_RECEIPT = 9735;

// Discussions (custom kind for repo discussions)
export const DISCUSSION = 1622;

// Bounty (custom kind)
export const BOUNTY = 1623;

// Project Board (parameterized replaceable)
export const PROJECT_BOARD = 30819;

// CI Status (custom kind)
export const CI_STATUS = 1624;

// Encrypted DM (NIP-04)
export const ENCRYPTED_DM = 4;

// Long-form content (NIP-23)
export const LONG_FORM = 30023;

// Changelog (parameterized replaceable long-form content)
export const CHANGELOG = 30024;

// Teams (parameterized replaceable)
export const TEAM = 30820;

// Repo File Blob (parameterized replaceable)
export const REPO_FILE_BLOB = 31617;

// Deletion (NIP-09)
export const DELETION = 5;

// Status kinds
export const STATUS_OPEN = 1630;
export const STATUS_APPLIED = 1631;
export const STATUS_CLOSED = 1632;
export const STATUS_DRAFT = 1633;

export type StatusKind =
  | typeof STATUS_OPEN
  | typeof STATUS_APPLIED
  | typeof STATUS_CLOSED
  | typeof STATUS_DRAFT;

export interface RepoAnnouncement {
  id: string;
  pubkey: string;
  identifier: string;
  name: string;
  description: string;
  webUrls: string[];
  cloneUrls: string[];
  relays: string[];
  earliestUniqueCommit?: string;
  maintainers: string[];
  tags: string[];
  isPersonalFork: boolean;
  isPrivate: boolean;
  upstreamAddress?: string; // for forks: "30617:pubkey:identifier"
  createdAt: number;
}

export interface RepoState {
  identifier: string;
  refs: Record<string, string>;
  head?: string;
}

export interface PatchEvent {
  id: string;
  pubkey: string;
  content: string;
  repoAddress: string;
  isRoot: boolean;
  isRootRevision: boolean;
  commitId?: string;
  parentCommitId?: string;
  createdAt: number;
}

export interface PullRequestEvent {
  id: string;
  pubkey: string;
  content: string;
  repoAddress: string;
  subject: string;
  commitId: string;
  cloneUrls: string[];
  branchName?: string;
  labels: string[];
  mergeBase?: string;
  createdAt: number;
}

export interface IssueEvent {
  id: string;
  pubkey: string;
  content: string;
  repoAddress: string;
  subject: string;
  labels: string[];
  createdAt: number;
}

export interface CommentEvent {
  id: string;
  pubkey: string;
  content: string;
  rootId: string;
  rootKind: number;
  parentId: string;
  parentKind: number;
  createdAt: number;
  // Inline diff comment fields
  filePath?: string;
  lineNumber?: number;
  diffSide?: "old" | "new";
}

export interface StatusEvent {
  id: string;
  pubkey: string;
  kind: StatusKind;
  content: string;
  targetId: string;
  repoAddress?: string;
  createdAt: number;
}

export interface UserProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  banner?: string;
  lud16?: string;
}

export interface ReactionEvent {
  id: string;
  pubkey: string;
  content: string;
  targetId: string;
  targetPubkey: string;
  createdAt: number;
}

export interface ZapReceiptEvent {
  id: string;
  pubkey: string;
  targetId: string;
  targetPubkey: string;
  bolt11: string;
  amountMsats: number;
  createdAt: number;
}

// NIP-C0 Code Snippets
export interface CodeSnippetEvent {
  id: string;
  pubkey: string;
  content: string;
  language?: string;
  name?: string;
  extension?: string;
  description?: string;
  runtime?: string;
  license?: string;
  repoAddress?: string;
  createdAt: number;
}

// Discussion types
export interface DiscussionEvent {
  id: string;
  pubkey: string;
  content: string;
  repoAddress: string;
  subject: string;
  category: string;
  createdAt: number;
}

// Changelog types
export interface ChangelogEntry {
  id: string;
  pubkey: string;
  identifier: string;
  title: string;
  version: string;
  content: string;
  repoAddress: string;
  createdAt: number;
}

// Bounty types
export interface BountyEvent {
  id: string;
  pubkey: string;
  content: string;
  repoAddress: string;
  issueId?: string;
  amountSats: number;
  status: "open" | "claimed" | "paid";
  claimedBy?: string;
  createdAt: number;
}

export interface BountyUpdate {
  id: string;
  pubkey: string;
  bountyId: string;
  status: "claimed" | "paid";
  content: string;
  createdAt: number;
}

// CI Status types
export interface CIStatusEvent {
  id: string;
  pubkey: string;
  content: string;
  targetId: string;
  repoAddress: string;
  state: "pending" | "success" | "failure" | "error";
  context: string;
  targetUrl?: string;
  createdAt: number;
}

// Review approval types
export type ReviewVerdict = "approve" | "request-changes" | "comment";

export interface ReviewEvent {
  id: string;
  pubkey: string;
  content: string;
  targetId: string;
  verdict: ReviewVerdict;
  createdAt: number;
}

// Project Board types
export interface BoardColumn {
  name: string;
  issueIds: string[];
}

export interface ProjectBoard {
  id: string;
  pubkey: string;
  identifier: string;
  name: string;
  columns: BoardColumn[];
  repoAddress: string;
  createdAt: number;
}

// Team / Organization types
export interface TeamMember {
  pubkey: string;
  role: "owner" | "admin" | "member";
}

export interface Team {
  id: string;
  pubkey: string;
  identifier: string;
  name: string;
  description: string;
  members: TeamMember[];
  repos: string[];  // repo addresses (a-tags)
  createdAt: number;
}

// Repo File Blob types
export interface FileBlobEvent {
  id: string;
  pubkey: string;
  content: string;
  repoAddress: string;
  filePath: string;
  mimeType?: string;
  isDeleted: boolean;
  createdAt: number;
}

// Diff parsing types
export interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffFile {
  oldName: string;
  newName: string;
  hunks: DiffHunk[];
}

// File browser types
export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileEntry[];
}

// Notification types
export interface NotificationItem {
  id: string;
  kind: number;
  content: string;
  fromPubkey: string;
  targetId: string;
  createdAt: number;
}
