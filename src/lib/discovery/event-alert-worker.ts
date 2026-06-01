import { runSavedEventSearchAlerts } from "@/lib/discovery/event-alerts";
import { log, reportError } from "@/lib/observability";

const STORE_KEY = "__nostrlab_event_alert_worker__" as const;

type EventAlertWorkerState = {
  timer: NodeJS.Timeout | null;
  running: boolean;
  lastRunAt: string | null;
  lastSummary: Awaited<ReturnType<typeof runSavedEventSearchAlerts>>["summary"] | null;
  runs: number;
  failures: number;
};

type GlobalWithEventAlertWorker = typeof globalThis & { [STORE_KEY]?: EventAlertWorkerState };

function state(): EventAlertWorkerState {
  const g = globalThis as GlobalWithEventAlertWorker;
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
  const raw = Number(process.env.EVENT_ALERT_INTERVAL_MS ?? "300000");
  if (!Number.isFinite(raw) || raw < 30000) return 300000;
  return raw;
}

function batchSize(): number {
  const raw = Number(process.env.EVENT_ALERT_BATCH_SIZE ?? "100");
  if (!Number.isInteger(raw) || raw < 1) return 100;
  return Math.min(raw, 500);
}

async function runEventAlertsOnce() {
  const current = state();
  if (current.running) return current.lastSummary;
  current.running = true;
  try {
    const result = await runSavedEventSearchAlerts(batchSize());
    current.lastRunAt = new Date().toISOString();
    current.lastSummary = result.summary;
    current.runs += 1;
    log("info", "event_alerts.scan", result.summary);
    return result.summary;
  } catch (e) {
    current.failures += 1;
    await reportError("event_alerts.scan_failed", e);
    throw e;
  } finally {
    current.running = false;
  }
}

export function ensureEventAlertWorker() {
  const current = state();
  if (current.timer) return;
  const ms = intervalMs();
  log("info", "event_alerts.start", { intervalMs: ms, batchSize: batchSize() });
  runEventAlertsOnce().catch(() => {});
  current.timer = setInterval(() => {
    runEventAlertsOnce().catch(() => {});
  }, ms);
  if (typeof current.timer.unref === "function") current.timer.unref();
}

export function eventAlertWorkerStats() {
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
