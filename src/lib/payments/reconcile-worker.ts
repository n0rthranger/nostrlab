import { reconcilePendingPayments } from "@/lib/payments/reconcile";
import { log, reportError } from "@/lib/observability";

const STORE_KEY = "__nostrlab_payment_reconciler__" as const;

type ReconcilerState = {
  timer: NodeJS.Timeout | null;
  running: boolean;
  lastRunAt: string | null;
  lastSummary: Awaited<ReturnType<typeof reconcilePendingPayments>>["summary"] | null;
  runs: number;
  failures: number;
};

type GlobalWithReconciler = typeof globalThis & { [STORE_KEY]?: ReconcilerState };

function state(): ReconcilerState {
  const g = globalThis as GlobalWithReconciler;
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
  const raw = Number(process.env.PAYMENT_RECONCILE_INTERVAL_MS ?? "30000");
  if (!Number.isFinite(raw) || raw < 5000) return 30000;
  return raw;
}

function batchSize(): number {
  const raw = Number(process.env.PAYMENT_RECONCILE_BATCH_SIZE ?? "100");
  if (!Number.isInteger(raw) || raw < 1) return 100;
  return Math.min(raw, 500);
}

async function runPaymentReconciliationOnce() {
  const current = state();
  if (current.running) return current.lastSummary;
  current.running = true;
  try {
    const result = await reconcilePendingPayments(batchSize());
    current.lastRunAt = new Date().toISOString();
    current.lastSummary = result.summary;
    current.runs += 1;
    log("info", "payments.reconcile", result.summary);
    return result.summary;
  } catch (e) {
    current.failures += 1;
    await reportError("payments.reconcile_failed", e);
    throw e;
  } finally {
    current.running = false;
  }
}

export function ensurePaymentReconciler() {
  const current = state();
  if (current.timer) return;
  const ms = intervalMs();
  log("info", "payments.reconciler_start", { intervalMs: ms, batchSize: batchSize() });
  runPaymentReconciliationOnce().catch(() => {});
  current.timer = setInterval(() => {
    runPaymentReconciliationOnce().catch(() => {});
  }, ms);
  if (typeof current.timer.unref === "function") current.timer.unref();
}

export function paymentReconcilerStats() {
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
