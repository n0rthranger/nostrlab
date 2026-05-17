type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const raw = (process.env.NOSTRLAB_LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[configuredLevel()];
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  if (!shouldLog(level)) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    service: "nostrlab",
    release: process.env.NOSTRLAB_RELEASE ?? null,
    runtimeRole: process.env.NOSTRLAB_RUNTIME_ROLE ?? null,
    ...fields,
  };
  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.info(serialized);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

export async function reportError(event: string, error: unknown, fields: Record<string, unknown> = {}) {
  const payload = {
    event,
    error: serializeError(error),
    fields,
    ts: new Date().toISOString(),
    release: process.env.NOSTRLAB_RELEASE ?? null,
    runtimeRole: process.env.NOSTRLAB_RUNTIME_ROLE ?? null,
  };
  log("error", event, { error: payload.error, ...fields });

  const webhook = process.env.NOSTRLAB_ERROR_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // Avoid recursive monitoring failures.
  }
}
