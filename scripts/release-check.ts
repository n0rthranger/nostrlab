import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  hasBlockingReleaseFailures,
  productionReadinessChecks,
  type ReleaseCheck,
} from "../src/lib/production-readiness";

function loadDotEnv() {
  if (!existsSync(".env")) return;
  const lines = readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
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

function printCheck(item: ReleaseCheck) {
  const status = item.ok ? "PASS" : item.level === "error" ? "FAIL" : "WARN";
  console.log(`${status} ${item.name} - ${item.message}`);
}

function run(name: string, command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    env: process.env,
  });
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
  if (result.status !== 0) {
    throw new Error(`${name} failed with exit code ${result.status ?? "unknown"}`);
  }
}

loadDotEnv();

const envChecks = productionReadinessChecks(process.env, {
  production: true,
  runtimeRole: process.env.NOSTRLAB_RUNTIME_ROLE,
});
for (const item of envChecks) printCheck(item);

let failed = hasBlockingReleaseFailures(envChecks);

try {
  run("Prisma schema validation", "pnpm", ["prisma", "validate"]);
  run("Prisma migration status", "pnpm", ["prisma", "migrate", "status", "--schema", "prisma/schema.prisma"]);
} catch (e) {
  failed = true;
  console.error(`FAIL migrations - ${(e as Error).message}`);
}

if (failed) {
  console.error("Release check failed. Fix every FAIL item before public release.");
  process.exit(1);
}

console.log("Release check passed.");
