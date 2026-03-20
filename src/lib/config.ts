// ── Nostr Relay Configuration ──

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
  "wss://nostr.wine",
  "wss://purplepag.es",
  "wss://offchain.pub",
  "wss://nostr.mom",
] as const;

// ── External Service URLs ──

export const CORS_PROXY_URL = "https://cors.isomorphic-git.org";
export const GITHUB_API_BASE = "https://api.github.com";
export const DEFAULT_MEDIA_UPLOAD_URL = "https://nostr.build/api/v2/upload/files";

// ── Query Limits ──
// Maximum number of events to request from relays per query.

export const QUERY_LIMITS = {
  REPOS: 50,
  ISSUES: 200,
  PATCHES: 200,
  SNIPPETS: 50,
  COMMENTS: 200,
  NOTIFICATIONS: 100,
  FOLLOWERS: 500,
  FILES: 500,
  FILE_HISTORY: 50,
  SEARCH: 200,
  ACTIVITY: 100,
  CONTRIBUTIONS: 2000,
  MESSAGES: 500,
  TEAMS: 50,
  CI_STATUS: 10,
  ZAP_RECEIPTS: 20,
} as const;

// ── Cache TTLs (seconds) ──

export const CACHE_TTL = {
  PROFILE: 24 * 3600,  // 24 hours
  REPO: 3600,          // 1 hour
  LIST: 300,           // 5 minutes
  ACTIVITY: 120,       // 2 minutes
} as const;

// ── Time Windows (seconds) ──

export const TIME_WINDOWS = {
  ONE_DAY: 86400,
  ONE_WEEK: 7 * 86400,
  ONE_MONTH: 30 * 86400,
  ONE_YEAR: 365 * 86400,
  TWELVE_WEEKS: 12 * 7 * 86400,
} as const;

// ── UI Timeouts (milliseconds) ──

export const TIMEOUTS = {
  CLIPBOARD_CONFIRMATION: 2000,
  SEARCH_DEBOUNCE: 300,
  RELAY_CONNECTION: 5000,
  RELAY_STATUS_POLL: 30000,
  IMPORT_BATCH_DELAY: 100,
  NOTIFICATION_DISPLAY: 3000,
  SETTINGS_SAVE_DELAY: 5000,
  URL_REVOKE: 60000,
} as const;

// ── File Limits ──

export const FILE_LIMITS = {
  MAX_FILE_SIZE_BYTES: 100_000, // 100KB
} as const;

// ── Zap Presets (satoshis) ──

export const ZAP_PRESETS = [21, 100, 500, 1000, 5000] as const;

export const FUNDING_TIERS = {
  BRONZE: 1000,
  SILVER: 5000,
  GOLD: 21000,
} as const;

// ── Lightning Defaults ──

export const LNURL_DEFAULTS = {
  MIN_SENDABLE_MSATS: 1000,
  MAX_SENDABLE_MSATS: 100_000_000_000,
} as const;

// ── LocalStorage Keys ──

export const STORAGE_KEYS = {
  AUTH: "nostrlab-auth",
  NOTIFICATIONS_LAST_SEEN: "nostrlab-notif-last-seen",
  RELAYS: "nostrlab-relays",
  THEME: "nostrlab-theme",
  LOCALE: "nostrlab-locale",
  CACHE_DB: "nostrlab-cache",
  WEBHOOKS_PREFIX: "nostrlab-webhooks-",
  DELETED_DMS: "nostrlab-deleted-dms",
  REPO_KEY_PREFIX: "nostr-repo-key:",
} as const;

// ── Git Configuration ──

export const GIT_FS_NAME = "gitnostr";

// ── NIP-98 HTTP Auth ──

export const NIP98_KIND = 27235;
