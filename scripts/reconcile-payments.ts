import { existsSync, readFileSync } from "node:fs";

function loadDotEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match || process.env[match[1]] !== undefined) continue;
    let raw = match[2].trim();
    if (
      (raw.startsWith("\"") && raw.endsWith("\"")) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      raw = raw.slice(1, -1);
    }
    process.env[match[1]] = raw;
  }
}

function batchSize(): number {
  const raw = Number(process.env.PAYMENT_RECONCILE_BATCH_SIZE ?? "100");
  if (!Number.isInteger(raw) || raw < 1) return 100;
  return Math.min(raw, 500);
}

function intervalMs(): number {
  const raw = Number(process.env.PAYMENT_RECONCILE_INTERVAL_MS ?? "30000");
  if (!Number.isFinite(raw) || raw < 5000) return 30000;
  return raw;
}

async function runOnce() {
  const { reconcilePendingPayments } = await import("../src/lib/payments/reconcile");
  const result = await reconcilePendingPayments(batchSize());
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    ...result,
  }, null, 2));
}

async function main() {
  loadDotEnv();
  const { prisma } = await import("../src/lib/prisma");
  const loop = process.argv.includes("--loop");
  if (!loop) {
    await runOnce();
    return;
  }

  let stopped = false;
  const stop = async () => {
    stopped = true;
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => { stop().catch(() => process.exit(1)); });
  process.once("SIGTERM", () => { stop().catch(() => process.exit(1)); });

  while (!stopped) {
    await runOnce();
    await new Promise((resolve) => setTimeout(resolve, intervalMs()));
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
