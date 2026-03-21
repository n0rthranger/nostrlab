import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import NostrLabLogo from "./NostrLabLogo";

export default function UnlockScreen() {
  const { unlock, logout, npub } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const handleUnlock = () => {
    if (!password) return;
    setUnlocking(true);
    setError("");

    // Run in a timeout so the UI can update (scrypt is CPU-intensive)
    setTimeout(() => {
      try {
        const ok = unlock(password);
        if (!ok) {
          setError("Wrong password. Please try again.");
        }
      } catch {
        setError("Wrong password. Please try again.");
      }
      setUnlocking(false);
    }, 50);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="max-w-md w-full mx-4 animate-fadeIn">
        <div className="text-center mb-8">
          <NostrLabLogo size={56} className="mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-text-primary">Welcome back</h1>
          <p className="text-sm text-text-secondary mt-1">
            Enter your password to unlock your Nostr key
          </p>
          {npub && (
            <code className="text-xs text-text-muted mt-2 block truncate px-4">
              {npub}
            </code>
          )}
        </div>

        <div className="border border-border rounded-xl p-6 bg-bg-secondary">
          {error && (
            <div className="bg-red/10 border border-red/30 rounded-lg p-3 mb-5 text-sm text-red flex items-start gap-2">
              <span className="shrink-0">!</span>
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 mb-4">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-accent">
              <path d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 6V4a2.5 2.5 0 1 0-5 0v2Z" />
            </svg>
            <span className="text-sm text-text-secondary">Your key is encrypted with NIP-49</span>
          </div>

          <div>
            <label className="text-sm text-text-secondary block mb-1.5 font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Enter your password"
              className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              onKeyDown={(e) => e.key === "Enter" && !unlocking && handleUnlock()}
              autoFocus
              disabled={unlocking}
            />
          </div>

          <button
            onClick={handleUnlock}
            disabled={!password || unlocking}
            className="w-full mt-4 px-4 py-2.5 bg-accent hover:brightness-110 text-white rounded-lg font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
          >
            {unlocking ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Decrypting...
              </>
            ) : (
              "Unlock"
            )}
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-text-muted text-xs uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            onClick={logout}
            className="w-full px-4 py-2.5 bg-transparent border border-border text-text-secondary rounded-lg font-medium hover:bg-bg-tertiary cursor-pointer text-sm"
          >
            Sign out & use a different key
          </button>
        </div>
      </div>
    </div>
  );
}
