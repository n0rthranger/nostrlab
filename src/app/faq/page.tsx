import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "FAQ - NostrLab",
  description: "Answers about NostrLab identity, events, communities, tickets, Lightning payments, and public Nostr data.",
};

type FaqItem = {
  question: string;
  answer: ReactNode;
};

type FaqGroup = {
  id: string;
  title: string;
  description: string;
  items: FaqItem[];
};

const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "basics",
    title: "Basics",
    description: "What NostrLab is, who it is for, and how identity works.",
    items: [
      {
        question: "What is NostrLab?",
        answer:
          "NostrLab is an open-source event platform for Nostr communities. It helps people publish events, collect RSVPs, run community calendars, issue tickets, and manage check-in without making the community dependent on a closed social platform.",
      },
      {
        question: "Do I need a Nostr account?",
        answer:
          "You can browse public events without signing in. Creating events, RSVPing, managing tickets, following communities, and other account actions use your Nostr public key as your identity.",
      },
      {
        question: "How do I sign in?",
        answer:
          "NostrLab uses a NIP-07 browser signer such as Alby or nos2x. The app asks the signer to approve events, and it does not ask you to paste an nsec into the site.",
      },
      {
        question: "Can NostrLab handle online and in-person events?",
        answer:
          "Yes. Events can be in-person, online, or hybrid. Discovery pages can show venue and city information for local events while still supporting online communities and remote meetups.",
      },
    ],
  },
  {
    id: "organizers",
    title: "Organizers",
    description: "Publishing, communities, RSVPs, and ticket operations.",
    items: [
      {
        question: "How do organizers publish events?",
        answer:
          "Organizers sign in with their Nostr key, create an event, and publish it through NostrLab. The event is indexed by the app for fast browsing and can be re-broadcast to configured Nostr relays for portable discovery.",
      },
      {
        question: "What are communities for?",
        answer:
          "Communities group recurring events under a shared calendar. They are useful for meetups, clubs, conference tracks, workshops, and local groups that want one page people can follow over time.",
      },
      {
        question: "Can multiple people manage an event?",
        answer:
          "Events can include co-hosts. Organizer-only actions still require a signed Nostr authorization, so event management is tied to approved pubkeys rather than shared passwords.",
      },
      {
        question: "What happens when an event has capacity limits?",
        answer:
          "NostrLab can track capacity, RSVPs, waitlist status, tickets, and check-in state. For full events, organizers can promote waitlisted attendees when space opens.",
      },
    ],
  },
  {
    id: "tickets-payments",
    title: "Tickets and payments",
    description: "Lightning payments, private ticket secrets, refunds, and check-in.",
    items: [
      {
        question: "Can organizers sell paid tickets?",
        answer:
          "Yes. Paid tickets use Lightning invoices requested from the organizer's Lightning Address. The buyer pays the organizer's wallet directly.",
      },
      {
        question: "Does NostrLab custody sats?",
        answer:
          "No. NostrLab does not hold organizer funds. It coordinates the checkout, watches invoice settlement, and issues the ticket after payment is confirmed.",
      },
      {
        question: "Who handles refunds?",
        answer:
          "Refunds are handled by the event organizer. NostrLab cannot reverse Lightning payments or guarantee refunds because funds are paid directly to the organizer's wallet.",
      },
      {
        question: "What is inside a ticket?",
        answer:
          "A ticket includes a random secret and a signed credential that can be checked at the door. Ticket secrets, invoices, and private buyer data are not intentionally published to public Nostr relays.",
      },
      {
        question: "Can a ticket be transferred?",
        answer:
          "Ticket holders can transfer eligible tickets to another npub or hex pubkey before check-in. Checked-in tickets cannot be transferred.",
      },
    ],
  },
  {
    id: "data-privacy",
    title: "Data and privacy",
    description: "What is public, what stays operational, and how relays affect deletion.",
    items: [
      {
        question: "What gets published to Nostr relays?",
        answer:
          "Public event data, RSVPs, comments, announcements, profile metadata, and community references may be published to or indexed from Nostr relays. Relays are independent, so public data can be copied outside NostrLab.",
      },
      {
        question: "What stays private?",
        answer:
          "Operational data such as ticket secrets, payment invoices, payment hashes, check-in records, session cookies, and private RSVP state stays in the app database unless an operator exports it or a specific deployment changes that policy.",
      },
      {
        question: "Can I delete an event from every relay?",
        answer:
          "No app can guarantee deletion from every Nostr relay. NostrLab can mark, cancel, hide, or delete local records according to its event policy, but independent relays may keep copies of public events.",
      },
      {
        question: "Why does NostrLab use a database if Nostr is the source of truth?",
        answer:
          "Postgres is used as an index and cache so pages, filters, dashboards, tickets, and check-in can be fast. Identity and privileged writes still depend on signed Nostr events from the relevant pubkey.",
      },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    description: "Self-hosting, support, fees, and the open-source project.",
    items: [
      {
        question: "Can I run my own NostrLab instance?",
        answer:
          "Yes. NostrLab is open source under the MIT license. Production deployments should provide their own Postgres, Redis, relay configuration, upload storage, monitoring, and operator policies.",
      },
      {
        question: "Does NostrLab charge a platform fee?",
        answer:
          "The app itself is built around a 0% NostrLab platform fee. Payment processor, wallet, hosting, relay, or deployment-specific costs can still apply.",
      },
      {
        question: "Where do I report issues or contribute?",
        answer: (
          <>
            Use the{" "}
            <a
              href="https://github.com/n0rthranger/nostrlab"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
            >
              NostrLab GitHub repository
            </a>{" "}
            for issues, pull requests, and source code.
          </>
        ),
      },
      {
        question: "Where can I read the privacy page?",
        answer: (
          <>
            See the{" "}
            <Link href="/privacy" className="font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg">
              Privacy
            </Link>{" "}
            page for deployment-level data handling details.
          </>
        ),
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <div className="bg-bg">
      <section className="border-b border-white/10 bg-zinc-950 text-white">
        <div className="mx-auto max-w-6xl px-5 py-14 md:py-20">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
              FAQ
            </div>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-[-0.025em] sm:text-5xl md:text-6xl">
              Answers before you publish, RSVP, or check in.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 md:text-lg">
              A practical reference for NostrLab identity, Nostr relay data, Lightning tickets, organizer workflows,
              and self-hosted deployments.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/events"
                className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98]"
              >
                Explore events
              </Link>
              <Link
                href="/events/create"
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]"
              >
                Publish an event
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-10 md:py-14 lg:grid-cols-[15rem_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="border-l border-border pl-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Sections</div>
            <nav className="mt-4 grid gap-2 text-sm" aria-label="FAQ sections">
              {FAQ_GROUPS.map((group) => (
                <a key={group.id} href={`#${group.id}`} className="text-muted transition hover:text-fg">
                  {group.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="space-y-12">
          {FAQ_GROUPS.map((group) => (
            <section key={group.id} id={group.id} className="scroll-mt-24">
              <div className="mb-5 border-b border-border pb-5">
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{group.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted md:text-base">{group.description}</p>
              </div>
              <div className="grid gap-3">
                {group.items.map((item) => (
                  <FAQItem key={item.question} question={item.question}>
                    {item.answer}
                  </FAQItem>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Ready to host something?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Create an event with your Nostr key, publish it to the network, and manage RSVPs from one dashboard.
            </p>
          </div>
          <Link
            href="/events/create"
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-fg px-5 text-sm font-semibold text-bg transition hover:bg-fg2 active:scale-[0.98]"
          >
            Start an event
          </Link>
        </div>
      </section>
    </div>
  );
}

function FAQItem({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-border bg-surface shadow-soft open:border-fg/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
        <span>{question}</span>
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-base leading-none text-muted transition group-open:rotate-45 group-open:text-fg"
        >
          +
        </span>
      </summary>
      <div className="px-5 pb-5 text-sm leading-7 text-fg/80 md:text-[15px]">{children}</div>
    </details>
  );
}
