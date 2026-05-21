"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NostrAuthButton } from "@/components/nostr/NostrAuthButton";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/events", label: "Discover" },
  { href: "/communities", label: "Communities" },
  { href: "/faq", label: "FAQ" },
  { href: "/dashboard", label: "My events" },
];

const MOBILE_NAV = [
  { href: "/events", label: "Discover", icon: "search" },
  { href: "/communities", label: "Communities", icon: "users" },
  { href: "/dashboard", label: "My events", icon: "grid" },
  { href: "/events/create", label: "New", icon: "plus" },
] as const;

function isActivePath(path: string, href: string) {
  if (href === "/events") {
    return path === "/events" || (path.startsWith("/events/") && !path.startsWith("/events/create"));
  }
  return path === href || path.startsWith(href + "/");
}

export function Header() {
  const path = usePathname();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/95 text-white backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-5 md:px-10 h-14 flex items-center gap-3 md:gap-6">
          <Link href="/" className="font-semibold text-base shrink-0">
            NostrLab
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            {NAV.map((n) => {
              const active = isActivePath(path, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "px-3 h-9 inline-flex items-center rounded-md transition-colors",
                    active ? "text-fg bg-surface2" : "text-muted hover:text-fg hover:bg-surface2/60"
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <Link
              href="/events/create"
              className="hidden sm:inline-flex h-9 px-3.5 items-center gap-1.5 text-sm font-medium rounded-full border border-white/15 text-white hover:bg-white/10 transition-colors"
            >
              <NavIcon name="plus" className="h-3.5 w-3.5" />
              New event
            </Link>
            <ThemeToggle />
            <NostrAuthButton />
          </div>
        </div>
      </header>
      <nav
        aria-label="Mobile primary navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] text-white shadow-[0_-8px_30px_rgb(0_0_0_/_0.18)] backdrop-blur-md md:hidden"
      >
        <div className="grid h-16 grid-cols-4 px-1">
          {MOBILE_NAV.map((item) => {
            const active = isActivePath(path, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium transition-colors",
                  active ? "text-orange-300" : "text-zinc-400 hover:text-white"
                )}
              >
                <NavIcon name={item.icon} className="h-5 w-5 shrink-0" />
                <span className="max-w-full truncate leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function NavIcon({ name, className }: { name: (typeof MOBILE_NAV)[number]["icon"]; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  }
  if (name === "users") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (name === "grid") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
