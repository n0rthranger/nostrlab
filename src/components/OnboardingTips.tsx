import { useState } from "react";
import { Link } from "react-router-dom";

const DISMISSED_KEY = "nostrlab-onboarding-dismissed";

// Static class map — Tailwind needs full class names at build time
const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
  accent: { bg: "bg-accent/10", border: "border-accent/20", text: "text-accent" },
  green: { bg: "bg-green/10", border: "border-green/20", text: "text-green" },
  purple: { bg: "bg-purple/10", border: "border-purple/20", text: "text-purple" },
  orange: { bg: "bg-orange/10", border: "border-orange/20", text: "text-orange" },
  cyan: { bg: "bg-cyan/10", border: "border-cyan/20", text: "text-cyan" },
};

interface Tip {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action: { label: string; to: string; external?: boolean };
  color: string;
}

const tips: Tip[] = [
  {
    id: "sign-in",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
      </svg>
    ),
    title: "Sign in with Nostr",
    description: "Use a browser extension (nos2x, Alby) or paste your nsec key to get started.",
    action: { label: "Sign in", to: "/login" },
    color: "accent",
  },
  {
    id: "create-repo",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12h14"/>
      </svg>
    ),
    title: "Create a repository",
    description: "Announce your first repo on Nostr. It gets published to relays — no server needed.",
    action: { label: "New repo", to: "/new" },
    color: "green",
  },
  {
    id: "import-github",
    icon: (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/>
      </svg>
    ),
    title: "Import from GitHub",
    description: "Bring your existing GitHub repos to Nostr with one click.",
    action: { label: "Import", to: "/import" },
    color: "purple",
  },
  {
    id: "bounties",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    ),
    title: "Earn sats with bounties",
    description: "Browse open bounties and earn Bitcoin by contributing code to projects.",
    action: { label: "Bounty Hunt", to: "/bounties" },
    color: "orange",
  },
  {
    id: "nip07",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    title: "Install a Nostr extension",
    description: "For the best experience, install a NIP-07 extension like nos2x or Alby.",
    action: { label: "Learn more", to: "https://github.com/nicabarria/awesome-nostr?tab=readme-ov-file#nip-07-browser-extensions", external: true },
    color: "cyan",
  },
];

export default function OnboardingTips({ isSignedIn }: { isSignedIn: boolean }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [allDismissed, setAllDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY + "-all") === "true";
    } catch {
      return false;
    }
  });

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])); } catch {}
  };

  const dismissAll = () => {
    setAllDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY + "-all", "true"); } catch {}
  };

  if (allDismissed) return null;

  // Filter tips based on context
  const visibleTips = tips.filter((tip) => {
    if (dismissed.has(tip.id)) return false;
    if (tip.id === "sign-in" && isSignedIn) return false;
    if ((tip.id === "create-repo" || tip.id === "import-github") && !isSignedIn) return false;
    return true;
  });

  if (visibleTips.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-secondary flex items-center gap-2">
          <span className="text-cyan font-mono text-xs opacity-50">&gt;</span>
          Getting Started
        </h3>
        <button
          onClick={dismissAll}
          className="text-[10px] text-text-muted hover:text-text-secondary bg-transparent border-0 cursor-pointer font-mono"
        >
          dismiss all
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleTips.map((tip) => (
          <div key={tip.id} className="Box p-4 relative group hover:border-accent/30 transition-colors">
            <button
              onClick={() => dismiss(tip.id)}
              className="absolute top-2 right-2 text-text-muted hover:text-text-secondary bg-transparent border-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity text-xs"
              title="Dismiss"
            >
              &#x2715;
            </button>
            <div className={`w-8 h-8 rounded-lg ${colorClasses[tip.color]?.bg ?? ""} border ${colorClasses[tip.color]?.border ?? ""} flex items-center justify-center mb-3 ${colorClasses[tip.color]?.text ?? ""}`}>
              {tip.icon}
            </div>
            <h4 className="text-sm font-semibold text-text-primary mb-1">{tip.title}</h4>
            <p className="text-xs text-text-muted leading-relaxed mb-3">{tip.description}</p>
            {tip.action.external ? (
              <a
                href={tip.action.to}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:underline no-underline font-medium"
              >
                {tip.action.label} &rarr;
              </a>
            ) : (
              <Link
                to={tip.action.to}
                className="text-xs text-accent hover:underline no-underline font-medium"
              >
                {tip.action.label} &rarr;
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
