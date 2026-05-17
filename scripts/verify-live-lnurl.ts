import {
  resolveLud16,
  requestInvoice,
  verifyInvoice,
  extractExpirySec,
} from "../src/lib/lightning";
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

loadDotEnv();

const address = process.env.NOSTRLAB_LNURL_TEST_ADDRESS?.trim();
const amountSats = Number(process.env.NOSTRLAB_LNURL_TEST_AMOUNT_SATS ?? "1");
const waitSeconds = Number(process.env.NOSTRLAB_LNURL_WAIT_SECONDS ?? "0");

if (!address) {
  console.error("Set NOSTRLAB_LNURL_TEST_ADDRESS to an organizer Lightning Address before running this check.");
  process.exit(1);
}
const lnurlAddress = address;
if (!Number.isInteger(amountSats) || amountSats < 1) {
  console.error("NOSTRLAB_LNURL_TEST_AMOUNT_SATS must be a positive integer.");
  process.exit(1);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Resolving ${lnurlAddress}...`);
  const metadata = await resolveLud16(lnurlAddress);
  const amountMsat = amountSats * 1000;
  if (amountMsat < metadata.minSendable || amountMsat > metadata.maxSendable) {
    throw new Error(
      `Amount ${amountSats} sats is outside wallet range ${Math.ceil(metadata.minSendable / 1000)}-${Math.floor(metadata.maxSendable / 1000)} sats`
    );
  }

  console.log(`Requesting ${amountSats} sat invoice...`);
  const invoice = await requestInvoice(metadata.callback, amountMsat, "NostrLab production LNURL verification");
  console.log(`PASS invoice payment_hash=${invoice.paymentHash}`);
  console.log(`PASS invoice expiry_seconds=${extractExpirySec(invoice.bolt11)}`);
  console.log(`BOLT11 ${invoice.bolt11}`);

  if (!invoice.verifyUrl) {
    console.log("WARN wallet did not return a LUD-21 verify URL; automatic settlement verification will require manual claim flow.");
    return;
  }

  console.log(`PASS verify_url=${invoice.verifyUrl}`);
  if (waitSeconds <= 0) {
    console.log("Set NOSTRLAB_LNURL_WAIT_SECONDS to poll for settlement after paying this invoice manually.");
    return;
  }

  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    const status = await verifyInvoice(invoice.verifyUrl);
    if (status.settled) {
      console.log(`PASS settled preimage=${status.preimage ?? "not returned"}`);
      return;
    }
    console.log("PENDING invoice not settled yet");
    await sleep(5000);
  }
  throw new Error(`Invoice did not settle within ${waitSeconds} seconds.`);
}

main().catch((e) => {
  console.error(`FAIL ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
