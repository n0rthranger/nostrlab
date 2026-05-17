import crypto from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
} from "nostr-tools";
import { canonicalJson } from "../src/lib/stable-json";
import { buildEventListing } from "../src/lib/nostr/event-builder";
import type { UnsignedEvent } from "../src/lib/nostr/types";

const base = process.env.NOSTRLAB_E2E_BASE_URL ?? "http://localhost:3001";
const runId = Date.now().toString(36);
const errors: string[] = [];
const results: Array<{ name: string; detail?: string }> = [];

type TestUser = ReturnType<typeof makeUser>;

function nostrShimScript(pubkey: string) {
  return `(() => {
    const currentPubkey = ${JSON.stringify(pubkey)};
    const w = window;
    window.nostr = {
      getPublicKey() {
        return Promise.resolve(currentPubkey);
      },
      signEvent(event) {
        return w.e2eSignEvent(Object.assign({}, event, { pubkey: currentPubkey }));
      }
    };
  })();`;
}

function pass(name: string, detail?: string) {
  results.push({ name, detail });
}

function fail(message: string): never {
  throw new Error(message);
}

function hashPayload(payload: Parameters<typeof canonicalJson>[0]) {
  return crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function makeUser(label: string) {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  return { label, sk, pubkey, npub: nip19.npubEncode(pubkey) };
}

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, init);
}

async function json(path: string, init: RequestInit = {}) {
  const res = await request(path, init);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bodyString(body: unknown) {
  return typeof body === "string" ? body : JSON.stringify(body);
}

async function createEvent(user: TestUser, input: Parameters<typeof buildEventListing>[0]) {
  const signedEvent = finalizeEvent(buildEventListing(input), user.sk);
  const { res, body } = await json("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedEvent }),
  });
  if (!res.ok || !isRecord(body) || typeof body.id !== "string") {
    fail(`event create failed ${res.status}: ${bodyString(body)}`);
  }
  return body as { id: string; nostrId: string; source: string };
}

async function signWithUser(user: TestUser, event: Partial<UnsignedEvent>) {
  const unsigned: UnsignedEvent = {
    pubkey: user.pubkey,
    kind: Number(event.kind),
    created_at: Number(event.created_at ?? Math.floor(Date.now() / 1000)),
    content: typeof event.content === "string" ? event.content : "",
    tags: Array.isArray(event.tags) ? event.tags : [],
  };
  return finalizeEvent(unsigned, user.sk);
}

function attachPageGuards(page: Page, label: string) {
  page.on("pageerror", (err) => {
    errors.push(`${label} page error: ${err.message}`);
  });
  page.on("response", (res) => {
    if (!res.url().startsWith(base)) return;
    if (res.status() >= 500) {
      errors.push(`${label} HTTP ${res.status()}: ${res.url()}`);
    }
  });
}

async function signedPage(browser: Browser, user: TestUser, label: string) {
  const context = await browser.newContext({
    baseURL: base,
    viewport: { width: 1440, height: 1000 },
  });
  await context.exposeFunction("e2eSignEvent", (event: Partial<UnsignedEvent>) =>
    signWithUser(user, event)
  );
  await context.addInitScript({ content: nostrShimScript(user.pubkey) });
  const page = await context.newPage();
  attachPageGuards(page, label);
  return { context, page };
}

async function installNostrShim(page: Page, pubkey: string) {
  await page.evaluate(nostrShimScript(pubkey));
}

async function login(page: Page, pubkey: string) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await installNostrShim(page, pubkey);
  await page.waitForTimeout(1_100);
  const button = page.getByRole("button", { name: "Sign in with Nostr" });
  await button.waitFor({ state: "visible", timeout: 15_000 });
  await button.click();
  await page.getByRole("heading", { name: "Hosting" }).waitFor({ timeout: 20_000 });
}

function parseTicketUrl(page: Page) {
  const url = new URL(page.url());
  const match = /\/tickets\/([^/?#]+)/.exec(url.pathname);
  if (!match) fail(`expected ticket URL, got ${url.toString()}`);
  const secret = new URLSearchParams(url.hash.slice(1)).get("secret");
  if (!secret) fail(`expected ticket secret in URL hash, got ${url.toString()}`);
  return { id: match[1], secret };
}

async function waitForTicketNavigation(page: Page) {
  await page.waitForURL(/\/tickets\/[^/]+#secret=/, { timeout: 30_000 });
  const ticket = parseTicketUrl(page);
  await page.getByRole("img", { name: "Ticket QR" }).waitFor({ timeout: 20_000 });
  return ticket;
}

async function clickUntilTicket(page: Page, label: string, click: () => Promise<void>) {
  let lastError: unknown = null;
  for (let i = 0; i < 3; i += 1) {
    await click();
    try {
      return await waitForTicketNavigation(page);
    } catch (e) {
      lastError = e;
      await page.waitForTimeout(900);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} did not issue a ticket`);
}

async function main() {
  const organizer = makeUser("browser-organizer");
  const attendee = makeUser("browser-attendee");
  const startsAt = new Date(Date.now() + 5 * 86_400_000);
  const titleFree = `Browser Free Meetup ${runId}`;
  const titlePaid = `Browser Paid Meetup ${runId}`;

  const freeEvent = await createEvent(organizer, {
    pubkey: organizer.pubkey,
    dTag: `browser-free-${runId}`,
    title: titleFree,
    description: "Browser E2E free RSVP and check-in flow.",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 90 * 60_000),
    mode: "online",
    capacity: 5,
    tags: ["e2e", "browser", "nostrlab"],
  });
  const paidEvent = await createEvent(organizer, {
    pubkey: organizer.pubkey,
    dTag: `browser-paid-${runId}`,
    title: titlePaid,
    description: "Browser E2E mock Lightning ticket flow.",
    startsAt: new Date(startsAt.getTime() + 2 * 60 * 60_000),
    endsAt: new Date(startsAt.getTime() + 3 * 60 * 60_000),
    mode: "online",
    capacity: 5,
    priceSats: 321,
    tags: ["e2e", "browser", "lightning"],
  });
  pass("setup creates signed events", `${freeEvent.id}, ${paidEvent.id}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const { context: publicContext, page: publicPage } = await signedPage(browser, attendee, "public");
    await publicPage.goto("/", { waitUntil: "domcontentloaded" });
    await publicPage.getByRole("heading", { name: /Build communities/i }).waitFor({ timeout: 20_000 });
    pass("landing page renders");

    await publicPage.goto(`/events?view=all&q=${encodeURIComponent(runId)}`, { waitUntil: "domcontentloaded" });
    await publicPage.getByText(titleFree).waitFor({ timeout: 20_000 });
    await publicPage.getByText(titlePaid).waitFor({ timeout: 20_000 });
    pass("event search renders created meetups");
    await publicContext.close();

    const attendeeSession = await signedPage(browser, attendee, "attendee");
    const attendeePage = attendeeSession.page;
    await login(attendeePage, attendee.pubkey);
    pass("attendee NIP-07 session");

    await attendeePage.goto(`/events/${freeEvent.id}`, { waitUntil: "domcontentloaded" });
    await installNostrShim(attendeePage, attendee.pubkey);
    await attendeePage.getByRole("heading", { name: titleFree }).waitFor({ timeout: 20_000 });
    const freeTicket = await clickUntilTicket(
      attendeePage,
      "free RSVP",
      () => attendeePage.getByRole("button", { name: /^Going$/ }).click()
    );
    pass("free RSVP issues ticket", freeTicket.id);

    const organizerSession = await signedPage(browser, organizer, "organizer");
    const organizerPage = organizerSession.page;
    await login(organizerPage, organizer.pubkey);
    await organizerPage.getByText(titleFree).waitFor({ timeout: 20_000 });
    pass("organizer dashboard lists hosted event");

    await organizerPage.goto(`/dashboard/events/${freeEvent.id}/check-in`, { waitUntil: "domcontentloaded" });
    await installNostrShim(organizerPage, organizer.pubkey);
    await organizerPage.getByRole("heading", { name: "Check-in" }).waitFor({ timeout: 20_000 });
    await organizerPage.locator("textarea").fill(JSON.stringify({ t: freeTicket.id, s: freeTicket.secret }));
    await organizerPage.getByRole("button", { name: "Admit" }).click();
    await organizerPage.getByText("Admitted").waitFor({ timeout: 20_000 });
    pass("organizer browser check-in", freeTicket.id);
    await organizerSession.context.close();

    await attendeePage.goto(`/events/${paidEvent.id}`, { waitUntil: "domcontentloaded" });
    await installNostrShim(attendeePage, attendee.pubkey);
    await attendeePage.getByRole("heading", { name: titlePaid }).waitFor({ timeout: 20_000 });
    const buyButton = attendeePage.getByRole("button", { name: /Buy ticket/ });
    await buyButton.click();
    await attendeePage.getByText("Mock invoice (testing)").waitFor({ timeout: 20_000 });
    await attendeePage.getByText("Auto-settles in seconds").waitFor({ timeout: 20_000 });
    const paidTicket = await waitForTicketNavigation(attendeePage);
    pass("paid mock invoice issues ticket", paidTicket.id);
    await attendeeSession.context.close();
  } finally {
    await browser.close();
  }

  if (errors.length > 0) {
    fail(`browser errors detected:\n${errors.join("\n")}`);
  }

  for (const result of results) {
    console.log(`PASS ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  }
}

main().catch((err) => {
  console.error("E2E_BROWSER_ERROR", err instanceof Error ? err.stack : err);
  for (const result of results) {
    console.log(`PASS ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  }
  process.exit(1);
});
