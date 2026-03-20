import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useRelays } from "../hooks/useRelays";
import { fetchReactions, publishReaction, publishDeletion } from "../lib/nostr";
import { useToast } from "./Toast";

interface Props {
  targetId: string;
  targetPubkey: string;
  className?: string;
}

export default function StarButton({ targetId, targetPubkey, className = "" }: Props) {
  const { pubkey, signer } = useAuth();
  const { globalRelays } = useRelays();
  const { toast } = useToast();
  const [count, setCount] = useState(0);
  const [starred, setStarred] = useState(false);
  const [myReactionId, setMyReactionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchReactions([targetId], globalRelays).then((reactions) => {
      if (cancelled) return;
      setCount(reactions.length);
      if (pubkey) {
        const mine = reactions.find((r) => r.pubkey === pubkey);
        setStarred(!!mine);
        setMyReactionId(mine?.id ?? null);
      }
    });
    return () => { cancelled = true; };
  }, [targetId, globalRelays, pubkey]);

  const handleToggle = async () => {
    if (!signer || !pubkey) {
      toast("Sign in to star", "info");
      return;
    }
    setLoading(true);
    try {
      if (starred && myReactionId) {
        // Unstar: publish NIP-09 deletion
        await publishDeletion(signer, [myReactionId], "unstar", globalRelays);
        setStarred(false);
        setMyReactionId(null);
        setCount((c) => Math.max(0, c - 1));
      } else {
        // Star: publish reaction
        const event = await publishReaction(signer, { targetId, targetPubkey }, globalRelays);
        setStarred(true);
        setMyReactionId(event.id);
        setCount((c) => c + 1);
      }
    } catch {
      toast("Failed to update star", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`btn btn-sm ${starred ? "bg-orange/10 border-orange/30 text-orange" : ""} ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" className={starred ? "text-orange" : ""}>
        <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
      </svg>
      <span>{starred ? "Starred" : "Star"}</span>
      <span className="Counter">{count}</span>
    </button>
  );
}
