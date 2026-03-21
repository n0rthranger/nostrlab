import { useState } from "react";
import { Link } from "react-router-dom";

const sections = [
  "overview",
  "getting-started",
  "repositories",
  "git-cli",
  "collaboration",
  "bounties",
  "architecture",
] as const;

type Section = (typeof sections)[number];

const sectionLabels: Record<Section, string> = {
  overview: "Overview",
  "getting-started": "Getting Started",
  repositories: "Repositories",
  "git-cli": "Git CLI (Blossom)",
  collaboration: "Collaboration",
  bounties: "Bounties & Zaps",
  architecture: "Architecture",
};

export default function HelpPage() {
  const [active, setActive] = useState<Section>("overview");

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">
        <span className="gradient-text">NostrLab</span>{" "}
        <span className="text-text-secondary font-normal">Documentation</span>
      </h1>
      <p className="text-text-muted text-sm mb-8">
        Everything you need to know about decentralized code collaboration on Nostr.
      </p>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar nav */}
        <nav className="md:w-48 shrink-0">
          <ul className="list-none p-0 m-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {sections.map((s) => (
              <li key={s}>
                <button
                  onClick={() => setActive(s)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-mono transition-colors border-0 cursor-pointer whitespace-nowrap ${
                    active === s
                      ? "bg-accent/15 text-accent"
                      : "bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50"
                  }`}
                >
                  {sectionLabels[s]}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-bg-secondary border border-border/50 rounded-xl p-6 md:p-8">
            {active === "overview" && <OverviewSection />}
            {active === "getting-started" && <GettingStartedSection />}
            {active === "repositories" && <RepositoriesSection />}
            {active === "git-cli" && <GitCliSection />}
            {active === "collaboration" && <CollaborationSection />}
            {active === "bounties" && <BountiesSection />}
            {active === "architecture" && <ArchitectureSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Section components ── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold text-text-primary mb-4">{children}</h2>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-text-primary mt-6 mb-2">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-text-secondary text-sm leading-relaxed mb-3">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-bg-primary border border-border/50 rounded-lg p-4 text-xs font-mono text-accent overflow-x-auto mb-4">
      {children}
    </pre>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-text-secondary text-sm leading-relaxed mb-1.5 flex gap-2">
      <span className="text-accent shrink-0">&#8250;</span>
      <span>{children}</span>
    </li>
  );
}

function OverviewSection() {
  return (
    <>
      <SectionTitle>What is NostrLab?</SectionTitle>
      <P>
        NostrLab is a decentralized alternative to GitHub built on the{" "}
        <span className="text-accent">Nostr protocol</span>. It provides Git repository hosting,
        issue tracking, patch submissions, code review, and bounties — all without relying on a
        single corporate server.
      </P>

      <Sub>How it works</Sub>
      <ul className="list-none p-0 m-0 mb-4">
        <Li>
          <strong>Issues, patches, and metadata</strong> are stored as Nostr events on relays. They
          are replicated across multiple relays so no single point of failure exists.
        </Li>
        <Li>
          <strong>Code (Git objects)</strong> is stored on{" "}
          <span className="text-accent">Blossom</span> servers — a decentralized file hosting
          protocol (BUD-01) where files are addressed by their SHA-256 hash. You can self-host a
          Blossom server or use any public provider.
        </Li>
        <Li>
          <strong>Identity</strong> is your Nostr keypair. No email, no password, no account to
          create. Sign in with a NIP-07 browser extension.
        </Li>
      </ul>

      <Sub>Key differences from GitHub</Sub>
      <ul className="list-none p-0 m-0 mb-4">
        <Li>No single company controls your repos, issues, or identity</Li>
        <Li>Your data is replicated across multiple independent relays</Li>
        <Li>You can self-host both relay and Blossom storage</Li>
        <Li>Built-in Bitcoin/Lightning bounties and zaps for contributors</Li>
        <Li>Works from the browser and from the terminal via <code className="text-accent text-xs bg-bg-primary px-1 py-0.5 rounded">git-remote-blossom</code></Li>
      </ul>

      <Sub>Nostr standards used</Sub>
      <ul className="list-none p-0 m-0">
        <Li><strong>NIP-34</strong> — Git repository announcements (kind 30617), repo state (kind 30618)</Li>
        <Li><strong>NIP-07</strong> — Browser extension signing (nos2x, Alby, Flamingo)</Li>
        <Li><strong>BUD-01</strong> — Blossom file storage protocol</Li>
      </ul>
    </>
  );
}

function GettingStartedSection() {
  return (
    <>
      <SectionTitle>Getting Started</SectionTitle>

      <Sub>1. Get a Nostr key</Sub>
      <P>
        Your Nostr keypair is your identity. Install a NIP-07 browser extension to manage your keys:
      </P>
      <ul className="list-none p-0 m-0 mb-4">
        <Li><strong>Alby</strong> — browser extension with Lightning wallet built in</Li>
        <Li><strong>nos2x</strong> / <strong>nos2x-fox</strong> — lightweight key signers</Li>
        <Li><strong>Flamingo</strong> — mobile-friendly Nostr signer</Li>
      </ul>

      <Sub>2. Sign in</Sub>
      <P>
        Click <Link to="/login" className="text-accent hover:underline">Get Started</Link> and
        approve the signing request from your extension. No email or password needed.
      </P>

      <Sub>3. Create a repository</Sub>
      <P>
        Go to <Link to="/new" className="text-accent hover:underline">New Repository</Link> and fill
        in the details. You can optionally initialize with a README, license, and .gitignore. The
        repo announcement is published to Nostr relays, and if initialized, the code is uploaded to
        Blossom automatically.
      </P>

      <Sub>4. Start collaborating</Sub>
      <P>
        Browse code in the browser, create issues, submit patches, or clone from the terminal. All
        interactions are signed with your Nostr key and published to relays.
      </P>
    </>
  );
}

function RepositoriesSection() {
  return (
    <>
      <SectionTitle>Repositories</SectionTitle>

      <Sub>Creating a repo</Sub>
      <P>
        When you create a repository, NostrLab publishes a <strong>kind 30617</strong> event (repo
        announcement) to your configured relays. This event contains the repo name, description,
        topics, clone URLs, and optional license/language tags.
      </P>
      <P>
        If you initialize the repo with a README, license, or .gitignore, NostrLab uses{" "}
        <span className="text-accent">isomorphic-git</span> to create an initial commit in your
        browser, packs it into a Git packfile, and uploads it to a Blossom server. The resulting
        Blossom URL is added to the repo announcement as a clone URL.
      </P>

      <Sub>Browsing code</Sub>
      <P>
        The built-in code browser clones from Blossom into your browser's IndexedDB storage using
        isomorphic-git. You can navigate files, view syntax-highlighted source, and see commit
        history — all client-side with no server involved.
      </P>

      <Sub>Editing files</Sub>
      <P>
        Repo owners can edit files directly in the browser. Changes are committed locally with
        isomorphic-git, repacked, and pushed to Blossom. The repo announcement is updated with the
        new packfile URL.
      </P>

      <Sub>Importing from GitHub</Sub>
      <P>
        You can import existing repos from GitHub, GitLab, or any Git host using the{" "}
        <Link to="/import" className="text-accent hover:underline">Import</Link> page. This creates a
        repo announcement on Nostr pointing to the original clone URL.
      </P>
    </>
  );
}

function GitCliSection() {
  return (
    <>
      <SectionTitle>Git CLI (git-remote-blossom)</SectionTitle>
      <P>
        <code className="text-accent text-xs bg-bg-primary px-1.5 py-0.5 rounded">git-remote-blossom</code>{" "}
        is a Git remote helper that lets you clone, fetch, and push repos using standard Git commands
        from your terminal. No special client needed — it works with regular <code className="text-accent text-xs bg-bg-primary px-1.5 py-0.5 rounded">git</code>.
      </P>

      <Sub>Installation</Sub>
      <Code>{`cd git-remote-blossom
npm install
npm run build
npm link`}</Code>
      <P>
        This installs <code className="text-accent text-xs bg-bg-primary px-1.5 py-0.5 rounded">git-remote-blossom</code> globally.
        Git automatically discovers it when you use <code className="text-accent text-xs bg-bg-primary px-1.5 py-0.5 rounded">blossom://</code> URLs.
      </P>

      <Sub>Authentication</Sub>
      <P>
        Set your Nostr secret key (nsec) so the CLI can sign events and upload to Blossom:
      </P>
      <Code>{`export NOSTR_NSEC="nsec1your_key_here"`}</Code>
      <P>
        Alternatively, store it in <code className="text-accent text-xs bg-bg-primary px-1.5 py-0.5 rounded">~/.nostr/nsec</code> or{" "}
        <code className="text-accent text-xs bg-bg-primary px-1.5 py-0.5 rounded">~/.nostrlab/config.json</code>.
      </P>

      <Sub>Cloning</Sub>
      <Code>{`# Using hex pubkey
git clone blossom://<pubkey>/<repo-name>

# Using npub
git clone blossom://npub1.../<repo-name>

# Using naddr (includes relay hints)
git clone blossom://naddr1...`}</Code>

      <Sub>Pushing</Sub>
      <Code>{`git add .
git commit -m "your changes"
git push origin main`}</Code>
      <P>
        On push, the CLI packs all Git objects into a packfile, uploads it to Blossom, and publishes
        updated repo announcement (kind 30617) and repo state (kind 30618) events to Nostr relays.
      </P>

      <Sub>How it works under the hood</Sub>
      <ul className="list-none p-0 m-0">
        <Li>Git calls <code className="text-accent text-xs bg-bg-primary px-1.5 py-0.5 rounded">git-remote-blossom</code> automatically for <code className="text-accent text-xs bg-bg-primary px-1.5 py-0.5 rounded">blossom://</code> URLs</Li>
        <Li>The helper queries Nostr relays to find the repo announcement and current refs</Li>
        <Li>On fetch: downloads the packfile from Blossom and indexes it into your local repo</Li>
        <Li>On push: creates a packfile, uploads to Blossom, updates Nostr events with new refs</Li>
      </ul>
    </>
  );
}

function CollaborationSection() {
  return (
    <>
      <SectionTitle>Collaboration</SectionTitle>

      <Sub>Issues</Sub>
      <P>
        Issues are Nostr events tagged with the repo address. Anyone with a Nostr key can open an
        issue. Comments are threaded reply events. All data lives on relays — no central server
        required.
      </P>

      <Sub>Patches</Sub>
      <P>
        Patches follow the NIP-34 standard. You can submit a patch as a Nostr event containing the
        diff. Repo maintainers can review and discuss patches through threaded comments.
      </P>

      <Sub>Pull Requests</Sub>
      <P>
        Pull requests work similarly to patches but reference a fork or branch. They include
        description, diff, and support threaded code review discussions.
      </P>

      <Sub>Code Snippets</Sub>
      <P>
        Share code snippets as standalone Nostr events with syntax highlighting. Snippets are
        discoverable across the Nostr network and can be zapped.
      </P>

      <Sub>Discussions</Sub>
      <P>
        Each repository has a discussion board for general conversations. Discussions are Nostr
        events threaded with replies — like a decentralized forum attached to your repo.
      </P>
    </>
  );
}

function BountiesSection() {
  return (
    <>
      <SectionTitle>Bounties & Zaps</SectionTitle>

      <Sub>Zaps</Sub>
      <P>
        Zaps are Bitcoin Lightning payments sent through Nostr. You can zap repos, issues, patches,
        and contributors directly. Zaps are recorded as Nostr events so they're publicly verifiable.
      </P>

      <Sub>Bounties</Sub>
      <P>
        Create bounties on issues to incentivize contributions with Bitcoin. Set a sat amount, and
        when a patch or PR resolves the issue, the bounty can be released to the contributor via
        Lightning.
      </P>

      <Sub>How payments work</Sub>
      <ul className="list-none p-0 m-0">
        <Li>Payments use the Bitcoin Lightning Network — instant, low-fee, peer-to-peer</Li>
        <Li>No platform takes a cut — payments go directly between users</Li>
        <Li>All zap events are signed and published to relays for transparency</Li>
        <Li>You need a Lightning wallet with a Nostr-compatible address (NIP-57)</Li>
      </ul>
    </>
  );
}

function ArchitectureSection() {
  return (
    <>
      <SectionTitle>Architecture</SectionTitle>
      <P>
        NostrLab is a fully client-side application. There is no backend server — your browser
        communicates directly with Nostr relays and Blossom file servers.
      </P>

      <Sub>Data storage</Sub>
      <div className="bg-bg-primary border border-border/50 rounded-lg p-4 mb-4 text-sm font-mono">
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <span className="text-accent">Nostr relays</span>
          <span className="text-text-secondary">Repo metadata, issues, patches, PRs, discussions, zaps</span>
          <span className="text-accent">Blossom servers</span>
          <span className="text-text-secondary">Git packfiles (code, commits, trees, blobs)</span>
          <span className="text-accent">Browser (IndexedDB)</span>
          <span className="text-text-secondary">Cloned repos for browsing/editing, cached profiles</span>
          <span className="text-accent">Your keypair</span>
          <span className="text-text-secondary">Identity, signing — managed by NIP-07 extension</span>
        </div>
      </div>

      <Sub>No single point of failure</Sub>
      <ul className="list-none p-0 m-0 mb-4">
        <Li>Nostr events are replicated across multiple independent relays</Li>
        <Li>Blossom files are content-addressed (SHA-256) and can be mirrored to any Blossom server</Li>
        <Li>You can run your own relay and Blossom server for full sovereignty</Li>
        <Li>If NostrLab.com goes down, your data still exists on relays and Blossom servers</Li>
      </ul>

      <Sub>Nostr event kinds used</Sub>
      <div className="bg-bg-primary border border-border/50 rounded-lg p-4 mb-4 text-sm font-mono">
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <span className="text-accent">30617</span>
          <span className="text-text-secondary">Repository announcement (name, description, clone URLs)</span>
          <span className="text-accent">30618</span>
          <span className="text-text-secondary">Repository state (current branch refs and HEAD)</span>
          <span className="text-accent">1621</span>
          <span className="text-text-secondary">Issues</span>
          <span className="text-accent">1617</span>
          <span className="text-text-secondary">Patches</span>
          <span className="text-accent">1111</span>
          <span className="text-text-secondary">Comments and reviews</span>
          <span className="text-accent">9802</span>
          <span className="text-text-secondary">Zap receipts</span>
        </div>
      </div>

      <Sub>Self-hosting</Sub>
      <P>
        You don't need NostrLab.com to use any of this. The entire stack can be self-hosted:
      </P>
      <ul className="list-none p-0 m-0">
        <Li>Run your own <strong>Nostr relay</strong> (e.g., strfry, nostr-rs-relay) for metadata</Li>
        <Li>Run your own <strong>Blossom server</strong> (e.g., blossom-server) for file storage</Li>
        <Li>Use <code className="text-accent text-xs bg-bg-primary px-1.5 py-0.5 rounded">git-remote-blossom</code> to push/pull from the terminal</Li>
        <Li>Fork the NostrLab frontend and host it anywhere — it's fully static</Li>
      </ul>
    </>
  );
}
