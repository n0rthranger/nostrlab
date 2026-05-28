"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { buildCommunityPost, buildCommunityPostApproval, communityCoordinate } from "@/lib/nostr/event-builder";
import { clientPublish } from "@/lib/nostr/client-pool";
import { shortNpub } from "@/lib/utils";
import type { UserDTO } from "@/types";

interface CommunityPostDTO {
  id: string;
  nostrId: string;
  body: string;
  createdAt: string;
  approvedAt: string | null;
  user: UserDTO;
  approvalCount: number;
  rawEvent?: unknown;
}

export function CommunityPosts({
  communityId,
  communitySlug,
  communityOwnerPubkey,
  initialCanModerate,
}: {
  communityId: string;
  communitySlug: string;
  communityOwnerPubkey: string;
  initialCanModerate: boolean;
}) {
  const { identity, login, signEvent } = useNostr();
  const [posts, setPosts] = useState<CommunityPostDTO[]>([]);
  const [canModerate, setCanModerate] = useState(initialCanModerate);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/communities/${communityId}/posts`)
      .then((res) => (res.ok ? res.json() : { posts: [], canModerate: initialCanModerate }))
      .then((json) => {
        setPosts(json.posts ?? []);
        setCanModerate(!!json.canModerate);
      })
      .catch(() => {});
  }, [communityId, initialCanModerate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    let currentIdentity = identity;
    if (!currentIdentity) {
      try { currentIdentity = await login(); } catch (error) { setErr((error as Error).message); return; }
    }
    const content = body.trim();
    if (!content) return;
    setBusy(true);
    try {
      const coord = communityCoordinate(communityOwnerPubkey, communitySlug);
      const signedPostEvent = await signEvent(buildCommunityPost({
        pubkey: currentIdentity.pubkey,
        communityCoordinate: coord,
        communityOwnerPubkey,
        content,
      }));
      const publishP = clientPublish(signedPostEvent);
      const res = await fetch(`/api/communities/${communityId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedPostEvent }),
      });
      await publishP.catch(() => ({ ok: 0, failed: 0 }));
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not post.");
      setPosts((current) => [json.post, ...current.filter((post) => post.id !== json.post.id)]);
      setBody("");
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function approve(post: CommunityPostDTO) {
    if (!identity) {
      try { await login(); } catch (error) { setErr((error as Error).message); return; }
    }
    if (!identity) return;
    setBusy(true);
    setErr(null);
    try {
      const signedApprovalEvent = await signEvent(buildCommunityPostApproval({
        pubkey: identity.pubkey,
        communityCoordinate: communityCoordinate(communityOwnerPubkey, communitySlug),
        postId: post.nostrId,
        postAuthorPubkey: post.user.pubkey,
        rawPostEvent: post.rawEvent,
      }));
      const publishP = clientPublish(signedApprovalEvent);
      const res = await fetch(`/api/communities/${communityId}/posts/${post.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedApprovalEvent }),
      });
      await publishP.catch(() => ({ ok: 0, failed: 0 }));
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not approve post.");
      setPosts((current) => current.map((item) => item.id === post.id ? {
        ...item,
        approvedAt: new Date().toISOString(),
        approvalCount: item.approvalCount + 1,
      } : item));
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Community posts</h2>
        {canModerate && <span className="text-xs text-muted">Moderator approval enabled</span>}
      </div>

      <form onSubmit={submit} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Share an update with this community"
          maxLength={5000}
        />
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-danger">{err}</div>
          <Button type="submit" size="sm" loading={busy} disabled={busy || !body.trim()}>
            Post
          </Button>
        </div>
      </form>

      {posts.length === 0 ? (
        <div className="text-sm text-muted">No community posts yet.</div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <article key={post.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <Avatar src={post.user.picture} seed={post.user.pubkey} alt={post.user.npub} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {post.user.displayName ?? post.user.name ?? shortNpub(post.user.npub)}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-fg2">{post.body}</p>
                  <div className="mt-2 text-[11px] text-muted">
                    {post.approvedAt ? "Approved" : "Pending"} · {new Date(post.createdAt).toLocaleString()}
                  </div>
                </div>
                {canModerate && !post.approvedAt && (
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => approve(post)}>
                    Approve
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
