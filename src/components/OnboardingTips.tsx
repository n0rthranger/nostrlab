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
];

export default function OnboardingTips() {
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

  const visibleTips = tips.filter((tip) => !dismissed.has(tip.id));

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
