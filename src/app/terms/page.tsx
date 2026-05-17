export const metadata = {
  title: "Terms - NostrLab",
};

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto px-5 py-10 md:py-14 space-y-7">
      <header>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-[-0.025em]">Terms</h1>
        <p className="text-muted mt-3">
          These baseline terms describe how this open-source event software is intended to operate.
        </p>
      </header>

      <Section title="Organizer Responsibility">
        Organizers are responsible for event accuracy, attendee communication, admission decisions, refunds, venue rules, and local legal compliance.
      </Section>

      <Section title="Payments">
        Ticket payments are made directly to organizer Lightning wallets. NostrLab does not custody funds, reverse payments, or guarantee refunds.
      </Section>

      <Section title="Nostr Data">
        Public Nostr events and RSVPs may be copied by relays and clients outside this app. Deleting or hiding data in this app does not remove it from the Nostr network.
      </Section>

      <Section title="Availability">
        NostrLab depends on external relays, wallets, Blossom servers, maps, and infrastructure. Service availability can vary by deployment.
      </Section>

      <Section title="Operator Policy">
        Each public deployment should publish its own operator contact, jurisdiction, support policy, and any additional terms required for its users.
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-6">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-fg/80 leading-7 mt-2">{children}</p>
    </section>
  );
}
