import Link from "next/link";
import { DonateButton } from "@/components/layout/DonateButton";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="max-w-6xl mx-auto px-5 py-10 grid gap-8 md:grid-cols-[1fr_auto_auto_auto_auto] text-sm">
        <div>
          <Link href="/" className="font-semibold">
            NostrLab
          </Link>
          <p className="mt-3 text-muted leading-relaxed max-w-md">
            Open-source meetup tools for Nostr communities. Publish events, collect RSVPs, and run check-in from one place.
          </p>
          <div className="mt-5">
            <DonateButton />
          </div>
        </div>
        <Col title="Product">
          <li><Link href="/events" className="hover:text-fg">Discover</Link></li>
          <li><Link href="/events/create" className="hover:text-fg">Host an event</Link></li>
          <li><Link href="/communities" className="hover:text-fg">Communities</Link></li>
          <li><Link href="/dashboard" className="hover:text-fg">Dashboard</Link></li>
        </Col>
        <Col title="Creator">
          <li>
            <a
              href="https://nostrbtc.com/p/northranger"
              target="_blank"
              rel="noreferrer"
              className="hover:text-fg"
            >
              northranger ↗
            </a>
          </li>
        </Col>
        <Col title="Built on">
          <li><a href="https://github.com/nostr-protocol/nips" target="_blank" rel="noreferrer" className="hover:text-fg">Nostr ↗</a></li>
          <li><a href="https://bitcoin.org" target="_blank" rel="noreferrer" className="hover:text-fg">Bitcoin ↗</a></li>
        </Col>
        <Col title="Signers">
          <li><a href="https://getalby.com" target="_blank" rel="noreferrer" className="hover:text-fg">Alby ↗</a></li>
          <li><a href="https://github.com/fiatjaf/nos2x" target="_blank" rel="noreferrer" className="hover:text-fg">nos2x ↗</a></li>
        </Col>
      </div>
      <div className="border-t border-border">
        <div className="max-w-6xl mx-auto px-5 py-4 text-xs text-muted flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} NostrLab · MIT</span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span>Open sourced under MIT</span>
            <a
              href="https://github.com/n0rthranger/nostrlab"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-surface px-3.5 text-xs font-semibold text-fg transition hover:border-fg/30 hover:bg-surface2 active:scale-[0.98]"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-fg2 mb-2.5">{title}</div>
      <ul className="space-y-1.5 text-muted">{children}</ul>
    </div>
  );
}
