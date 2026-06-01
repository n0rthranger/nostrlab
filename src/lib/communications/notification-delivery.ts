import { nip04, nip19 } from "nostr-tools";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { prisma } from "@/lib/prisma";
import { publishToRelays } from "@/lib/nostr/relay-pool";
import type { NostrEvent } from "@/lib/nostr/types";

export type DeliveryChannel = "NOSTR_DM" | "WEBHOOK";

interface NotificationSeed {
  id: string;
  recipientPubkey: string;
}

type DeliveryRow = Awaited<ReturnType<typeof loadDeliveryBatch>>[number];

const VALID_CHANNELS = new Set(["nostr_dm", "nostr", "dm", "webhook"]);

function normalizeChannel(raw: string): DeliveryChannel | null {
  const value = raw.trim().toLowerCase();
  if (value === "nostr_dm" || value === "nostr" || value === "dm") return "NOSTR_DM";
  if (value === "webhook") return "WEBHOOK";
  return null;
}

export function configuredNotificationChannels(env: NodeJS.ProcessEnv = process.env): DeliveryChannel[] {
  const enabled = env.ENABLE_NOTIFICATION_DELIVERY === "true";
  if (!enabled) return [];
  const raw = env.NOSTRLAB_NOTIFICATION_CHANNELS?.trim();
  const requested = raw
    ? raw.split(",").map(normalizeChannel).filter((item): item is DeliveryChannel => !!item)
    : ["NOSTR_DM" as const];
  return [...new Set(requested)];
}

export function invalidNotificationChannelNames(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.NOSTRLAB_NOTIFICATION_CHANNELS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && !VALID_CHANNELS.has(item.toLowerCase()));
}

export function hasNotificationWebhook(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const url = new URL(env.NOSTRLAB_NOTIFICATION_WEBHOOK_URL?.trim() ?? "");
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function notificationAppSecretKey(env: NodeJS.ProcessEnv = process.env): Uint8Array | null {
  const raw = env.NOSTRLAB_APP_NSEC?.trim();
  if (!raw) return null;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return Uint8Array.from(raw.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)));
  }
  try {
    const decoded = nip19.decode(raw);
    return decoded.type === "nsec" ? decoded.data : null;
  } catch {
    return null;
  }
}

export function notificationDeliveryConfig(env: NodeJS.ProcessEnv = process.env) {
  const channels = configuredNotificationChannels(env);
  return {
    enabled: channels.length > 0,
    channels,
    invalidChannels: invalidNotificationChannelNames(env),
    hasNostrDmKey: !!notificationAppSecretKey(env),
    hasWebhook: hasNotificationWebhook(env),
  };
}

export async function enqueueNotificationDeliveries(notifications: NotificationSeed[]) {
  const channels = configuredNotificationChannels();
  if (channels.length === 0 || notifications.length === 0) return;

  await prisma.notificationDelivery.createMany({
    skipDuplicates: true,
    data: notifications.flatMap((notification) =>
      channels.map((channel) => ({
        notificationId: notification.id,
        recipientPubkey: notification.recipientPubkey.toLowerCase(),
        channel,
      }))
    ),
  });
}

async function loadDeliveryBatch(limit: number) {
  const now = new Date();
  return prisma.notificationDelivery.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      nextAttemptAt: { lte: now },
      attempts: { lt: maxAttempts() },
    },
    include: {
      notification: {
        include: {
          event: { select: { id: true, title: true, startsAt: true } },
        },
      },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });
}

function maxAttempts(): number {
  const raw = Number(process.env.NOTIFICATION_DELIVERY_MAX_ATTEMPTS ?? "8");
  return Number.isInteger(raw) && raw > 0 ? Math.min(raw, 20) : 8;
}

function backoffMs(attempts: number): number {
  const base = 30_000;
  const capped = Math.min(attempts, 8);
  return base * 2 ** Math.max(capped - 1, 0);
}

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
  return `${base}${path}`;
}

function notificationPayload(row: DeliveryRow) {
  const n = row.notification;
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    recipientPubkey: n.recipientPubkey,
    event: n.event ? {
      id: n.event.id,
      title: n.event.title,
      startsAt: n.event.startsAt.toISOString(),
      url: appUrl(`/events/${n.event.id}`),
    } : null,
    ticketUrl: n.ticketId ? appUrl(`/tickets/${n.ticketId}`) : null,
    createdAt: n.createdAt.toISOString(),
  };
}

function dmText(row: DeliveryRow): string {
  const payload = notificationPayload(row);
  const parts = [
    payload.title,
    payload.body,
    payload.event?.url,
    payload.ticketUrl,
  ].filter(Boolean);
  return parts.join("\n\n");
}

async function sendNostrDm(row: DeliveryRow) {
  const secretKey = notificationAppSecretKey();
  if (!secretKey) throw new Error("NOSTRLAB_APP_NSEC is required for Nostr DM delivery");
  const recipient = row.recipientPubkey.toLowerCase();
  const content = await nip04.encrypt(secretKey, recipient, dmText(row));
  const event = finalizeEvent({
    kind: 4,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["p", recipient],
      ["app", "nostrlab"],
      ["notification", row.notificationId],
    ],
    content,
  }, secretKey) as NostrEvent;
  const result = await publishToRelays(event);
  if (result.ok < 1) throw new Error("DM publish failed on all configured relays");
  return { providerRef: event.id, payload: { relays: result, from: getPublicKey(secretKey) } };
}

async function sendWebhook(row: DeliveryRow) {
  const webhook = process.env.NOSTRLAB_NOTIFICATION_WEBHOOK_URL?.trim();
  if (!webhook || !hasNotificationWebhook()) {
    throw new Error("NOSTRLAB_NOTIFICATION_WEBHOOK_URL must be an HTTPS URL");
  }
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(notificationPayload(row)),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`webhook returned HTTP ${res.status}`);
  return { providerRef: `http:${res.status}`, payload: { status: res.status } };
}

async function deliver(row: DeliveryRow) {
  if (row.channel === "NOSTR_DM") return sendNostrDm(row);
  if (row.channel === "WEBHOOK") return sendWebhook(row);
  throw new Error(`unsupported channel ${row.channel}`);
}

async function markFailure(row: DeliveryRow, error: unknown) {
  const attempts = row.attempts + 1;
  const finalFailure = attempts >= maxAttempts();
  await prisma.notificationDelivery.update({
    where: { id: row.id },
    data: {
      attempts,
      status: finalFailure ? "FAILED" : "PENDING",
      lastError: error instanceof Error ? error.message : String(error),
      nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
    },
  });
  return finalFailure;
}

export async function deliverPendingNotifications(limit = 50) {
  const batch = await loadDeliveryBatch(limit);
  const summary = {
    checked: 0,
    sent: 0,
    retrying: 0,
    failed: 0,
  };

  for (const row of batch) {
    summary.checked += 1;
    try {
      const result = await deliver(row);
      await prisma.notificationDelivery.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          attempts: row.attempts + 1,
          sentAt: new Date(),
          lastError: null,
          providerRef: result.providerRef,
          payload: result.payload,
        },
      });
      summary.sent += 1;
    } catch (error) {
      if (await markFailure(row, error)) summary.failed += 1;
      else summary.retrying += 1;
    }
  }

  return { summary };
}

export async function notificationDeliveryMetrics() {
  const grouped = await prisma.notificationDelivery.groupBy({
    by: ["channel", "status"],
    _count: { _all: true },
  });
  return grouped.map((row) => ({
    channel: row.channel,
    status: row.status,
    count: row._count._all,
  }));
}
