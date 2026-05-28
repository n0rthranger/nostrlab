"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { clientPublish } from "@/lib/nostr/client-pool";
import { buildCommunityList } from "@/lib/nostr/event-builder";
import { KIND_COMMUNITY } from "@/lib/nostr/kinds";
import type { CommunityDTO } from "@/types";

export function CommunityFollowButton({
  communityId,
  communitySlug,
  communityOwnerPubkey,
  initiallyFollowing,
  initialFollowerCount,
}: {
  communityId: string;
  communitySlug: string;
  communityOwnerPubkey: string;
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
      const currentList = await fetch(`/api/communities?follower=${encodeURIComponent(currentIdentity.pubkey)}`)
        .then((res) => (res.ok ? res.json() : { communities: [] }))
        .then((json) => (json.communities ?? []) as CommunityDTO[]);
      const targetCoordinate = `${KIND_COMMUNITY}:${communityOwnerPubkey}:${communitySlug}`;
      const communityCoordinates = new Set(
        currentList.map((community) => `${KIND_COMMUNITY}:${community.organizer.pubkey}:${community.slug}`)
      );
      if (following) communityCoordinates.delete(targetCoordinate);
      else communityCoordinates.add(targetCoordinate);

      const signed = await signEvent(buildCommunityList({
        pubkey: currentIdentity.pubkey,
        communityCoordinates: Array.from(communityCoordinates),
      }));
      const publishP = clientPublish(signed);
      const res = await fetch(`/api/communities/${communityId}/follow`, {
        method: following ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedCommunityListEvent: signed }),
      });
      await publishP.catch(() => ({ ok: 0, failed: 0 }));
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
