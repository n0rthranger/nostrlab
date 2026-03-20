import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { publishReview } from "../lib/nostr";
import type { ReviewVerdict } from "../types/nostr";

interface Props {
  targetId: string;
  targetPubkey: string;
  onReviewSubmitted?: () => void;
}

const VERDICTS: { value: ReviewVerdict; label: string; icon: string; color: string }[] = [
  { value: "approve", label: "Approve", icon: "✓", color: "text-green" },
  { value: "request-changes", label: "Request Changes", icon: "✗", color: "text-red" },
  { value: "comment", label: "Comment", icon: "💬", color: "text-accent" },
];

export default function ReviewButton({ targetId, targetPubkey, onReviewSubmitted }: Props) {
  const { pubkey, signer } = useAuth();
  const [open, setOpen] = useState(false);
  const [selectedVerdict, setSelectedVerdict] = useState<ReviewVerdict | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!pubkey || !signer) return null;

  const handleSubmit = async () => {
    if (!selectedVerdict || submitting) return;
    setSubmitting(true);
    try {
      await publishReview(signer, {
        targetId,
        targetPubkey,
        verdict: selectedVerdict,
        comment: comment.trim() || undefined,
      });
      setOpen(false);
      setSelectedVerdict(null);
      setComment("");
      onReviewSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-4 py-2 rounded-md bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 cursor-pointer text-sm font-medium"
      >
        Review
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-bg-secondary border border-border rounded-lg shadow-lg z-20">
          <div className="p-3 border-b border-border">
            <h4 className="text-sm font-semibold text-text-primary mb-2">Submit Review</h4>
            <div className="flex gap-2">
              {VERDICTS.map((v) => (
                <button
                  key={v.value}
                  onClick={() => setSelectedVerdict(v.value)}
                  className={`flex-1 text-xs px-2 py-1.5 rounded-md border cursor-pointer font-medium ${
                    selectedVerdict === v.value
                      ? `${v.color} border-current bg-current/10`
                      : "text-text-secondary border-border bg-transparent hover:border-text-muted"
                  }`}
                >
                  <span className="mr-1">{v.icon}</span>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Leave a review comment (optional)"
              className="w-full h-20 px-3 py-2 bg-bg-primary border border-border rounded-md text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex justify-end gap-2 px-3 pb-3">
            <button
              onClick={() => { setOpen(false); setSelectedVerdict(null); setComment(""); }}
              className="px-3 py-1.5 text-sm rounded-md border border-border text-text-secondary hover:text-text-primary bg-transparent cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedVerdict || submitting}
              className="px-3 py-1.5 text-sm rounded-md bg-accent text-white border border-accent hover:bg-accent/90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
