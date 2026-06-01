import { normalizePubkey } from "@/lib/nostr/encode";
import { nip19 } from "nostr-tools";

type CheckLevel = "error" | "warning";

export interface ReleaseCheck {
  name: string;
  ok: boolean;
  level: CheckLevel;
  message: string;
}

interface CheckOptions {
  production?: boolean;
  runtimeRole?: string;
}

function value(env: NodeJS.ProcessEnv, key: string): string {
  return env[key]?.trim() ?? "";
}

function check(name: string, ok: boolean, level: CheckLevel, message: string): ReleaseCheck {
  return { name, ok, level, message };
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host === "::1" || host === "0.0.0.0" || host.startsWith("127.")) return true;
  if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
  const [a, b] = host.split(".").map((part) => Number(part));
  return a === 172 && b >= 16 && b <= 31;
}

function isStrongSecret(secret: string): boolean {
  if (secret.length < 32) return false;
  if (/^(.)\1+$/.test(secret)) return false;
  return !/nostrlab|changeme|secret|password|example|dev/i.test(secret);
}

function isValidPubkey(raw: string): boolean {
  try {
    normalizePubkey(raw);
    return true;
  } catch {
    return false;
  }
}

function isValidNsec(raw: string): boolean {
  try {
    return nip19.decode(raw).type === "nsec";
  } catch {
    return false;
  }
}

function enabledNotificationChannels(env: NodeJS.ProcessEnv): string[] {
  if (value(env, "ENABLE_NOTIFICATION_DELIVERY") !== "true") return [];
  const raw = value(env, "NOSTRLAB_NOTIFICATION_CHANNELS");
  return (raw || "nostr_dm")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isValidNotificationChannel(channel: string): boolean {
  return channel === "nostr_dm" || channel === "nostr" || channel === "dm" || channel === "webhook";
}

function hasCompleteObjectStorage(env: NodeJS.ProcessEnv): boolean {
  return [
    "OBJECT_STORAGE_BUCKET",
    "OBJECT_STORAGE_ENDPOINT",
    "OBJECT_STORAGE_REGION",
    "OBJECT_STORAGE_ACCESS_KEY_ID",
    "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    "OBJECT_STORAGE_PUBLIC_BASE_URL",
  ].every((key) => !!value(env, key));
}

type UploadBackend = "local" | "s3" | "blossom" | "invalid";

function uploadBackend(env: NodeJS.ProcessEnv): UploadBackend {
  const configured = value(env, "UPLOAD_BACKEND").toLowerCase();
  if (configured === "local" || configured === "s3" || configured === "blossom") return configured;
  if (configured) return "invalid";
  return hasCompleteObjectStorage(env) ? "s3" : "local";
}

export function productionReadinessChecks(
  env: NodeJS.ProcessEnv = process.env,
  opts: CheckOptions = {}
): ReleaseCheck[] {
  const isProductionEnv = value(env, "NODE_ENV") === "production";
  const production = opts.production ?? isProductionEnv;
  const runtimeRole = opts.runtimeRole ?? value(env, "NOSTRLAB_RUNTIME_ROLE");
  const allowLocal = value(env, "NOSTRLAB_ALLOW_LOCAL_PROD_SERVICES") === "true";
  const checks: ReleaseCheck[] = [];

  checks.push(check(
    "NODE_ENV",
    isProductionEnv,
    "error",
    isProductionEnv ? "running in production mode" : "NODE_ENV must be production for release"
  ));

  const databaseUrl = parseUrl(value(env, "DATABASE_URL"));
  checks.push(check(
    "DATABASE_URL",
    !!databaseUrl && ["postgresql:", "postgres:"].includes(databaseUrl.protocol),
    "error",
    databaseUrl ? "Postgres URL is parseable" : "DATABASE_URL must be a Postgres connection string"
  ));
  if (databaseUrl) {
    checks.push(check(
      "DATABASE_URL host",
      !production || allowLocal || !isLocalHost(databaseUrl.hostname),
      "error",
      "production DATABASE_URL must point at shared Postgres/PgBouncer, not localhost"
    ));
    checks.push(check(
      "DATABASE pooling",
      /pgbouncer/i.test(databaseUrl.hostname) || databaseUrl.searchParams.has("connection_limit"),
      "error",
      "use PgBouncer or an explicit connection_limit for multi-node production"
    ));
  }

  const appUrl = parseUrl(value(env, "NEXT_PUBLIC_APP_URL"));
  checks.push(check(
    "NEXT_PUBLIC_APP_URL",
    !!appUrl && appUrl.protocol === "https:" && !isLocalHost(appUrl.hostname),
    "error",
    "NEXT_PUBLIC_APP_URL must be the public HTTPS origin"
  ));

  checks.push(check(
    "NOSTRLAB_SESSION_SECRET",
    isStrongSecret(value(env, "NOSTRLAB_SESSION_SECRET")),
    "error",
    "set a 32+ character random session secret"
  ));

  checks.push(check(
    "TRUST_PROXY_HEADERS",
    value(env, "TRUST_PROXY_HEADERS") === "true",
    "error",
    "set TRUST_PROXY_HEADERS=true behind a trusted load balancer that overwrites forwarding headers"
  ));

  const redisUrl = parseUrl(value(env, "REDIS_URL"));
  checks.push(check(
    "REDIS_URL",
    !!redisUrl && ["redis:", "rediss:"].includes(redisUrl.protocol),
    "error",
    "Redis/Valkey is required for multi-node rate limits"
  ));
  if (redisUrl) {
    checks.push(check(
    "REDIS_URL host",
      !production || allowLocal || !isLocalHost(redisUrl.hostname),
      "error",
      "production REDIS_URL must point at shared Redis/Valkey, not localhost"
    ));
  }

  const storageBackend = uploadBackend(env);
  checks.push(check(
    "UPLOAD_BACKEND",
    storageBackend !== "invalid" && (!production || storageBackend !== "local"),
    "error",
    storageBackend === "invalid"
      ? "UPLOAD_BACKEND must be local, s3, or blossom"
      : storageBackend === "local"
        ? production
          ? "production uploads must use UPLOAD_BACKEND=blossom or UPLOAD_BACKEND=s3"
          : "using local upload storage"
        : `using ${storageBackend} upload storage`
  ));
  if (storageBackend === "s3") {
    checks.push(check(
      "OBJECT_STORAGE_*",
      hasCompleteObjectStorage(env),
      "error",
      "S3 upload storage must be fully configured"
    ));
    const objectPublicUrl = parseUrl(value(env, "OBJECT_STORAGE_PUBLIC_BASE_URL"));
    checks.push(check(
      "OBJECT_STORAGE_PUBLIC_BASE_URL",
      !!objectPublicUrl && objectPublicUrl.protocol === "https:",
      "error",
      "uploaded media must be served from an HTTPS public base URL"
    ));
  }
  if (storageBackend === "blossom") {
    const blossomServerUrl = parseUrl(value(env, "BLOSSOM_SERVER_URL") || "https://blossom.nostr.build");
    const blossomServerOk = !!blossomServerUrl
      && blossomServerUrl.protocol === "https:"
      && (!production || allowLocal || !isLocalHost(blossomServerUrl.hostname));
    checks.push(check(
      "BLOSSOM_SERVER_URL",
      blossomServerOk,
      "error",
      blossomServerOk
        ? `using ${blossomServerUrl.origin}`
        : "BLOSSOM_SERVER_URL must be a public HTTPS Blossom server"
    ));
    const blossomSigningOk = isValidNsec(value(env, "BLOSSOM_SIGNING_NSEC") || value(env, "NOSTRLAB_APP_NSEC"));
    checks.push(check(
      "BLOSSOM signing key",
      blossomSigningOk,
      "error",
      blossomSigningOk
        ? "Blossom signing key is configured"
        : "set BLOSSOM_SIGNING_NSEC or NOSTRLAB_APP_NSEC to an nsec for Blossom uploads"
    ));
  }

  const lightningMode = value(env, "LIGHTNING_MODE") || "lnurl";
  checks.push(check(
    "LIGHTNING_MODE",
    lightningMode === "lnurl",
    "error",
    "production paid tickets require LIGHTNING_MODE=lnurl"
  ));

  checks.push(check(
    "NOSTRLAB_ADMIN_PUBKEY",
    isValidPubkey(value(env, "NOSTRLAB_ADMIN_PUBKEY")),
    "error",
    "configure an admin npub/hex pubkey before public release"
  ));

  checks.push(check(
    "NOSTRLAB_METRICS_TOKEN",
    value(env, "NOSTRLAB_METRICS_TOKEN").length >= 32,
    "error",
    "set a 32+ character bearer token for /api/ops/metrics"
  ));

  const errorWebhook = parseUrl(value(env, "NOSTRLAB_ERROR_WEBHOOK_URL"));
  const errorLogPath = value(env, "NOSTRLAB_ERROR_LOG_PATH");
  checks.push(check(
    "error monitoring",
    (!!errorWebhook && errorWebhook.protocol === "https:") || !!errorLogPath,
    "error",
    errorWebhook && errorWebhook.protocol === "https:"
      ? "server errors are forwarded to monitoring webhook"
      : errorLogPath
        ? "server errors are appended to NOSTRLAB_ERROR_LOG_PATH"
        : "set NOSTRLAB_ERROR_WEBHOOK_URL or NOSTRLAB_ERROR_LOG_PATH for unhandled server errors"
  ));

  checks.push(check(
    "NOSTR_RELAYS",
    value(env, "NOSTR_RELAYS").split(",").filter(Boolean).every((relay) => relay.trim().startsWith("wss://")),
    "error",
    "server relays must be wss:// URLs"
  ));
  checks.push(check(
    "NEXT_PUBLIC_NOSTR_RELAYS",
    value(env, "NEXT_PUBLIC_NOSTR_RELAYS").split(",").filter(Boolean).every((relay) => relay.trim().startsWith("wss://")),
    "error",
    "client relays must be wss:// URLs"
  ));

  if (runtimeRole) {
    checks.push(check(
      "NOSTRLAB_RUNTIME_ROLE",
      runtimeRole === "web" || runtimeRole === "worker",
      "error",
      "NOSTRLAB_RUNTIME_ROLE must be web or worker"
    ));
    checks.push(check(
      "ENABLE_RELAY_LISTENER",
      runtimeRole === "worker"
        ? value(env, "ENABLE_RELAY_LISTENER") === "true"
        : value(env, "ENABLE_RELAY_LISTENER") !== "true",
      "error",
      "enable relay listener only on worker nodes"
    ));
    checks.push(check(
      "ENABLE_PAYMENT_RECONCILER",
      runtimeRole === "worker"
        ? value(env, "ENABLE_PAYMENT_RECONCILER") === "true"
        : value(env, "ENABLE_PAYMENT_RECONCILER") !== "true",
      "error",
      "enable payment reconciler only on worker nodes"
    ));
    checks.push(check(
      "ENABLE_NOTIFICATION_DELIVERY",
      value(env, "ENABLE_NOTIFICATION_DELIVERY") !== "true" || runtimeRole === "worker",
      "error",
      "enable notification delivery only on worker nodes"
    ));
    checks.push(check(
      "ENABLE_EVENT_ALERTS",
      value(env, "ENABLE_EVENT_ALERTS") !== "true" || runtimeRole === "worker",
      "error",
      "enable event alert scans only on worker nodes"
    ));
  } else {
    checks.push(check(
      "NOSTRLAB_RUNTIME_ROLE",
      false,
      "error",
      "set NOSTRLAB_RUNTIME_ROLE=web or worker so deploy checks can catch duplicate relay listeners"
    ));
  }

  const notificationChannels = enabledNotificationChannels(env);
  if (notificationChannels.length > 0) {
    const invalidChannels = notificationChannels.filter((channel) => !isValidNotificationChannel(channel));
    checks.push(check(
      "NOSTRLAB_NOTIFICATION_CHANNELS",
      invalidChannels.length === 0,
      "error",
      invalidChannels.length === 0
        ? `notification channels: ${notificationChannels.join(", ")}`
        : `unsupported notification channels: ${invalidChannels.join(", ")}`
    ));
    if (notificationChannels.some((channel) => channel === "nostr_dm" || channel === "nostr" || channel === "dm")) {
      checks.push(check(
        "notification DM key",
        isValidNsec(value(env, "NOSTRLAB_APP_NSEC")),
        "error",
        "Nostr DM notification delivery requires NOSTRLAB_APP_NSEC"
      ));
    }
    if (notificationChannels.includes("webhook")) {
      const notificationWebhook = parseUrl(value(env, "NOSTRLAB_NOTIFICATION_WEBHOOK_URL"));
      checks.push(check(
        "NOSTRLAB_NOTIFICATION_WEBHOOK_URL",
        !!notificationWebhook && notificationWebhook.protocol === "https:",
        "error",
        "webhook notification delivery requires an HTTPS NOSTRLAB_NOTIFICATION_WEBHOOK_URL"
      ));
    }
  }

  return checks;
}

export function hasBlockingReleaseFailures(checks: ReleaseCheck[]): boolean {
  return checks.some((item) => item.level === "error" && !item.ok);
}
