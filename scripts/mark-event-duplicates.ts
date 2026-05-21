import { prisma } from "../src/lib/prisma";
import { eventDedupeKey } from "../src/lib/events/dedupe";

const apply = process.argv.includes("--apply");
const includePast = process.argv.includes("--all");
const lowerBound = new Date(Date.now() - 12 * 60 * 60 * 1000);

type EventRow = Awaited<ReturnType<typeof loadEvents>>[number];

async function loadEvents() {
  return prisma.event.findMany({
    where: {
      status: "ACTIVE",
      ...(includePast ? {} : { startsAt: { gte: lowerBound } }),
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      startsAt: true,
      mode: true,
      city: true,
      venue: true,
      geohash: true,
      clientTag: true,
      createdAt: true,
      _count: {
        select: {
          rsvps: true,
          tickets: true,
          payments: true,
        },
      },
    },
  });
}

function canonicalScore(event: EventRow): number {
  return event._count.payments * 50
    + event._count.tickets * 40
    + event._count.rsvps * 10
    + (event.clientTag === "nostrlab" ? 5 : 0);
}

function sortCanonicalFirst(a: EventRow, b: EventRow): number {
  const scoreDiff = canonicalScore(b) - canonicalScore(a);
  if (scoreDiff !== 0) return scoreDiff;
  const createdDiff = a.createdAt.getTime() - b.createdAt.getTime();
  if (createdDiff !== 0) return createdDiff;
  return a.id.localeCompare(b.id);
}

async function main() {
  const events = await loadEvents();
  const groups = new Map<string, EventRow[]>();

  for (const event of events) {
    const key = eventDedupeKey(event);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  let duplicateCount = 0;
  let keyedCount = 0;
  const duplicateGroups = [...groups.entries()].filter(([, group]) => group.length > 1);
  for (const [, group] of groups) keyedCount += group.length;
  for (const [, group] of duplicateGroups) duplicateCount += group.length - 1;

  console.log(`${apply ? "Applying" : "Dry run"} event dedupe scan`);
  console.log(`Scanned ${events.length} active events; ${keyedCount} had a dedupe key.`);
  console.log(`Found ${duplicateGroups.length} duplicate groups / ${duplicateCount} duplicate rows.`);

  for (const [key, rawGroup] of groups.entries()) {
    const group = [...rawGroup].sort(sortCanonicalFirst);
    const [canonical, ...duplicates] = group;
    if (!canonical) continue;

    if (duplicates.length > 0) {
      console.log(`\n${canonical.title} @ ${canonical.startsAt.toISOString()}`);
      console.log(`  canonical ${canonical.id} score=${canonicalScore(canonical)} key=${key}`);
      for (const duplicate of duplicates) {
        console.log(`  duplicate ${duplicate.id} score=${canonicalScore(duplicate)}`);
      }
    }

    if (!apply) continue;

    await prisma.$transaction([
      ...duplicates.map((duplicate) => prisma.event.update({
        where: { id: duplicate.id },
        data: { dedupeKey: key, duplicateOfId: canonical.id },
      })),
      prisma.event.update({
        where: { id: canonical.id },
        data: { dedupeKey: key, duplicateOfId: null },
      }),
    ]);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
