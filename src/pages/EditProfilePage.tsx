import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useRelays } from "../hooks/useRelays";
import { useToast } from "../components/Toast";
import { fetchProfiles, publishProfile } from "../lib/nostr";
import ImageUpload from "../components/ImageUpload";

export default function EditProfilePage() {
  const { pubkey, npub, signer } = useAuth();
  const { globalRelays } = useRelays();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [about, setAbout] = useState("");
  const [picture, setPicture] = useState("");
  const [nip05, setNip05] = useState("");
  const [banner, setBanner] = useState("");
  const [lud16, setLud16] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!pubkey) { setLoading(false); return; }
    let cancelled = false;
    fetchProfiles([pubkey], globalRelays).then((profiles) => {
      if (cancelled) return;
      const p = profiles.get(pubkey);
      if (p) {
        setName(p.name ?? "");
        setDisplayName(p.displayName ?? "");
        setAbout(p.about ?? "");
        setPicture(p.picture ?? "");
        setNip05(p.nip05 ?? "");
        setBanner(p.banner ?? "");
        setLud16(p.lud16 ?? "");
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [pubkey, globalRelays]);

  if (!pubkey || !signer) {
    return (
      <div className="text-center py-20">
        <p className="text-text-secondary mb-3">Sign in to edit your profile</p>
        <Link to="/login" className="btn btn-primary no-underline hover:no-underline">
          Sign in
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await publishProfile(signer, {
        name: name || undefined,
        displayName: displayName || undefined,
        about: about || undefined,
        picture: picture || undefined,
        nip05: nip05 || undefined,
        banner: banner || undefined,
        lud16: lud16 || undefined,
      }, globalRelays);
      toast("Profile updated!", "success");
      navigate(`/user/${npub}`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to update profile", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <p>Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Edit Profile</h1>
        <p className="text-text-secondary text-sm mt-1">Update your Nostr identity metadata</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Preview */}
        <div className="border border-border rounded-xl bg-bg-secondary p-5">
          <div className="flex items-center gap-4">
            {picture && !imgError ? (
              <img
                key={picture}
                src={picture}
                alt=""
                className="w-16 h-16 rounded-full border-2 border-border object-cover"
                onError={() => setImgError(true)}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-bg-tertiary border-2 border-border flex items-center justify-center text-2xl text-text-muted">?</div>
            )}
            <div>
              <div className="font-semibold text-lg">{displayName || name || "Anonymous"}</div>
              {nip05 && <div className="text-sm text-accent">{nip05}</div>}
              {about && <div className="text-sm text-text-secondary mt-0.5">{about.slice(0, 80)}{about.length > 80 ? "..." : ""}</div>}
            </div>
          </div>
        </div>

        <div className="border border-border rounded-xl bg-bg-secondary p-5 space-y-4">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Identity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-text-primary block mb-1.5 font-medium">Username</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="satoshi"
                className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-sm text-text-primary block mb-1.5 font-medium">Display Name</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Satoshi Nakamoto"
                className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent" />
            </div>
          </div>
          <div>
            <label className="text-sm text-text-primary block mb-1.5 font-medium">Bio</label>
            <textarea value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Tell the world about yourself..."
              className="w-full h-24 bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted resize-y focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-sm text-text-primary block mb-1.5 font-medium">NIP-05 Identifier</label>
            <input type="text" value={nip05} onChange={(e) => setNip05(e.target.value)} placeholder="you@example.com"
              className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent" />
            <p className="text-xs text-text-muted mt-1">Verified Nostr address (like an email-style handle)</p>
          </div>
        </div>

        <div className="border border-border rounded-xl bg-bg-secondary p-5 space-y-4">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Media</h2>
          <ImageUpload
            label="Profile Picture"
            value={picture}
            onChange={(url) => { setPicture(url); setImgError(false); }}
            preview="avatar"
          />
          <ImageUpload
            label="Banner"
            value={banner}
            onChange={setBanner}
            preview="banner"
          />
        </div>

        <div className="border border-border rounded-xl bg-bg-secondary p-5 space-y-4">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Lightning</h2>
          <div>
            <label className="text-sm text-text-primary block mb-1.5 font-medium">Lightning Address (LUD-16)</label>
            <input type="text" value={lud16} onChange={(e) => setLud16(e.target.value)} placeholder="you@getalby.com"
              className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent" />
            <p className="text-xs text-text-muted mt-1">Enables zaps (Lightning tips) from other users</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Saving..." : "Save Profile"}
          </button>
          <button type="button" onClick={() => navigate(`/user/${npub}`)} className="btn">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
