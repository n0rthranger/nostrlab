import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { fetchReactions, publishReaction } from "../lib/nostr";
import { useRelays } from "../hooks/useRelays";

const EMOJI_OPTIONS = ["+", "👍", "👎", "😄", "🎉", "😕", "❤️", "🚀", "👀"];

interface Props {
  targetId: string;
  targetPubkey: string;
}

export default function CommentReactions({ targetId, targetPubkey }: Props) {
  const { pubkey, signer } = useAuth();
  const { globalRelays } = useRelays();
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchReactions([targetId], globalRelays).then((rxns) => {
      if (cancelled) return;
      const grouped: Record<string, string[]> = {};
      for (const r of rxns) {
        const key = r.content === "+" ? "👍" : r.content;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r.pubkey);
      }
      setReactions(grouped);
    });
    return () => { cancelled = true; };
  }, [targetId, globalRelays]);

  const handleReact = async (emoji: string) => {
    if (!signer || !pubkey) return;
    const content = emoji === "👍" ? "+" : emoji;
    await publishReaction(signer, { targetId, targetPubkey, content }, globalRelays);
    setReactions((prev) => {
      const key = emoji;
      const existing = prev[key] ?? [];
      if (existing.includes(pubkey)) return prev;
      return { ...prev, [key]: [...existing, pubkey] };
    });
    setShowPicker(false);
  };

  const hasReactions = Object.keys(reactions).length > 0;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {Object.entries(reactions).map(([emoji, users]) => (
        <button
          key={emoji}
          onClick={() => handleReact(emoji)}
          className={`text-xs px-1.5 py-0.5 rounded-full border cursor-pointer ${
            users.includes(pubkey ?? "")
              ? "bg-accent/15 border-accent/30 text-accent"
              : "bg-transparent border-border text-text-muted hover:border-text-muted"
          }`}
        >
          {emoji} {users.length}
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className={`text-xs px-1.5 py-0.5 rounded-full border border-border text-text-muted hover:text-text-secondary bg-transparent cursor-pointer ${hasReactions ? "" : "border-dashed"}`}
        >
          {hasReactions ? "+" : "😀"}
        </button>
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 bg-bg-secondary border border-border rounded-lg p-1 shadow-lg z-10">
            {EMOJI_OPTIONS.filter((e) => e !== "+").map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                className="text-sm p-1 hover:bg-bg-tertiary rounded cursor-pointer bg-transparent border-0"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
