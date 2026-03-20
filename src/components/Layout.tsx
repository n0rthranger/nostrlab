import { useState, useRef, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { shortenKey, fetchProfiles } from "../lib/nostr";
import { useTheme } from "../hooks/useTheme";
import { useNavigationShortcuts } from "../hooks/useKeyboardShortcuts";
import { useRelays } from "../hooks/useRelays";
import NotificationBell from "./NotificationBell";
import NostrLabLogo from "./NostrLabLogo";
import RelayStatusIndicator from "./RelayStatusIndicator";
import type { UserProfile } from "../types/nostr";

export default function Layout() {
  const { pubkey, npub, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { globalRelays } = useRelays();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useNavigationShortcuts();

  // Fetch user profile for header display
  useEffect(() => {
    if (!pubkey) { queueMicrotask(() => setProfile(null)); return; }
    let cancelled = false;
    fetchProfiles([pubkey], globalRelays).then((profiles) => {
      if (!cancelled) setProfile(profiles.get(pubkey) ?? null);
    });
    return () => { cancelled = true; };
  }, [pubkey, globalRelays]);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isActive = (path: string) =>
    location.pathname === path ? "font-semibold text-text-primary" : "text-text-secondary hover:text-text-primary";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Glassmorphism header */}
      <header className="border-b border-border/50 sticky top-0 z-50 header-glow header-hacker">
        <div className="max-w-[1280px] mx-auto px-4 h-14 flex items-center gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 text-text-primary no-underline hover:no-underline shrink-0 group">
            <NostrLabLogo size={28} />
            <span className="hidden sm:inline text-sm font-semibold gradient-text tracking-wide">NostrLab</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5 text-sm ml-2">
            <Link to="/" className={`px-3 py-1.5 rounded-lg no-underline hover:no-underline hover:bg-accent/8 nav-link-hacker transition-all ${isActive("/")}`}>
              Explore
            </Link>
            <Link to="/activity" className={`px-3 py-1.5 rounded-lg no-underline hover:no-underline hover:bg-accent/8 nav-link-hacker transition-all ${isActive("/activity")}`}>
              Activity
            </Link>
            <Link to="/trending" className={`px-3 py-1.5 rounded-lg no-underline hover:no-underline hover:bg-accent/8 nav-link-hacker transition-all ${isActive("/trending")}`}>
              Trending
            </Link>
            <Link to="/topics" className={`px-3 py-1.5 rounded-lg no-underline hover:no-underline hover:bg-accent/8 nav-link-hacker transition-all ${isActive("/topics")}`}>
              Topics
            </Link>
            <Link to="/snippets" className={`px-3 py-1.5 rounded-lg no-underline hover:no-underline hover:bg-accent/8 nav-link-hacker transition-all ${isActive("/snippets")}`}>
              Snippets
            </Link>
            <Link to="/bounties" className={`px-3 py-1.5 rounded-lg no-underline hover:no-underline hover:bg-accent/8 nav-link-hacker transition-all ${isActive("/bounties")}`}>
              Bounties
            </Link>
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <button
              onClick={() => navigate("/search")}
              className="p-1.5 text-accent hover:text-accent-hover bg-transparent border-0 cursor-pointer rounded-md nav-link-hacker"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
              </svg>
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 text-accent hover:text-accent-hover bg-transparent border-0 cursor-pointer rounded-md nav-link-hacker"
            >
              {theme === "dark" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>

            {pubkey ? (
              <>
                <NotificationBell />

                {/* New repo button */}
                <Link
                  to="/new"
                  className="p-1.5 text-accent hover:text-accent-hover no-underline rounded-md nav-link-hacker"
                  title="New repository"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
                  </svg>
                </Link>

                {/* Import from GitHub */}
                <Link
                  to="/import"
                  className="p-1.5 text-accent hover:text-accent-hover no-underline rounded-md nav-link-hacker"
                  title="Import from GitHub"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-8.5C1 2.784 1.784 2 2.75 2h6.5c.966 0 1.75.784 1.75 1.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.25.25 0 0 0-.25-.25h-6.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 14Zm7.22-4.22-3.25-3.25a.751.751 0 0 1 1.042-1.042L11.012 8.5H5.75a.75.75 0 0 1 0-1.5h5.262L7.762 3.75a.751.751 0 0 1 1.042-1.042l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.751.751 0 0 1-1.042-1.042L10.95 8H5.75a.75.75 0 0 1 0 1.5h5.262l-3.25 3.25a.751.751 0 0 1-.534.22Z" />
                  </svg>
                </Link>

                {/* User dropdown */}
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-1.5 p-0.5 bg-transparent border-0 cursor-pointer rounded-full hover:ring-2 hover:ring-border"
                  >
                    {profile?.picture ? (
                      <img
                        src={profile.picture}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover border border-border"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold" style={{ boxShadow: '0 0 8px rgba(191, 90, 242, 0.3)' }}>
                        {(profile?.name ?? pubkey ?? "?")[0].toUpperCase()}
                      </div>
                    )}
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted">
                      <path d="m4.427 7.427 3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z" />
                    </svg>
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 dropdown-glass rounded-xl overflow-hidden z-50 animate-fadeIn">
                      <div className="px-4 py-3 border-b border-border">
                        <div className="text-sm font-medium text-text-primary">{profile?.displayName || profile?.name || shortenKey(pubkey)}</div>
                        {(profile?.displayName || profile?.name) && (
                          <div className="text-xs text-text-muted mt-0.5">{shortenKey(pubkey)}</div>
                        )}
                      </div>
                      <div className="py-1">
                        <button onClick={() => { navigate(`/user/${npub}`); setUserMenuOpen(false); }}
                          className="w-full text-left px-4 py-2 text-sm text-text-primary hover:text-accent hover:bg-bg-tertiary bg-transparent border-0 cursor-pointer">
                          Profile
                        </button>
                        <button onClick={() => { navigate(`/user/${npub}/repositories`); setUserMenuOpen(false); }}
                          className="w-full text-left px-4 py-2 text-sm text-text-primary hover:text-accent hover:bg-bg-tertiary bg-transparent border-0 cursor-pointer">
                          Repositories
                        </button>
                        <button onClick={() => { navigate(`/user/${npub}/stars`); setUserMenuOpen(false); }}
                          className="w-full text-left px-4 py-2 text-sm text-text-primary hover:text-accent hover:bg-bg-tertiary bg-transparent border-0 cursor-pointer">
                          Stars
                        </button>
                        <button onClick={() => { navigate("/profile/edit"); setUserMenuOpen(false); }}
                          className="w-full text-left px-4 py-2 text-sm text-text-primary hover:text-accent hover:bg-bg-tertiary bg-transparent border-0 cursor-pointer">
                          Edit profile
                        </button>
                        <button onClick={() => { navigate("/messages"); setUserMenuOpen(false); }}
                          className="w-full text-left px-4 py-2 text-sm text-text-primary hover:text-accent hover:bg-bg-tertiary bg-transparent border-0 cursor-pointer">
                          Messages
                        </button>
                        <button onClick={() => { navigate("/teams"); setUserMenuOpen(false); }}
                          className="w-full text-left px-4 py-2 text-sm text-text-primary hover:text-accent hover:bg-bg-tertiary bg-transparent border-0 cursor-pointer">
                          Teams
                        </button>
                        <button onClick={() => { navigate("/settings"); setUserMenuOpen(false); }}
                          className="w-full text-left px-4 py-2 text-sm text-text-primary hover:text-accent hover:bg-bg-tertiary bg-transparent border-0 cursor-pointer">
                          Settings
                        </button>
                      </div>
                      <div className="border-t border-border py-1">
                        <button
                          onClick={() => { logout(); setUserMenuOpen(false); }}
                          className="w-full text-left px-4 py-2 text-sm text-red hover:bg-bg-tertiary bg-transparent border-0 cursor-pointer"
                        >
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link
                to="/login"
                className="btn btn-sm btn-primary no-underline hover:no-underline"
              >
                Sign in
              </Link>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 text-text-secondary hover:text-text-primary bg-transparent border-0 cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileMenuOpen ? (
                  <path d="M18 6L6 18M6 6l12 12" />
                ) : (
                  <path d="M3 12h18M3 6h18M3 18h18" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-border bg-bg-secondary px-4 py-2 animate-fadeIn">
            <Link to="/" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-md text-sm text-text-primary no-underline hover:bg-bg-tertiary">
              Explore
            </Link>
            <Link to="/activity" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-md text-sm text-text-primary no-underline hover:bg-bg-tertiary">
              Activity
            </Link>
            <Link to="/snippets" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-md text-sm text-text-primary no-underline hover:bg-bg-tertiary">
              Snippets
            </Link>
            <Link to="/bounties" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-md text-sm text-text-primary no-underline hover:bg-bg-tertiary">
              Bounties
            </Link>
            {pubkey && (
              <>
                <Link to="/new" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-md text-sm text-text-primary no-underline hover:bg-bg-tertiary">
                  New Repo
                </Link>
                <Link to="/import" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-md text-sm text-text-primary no-underline hover:bg-bg-tertiary">
                  Import from GitHub
                </Link>
                <Link to="/profile/edit" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-md text-sm text-text-primary no-underline hover:bg-bg-tertiary">
                  Edit Profile
                </Link>
              </>
            )}
            <Link to="/settings" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 rounded-md text-sm text-text-primary no-underline hover:bg-bg-tertiary">
              Settings
            </Link>
            {pubkey && (
              <button
                onClick={() => { logout(); setMobileMenuOpen(false); }}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-red bg-transparent border-0 cursor-pointer hover:bg-bg-tertiary"
              >
                Sign out
              </button>
            )}
          </nav>
        )}
      </header>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 md:px-6 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-border/50 py-8 relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
        <div className="absolute top-[1px] left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan/20 to-transparent" />
        <div className="max-w-[1280px] mx-auto px-4 flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-3">
            <NostrLabLogo size={18} />
            <span className="gradient-text font-semibold font-mono tracking-wide">NostrLab</span>
            <span className="text-text-muted/40 font-mono text-[10px]">v0.1</span>
          </div>
          <div className="flex items-center gap-4 hide-mobile">
            <RelayStatusIndicator />
            <a href="https://github.com/D3fault404/nostrlab" target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-accent transition-colors no-underline" title="GitHub">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/>
              </svg>
            </a>
            <Link to="/repo/f57d15a911fcf57dbea28801a9f5f411a02cf759742c8247ce08471f3d910973/nostrlab" className="text-text-muted hover:text-accent transition-colors no-underline" title="NostrLab on Nostr">
              <NostrLabLogo size={16} style={{ filter: "none" }} />
            </Link>
            <span className="font-mono text-[10px] opacity-50">
              <span className="text-cyan">$</span> press <kbd className="px-1.5 py-0.5 bg-bg-tertiary/50 border border-accent/15 rounded-md text-[10px] text-accent/80">?</kbd> for shortcuts
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
