import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import NostrLabLogo from "../components/NostrLabLogo";

export default function LoginPage() {
  const { login, loginWithExtension, generateAndLogin } = useAuth();
  const navigate = useNavigate();
  const [nsec, setNsec] = useState("");
  const [error, setError] = useState("");
  const [showNsec, setShowNsec] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<{ nsec: string; npub: string } | null>(null);
  const [copied, setCopied] = useState<"nsec" | "npub" | null>(null);

  const handleNsecLogin = () => {
    try {
      login(nsec.trim());
      navigate("/");
    } catch {
      setError("Invalid nsec key. Make sure it starts with 'nsec1'.");
    }
  };

  const handleExtension = async () => {
    const ok = await loginWithExtension();
    if (ok) {
      navigate("/");
    } else {
      setError("No Nostr browser extension detected. Install one like nos2x, Alby, or Flamingo to sign in this way.");
    }
  };

  const handleGenerate = () => {
    const keys = generateAndLogin();
    setGeneratedKeys(keys);
  };

  const copyToClipboard = async (text: string, which: "nsec" | "npub") => {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  if (generatedKeys) {
    return (
      <div className="max-w-lg mx-auto mt-10 animate-fadeIn">
        <div className="border border-border rounded-xl p-6 bg-bg-secondary">
          <div className="text-center mb-6">
            <NostrLabLogo size={48} className="mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-green">Welcome to NostrLab!</h1>
            <p className="text-sm text-text-secondary mt-1">Your Nostr identity has been created</p>
          </div>

          <div className="bg-red/10 border border-red/30 rounded-lg p-4 mb-5">
            <div className="flex items-start gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red shrink-0 mt-0.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <p className="text-sm text-red font-semibold">Save your secret key now!</p>
                <p className="text-xs text-red/80 mt-0.5">This is the only time you'll see it. If you lose it, you lose access to this identity forever. There is no recovery.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-text-secondary font-medium">Public Key (your address)</label>
                <button
                  onClick={() => copyToClipboard(generatedKeys.npub, "npub")}
                  className="text-xs text-accent hover:text-accent-hover cursor-pointer bg-transparent border-0"
                >
                  {copied === "npub" ? "Copied!" : "Copy"}
                </button>
              </div>
              <code className="text-xs break-all bg-bg-primary border border-border p-3 rounded-lg block text-text-secondary">
                {generatedKeys.npub}
              </code>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-orange font-medium">Secret Key (keep private!)</label>
                <button
                  onClick={() => copyToClipboard(generatedKeys.nsec, "nsec")}
                  className="text-xs text-accent hover:text-accent-hover cursor-pointer bg-transparent border-0"
                >
                  {copied === "nsec" ? "Copied!" : "Copy"}
                </button>
              </div>
              <code className="text-xs break-all bg-orange/5 border border-orange/30 p-3 rounded-lg block text-orange">
                {generatedKeys.nsec}
              </code>
            </div>
          </div>

          <button
            onClick={() => navigate("/")}
            className="mt-6 w-full px-4 py-3 bg-green text-white rounded-lg font-medium hover:brightness-110 cursor-pointer text-sm"
          >
            I've saved my keys — Start exploring
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-10 animate-fadeIn">
      <div className="text-center mb-8">
        <NostrLabLogo size={56} className="mx-auto mb-3" />
        <h1 className="text-2xl font-bold">Sign in to NostrLab</h1>
        <p className="text-sm text-text-secondary mt-1">
          Connect with your Nostr identity or create a new one
        </p>
      </div>

      <div className="border border-border rounded-xl p-6 bg-bg-secondary">
        {error && (
          <div className="bg-red/10 border border-red/30 rounded-lg p-3 mb-5 text-sm text-red flex items-start gap-2">
            <span className="shrink-0">!</span>
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-auto text-red/50 hover:text-red bg-transparent border-0 cursor-pointer">x</button>
          </div>
        )}

        {/* NIP-07 Extension — recommended */}
        <div className="mb-5">
          <button
            onClick={handleExtension}
            className="w-full px-4 py-3 bg-accent hover:brightness-110 text-white rounded-lg font-medium cursor-pointer flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Sign in with Browser Extension
          </button>
          <p className="text-xs text-text-muted mt-1.5 text-center">
            Recommended — uses NIP-07 extensions like Alby, nos2x, or Flamingo
          </p>
        </div>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-text-muted text-xs uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* nsec input */}
        <div className="mb-5">
          <label className="text-sm text-text-secondary block mb-1.5 font-medium">Paste your secret key</label>
          <div className="relative">
            <input
              type={showNsec ? "text" : "password"}
              value={nsec}
              onChange={(e) => { setNsec(e.target.value); setError(""); }}
              placeholder="nsec1..."
              className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent font-mono pr-16"
              onKeyDown={(e) => e.key === "Enter" && nsec.trim() && handleNsecLogin()}
            />
            <button
              onClick={() => setShowNsec(!showNsec)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-text-secondary bg-transparent border-0 cursor-pointer px-2 py-1"
            >
              {showNsec ? "Hide" : "Show"}
            </button>
          </div>
          <button
            onClick={handleNsecLogin}
            disabled={!nsec.trim()}
            className="w-full mt-2 px-4 py-2.5 bg-bg-tertiary text-text-primary rounded-lg font-medium hover:bg-border disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed text-sm"
          >
            Sign in
          </button>
        </div>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-text-muted text-xs uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Generate */}
        <button
          onClick={handleGenerate}
          className="w-full px-4 py-3 border-2 border-dashed border-green/50 text-green rounded-lg font-medium hover:bg-green/5 hover:border-green cursor-pointer flex items-center justify-center gap-2 bg-transparent"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create New Identity
        </button>
        <p className="text-xs text-text-muted mt-1.5 text-center">
          New to Nostr? Generate a fresh key pair to get started instantly.
        </p>
      </div>

      {/* Help text */}
      <div className="mt-6 p-4 rounded-lg border border-border bg-bg-secondary/50">
        <h3 className="text-sm font-medium mb-2">What is a Nostr identity?</h3>
        <p className="text-xs text-text-secondary leading-relaxed">
          Nostr uses cryptographic key pairs instead of usernames and passwords.
          Your <strong className="text-text-primary">public key</strong> (npub) is your address — share it freely.
          Your <strong className="text-orange">secret key</strong> (nsec) proves it's you — never share it.
          A browser extension keeps your secret key safe while letting apps use your identity.
        </p>
      </div>
    </div>
  );
}
