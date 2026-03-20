import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { fetchFollowing, publishContactList } from "../lib/nostr";

interface Props {
  targetPubkey: string;
}

export default function FollowButton({ targetPubkey }: Props) {
  const { pubkey, signer } = useAuth();
  const [following, setFollowing] = useState<string[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pubkey) return;
    let cancelled = false;
    fetchFollowing(pubkey).then((list) => {
      if (cancelled) return;
      setFollowing(list);
      setIsFollowing(list.includes(targetPubkey));
    });
    return () => { cancelled = true; };
  }, [pubkey, targetPubkey]);

  if (!pubkey || !signer || pubkey === targetPubkey) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const newList = isFollowing
        ? following.filter((pk) => pk !== targetPubkey)
        : [...following, targetPubkey];
      await publishContactList(signer, newList);
      setFollowing(newList);
      setIsFollowing(!isFollowing);
    } catch {
      // publish failed — state unchanged
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`px-3 py-1 text-xs rounded-lg cursor-pointer font-medium ${
        isFollowing
          ? "border border-border text-text-secondary hover:text-red hover:border-red/30 bg-transparent"
          : "bg-accent text-white border border-accent hover:opacity-90"
      }`}
    >
      {busy ? "..." : isFollowing ? "Unfollow" : "Follow"}
    </button>
  );
}
