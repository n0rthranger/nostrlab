export const metadata = {
  title: "Privacy - NostrLab",
};

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-5 py-10 md:py-14 space-y-7">
      <header>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-[-0.025em]">Privacy</h1>
        <p className="text-muted mt-3">
          NostrLab is built around public Nostr data and private operational data staying separate.
        </p>
      </header>

      <Section title="Public Data">
        Event listings, public RSVPs, comments, announcements, profile metadata, and community pages can be published to Nostr relays or indexed from relays. Nostr relays are independent networks, so public events may remain available outside NostrLab.
      </Section>

      <Section title="Private Operational Data">
        Ticket secrets, payment invoices, payment hashes, check-in records, session cookies, and private RSVPs are stored by the app for product operation and are not intentionally published to Nostr relays.
      </Section>

      <Section title="Payments">
        Paid tickets are paid directly to the organizer's Lightning Address. NostrLab does not custody sats. Refunds, if any, are handled directly by the organizer.
      </Section>

      <Section title="Uploads">
        Images may be stored on a configured Blossom or object-storage provider. Do not upload private or sensitive images to public event pages.
      </Section>

      <Section title="Contact">
        For privacy or safety requests, contact the operator of the deployment you are using.
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
