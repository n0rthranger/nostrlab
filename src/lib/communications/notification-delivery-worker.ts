import { deliverPendingNotifications } from "@/lib/communications/notification-delivery";
import { log, reportError } from "@/lib/observability";

const STORE_KEY = "__nostrlab_notification_delivery_worker__" as const;

type DeliveryWorkerState = {
  timer: NodeJS.Timeout | null;
  running: boolean;
  lastRunAt: string | null;
  lastSummary: Awaited<ReturnType<typeof deliverPendingNotifications>>["summary"] | null;
  runs: number;
  failures: number;
};

type GlobalWithDeliveryWorker = typeof globalThis & { [STORE_KEY]?: DeliveryWorkerState };

function state(): DeliveryWorkerState {
  const g = globalThis as GlobalWithDeliveryWorker;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = {
      timer: null,
      running: false,
      lastRunAt: null,
      lastSummary: null,
      runs: 0,
      failures: 0,
    };
  }
  return g[STORE_KEY]!;
}

function intervalMs(): number {
  const raw = Number(process.env.NOTIFICATION_DELIVERY_INTERVAL_MS ?? "30000");
  if (!Number.isFinite(raw) || raw < 5000) return 30000;
  return raw;
}

function batchSize(): number {
  const raw = Number(process.env.NOTIFICATION_DELIVERY_BATCH_SIZE ?? "50");
  if (!Number.isInteger(raw) || raw < 1) return 50;
  return Math.min(raw, 250);
}

async function runNotificationDeliveryOnce() {
  const current = state();
  if (current.running) return current.lastSummary;
  current.running = true;
  try {
    const result = await deliverPendingNotifications(batchSize());
    current.lastRunAt = new Date().toISOString();
    current.lastSummary = result.summary;
    current.runs += 1;
    log("info", "notifications.delivery", result.summary);
    return result.summary;
  } catch (e) {
    current.failures += 1;
    await reportError("notifications.delivery_failed", e);
    throw e;
  } finally {
    current.running = false;
  }
}

export function ensureNotificationDeliveryWorker() {
  const current = state();
  if (current.timer) return;
  const ms = intervalMs();
  log("info", "notifications.delivery_start", { intervalMs: ms, batchSize: batchSize() });
  runNotificationDeliveryOnce().catch(() => {});
  current.timer = setInterval(() => {
    runNotificationDeliveryOnce().catch(() => {});
  }, ms);
  if (typeof current.timer.unref === "function") current.timer.unref();
}

export function notificationDeliveryWorkerStats() {
  const current = state();
  return {
    started: !!current.timer,
    running: current.running,
    lastRunAt: current.lastRunAt,
    lastSummary: current.lastSummary,
    runs: current.runs,
    failures: current.failures,
    intervalMs: intervalMs(),
    batchSize: batchSize(),
  };
}
