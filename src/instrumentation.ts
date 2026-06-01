// Next.js instrumentation hook - runs once on server boot.
// We use it to start background workers and process-level error reporting.

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { log, reportError } = await import("./lib/observability");
  const { productionReadinessChecks, hasBlockingReleaseFailures } = await import("./lib/production-readiness");
  const globalState = globalThis as typeof globalThis & { __nostrlab_process_error_hooks__?: boolean };

  if (!globalState.__nostrlab_process_error_hooks__) {
    globalState.__nostrlab_process_error_hooks__ = true;
    process.on("unhandledRejection", (error) => {
      reportError("process.unhandled_rejection", error).catch(() => {});
    });
    process.on("uncaughtException", (error) => {
      reportError("process.uncaught_exception", error).catch(() => {});
    });
  }

  const checks = productionReadinessChecks();
  const failures = checks.filter((item) => !item.ok);
  if (failures.length > 0) {
    log(hasBlockingReleaseFailures(checks) ? "error" : "warn", "production_readiness", {
      failures: failures.map(({ name, level, message }) => ({ name, level, message })),
    });
  }

  if (process.env.ENABLE_PAYMENT_RECONCILER === "true") {
    try {
      const { ensurePaymentReconciler } = await import("./lib/payments/reconcile-worker");
      ensurePaymentReconciler();
    } catch (e) {
      await reportError("payment_reconciler.start_failed", e);
    }
  }

  if (process.env.ENABLE_NOTIFICATION_DELIVERY === "true") {
    try {
      const { ensureNotificationDeliveryWorker } = await import("./lib/communications/notification-delivery-worker");
      ensureNotificationDeliveryWorker();
    } catch (e) {
      await reportError("notification_delivery.start_failed", e);
    }
  }

  if (process.env.ENABLE_EVENT_ALERTS === "true") {
    try {
      const { ensureEventAlertWorker } = await import("./lib/discovery/event-alert-worker");
      ensureEventAlertWorker();
    } catch (e) {
      await reportError("event_alerts.start_failed", e);
    }
  }

  if (process.env.ENABLE_RELAY_LISTENER !== "true") return;
  try {
    const { ensureRelayListener } = await import("./lib/nostr/relay-listener");
    await ensureRelayListener();
  } catch (e) {
    await reportError("relay_listener.start_failed", e);
  }
}
