"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { hashAuthPayload } from "@/lib/auth-client";

export function CommunityFollowButton({
  communityId,
  initiallyFollowing,
  initialFollowerCount,
}: {
  communityId: string;
  initiallyFollowing: boolean;
  initialFollowerCount: number;
}) {
  const { identity, login, signEvent, hasSigner } = useNostr();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [count, setCount] = useState(initialFollowerCount);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setFollowing(initiallyFollowing);
    setCount(initialFollowerCount);
  }, [initiallyFollowing, initialFollowerCount]);

  async function toggle() {
    setErr(null);
    let currentIdentity = identity;
    if (!currentIdentity) {
      try { currentIdentity = await login(); } catch (e) { setErr((e as Error).message); return; }
    }
    setBusy(true);
    try {
      const action = following ? "community.unfollow" : "community.follow";
      const payload = { communityId };
      const payloadHash = await hashAuthPayload(payload);
      const signed = await signEvent({
        pubkey: currentIdentity.pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["action", action],
          ["community_id", communityId],
          ["payload_hash", payloadHash],
        ],
      });
      const res = await fetch(`/api/communities/${communityId}/follow`, {
        method: following ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedAuthEvent: signed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not update follow.");
      setFollowing(json.following);
      setCount(json.followerCount);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button onClick={toggle} loading={busy} disabled={busy || (!hasSigner && !identity)} size="sm">
        {following ? "Following" : "Follow"}
      </Button>
      <div className="text-xs text-muted">{count} following</div>
      {err && <div className="text-xs text-danger">{err}</div>}
    </div>
  );
}
