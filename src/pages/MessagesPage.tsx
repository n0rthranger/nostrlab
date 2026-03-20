import { useEffect, useState, useRef } from "react";
import type { Event } from "nostr-tools";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  pool,
  DEFAULT_RELAYS,
  fetchProfiles,
  shortenKey,
  timeAgo,
  npubFromPubkey,
  pubkeyFromNpub,
} from "../lib/nostr";
import type { UserProfile } from "../types/nostr";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/Toast";
import { unwrapEvent as nip17Unwrap } from "nostr-tools/nip17";
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59";
import { signWith } from "../lib/nostr";

// NIP-17 uses kind 1059 (gift wrap) on the wire,
// the inner rumor is kind 14 (private direct message).
const GIFT_WRAP = 1059;
const DELETION = 5;
const DELETED_KEY = "nostrlab-deleted-dms";

interface DMMessage {
  id: string;
  /** The gift wrap event ID on relays (needed for deletion) */
  wrapId: string;
  from: string;
  /** The conversation partner (the "other" person, never self) */
  partner: string;
  content: string;
  createdAt: number;
  isMine: boolean;
}

interface Conversation {
  pubkey: string;
  lastMessage: string;
  lastTimestamp: number;
}

export default function MessagesPage() {
  const { recipientNpub } = useParams<{ recipientNpub?: string }>();
  const { pubkey, sk } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [newConversation, setNewConversation] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteConv, setConfirmDeleteConv] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const recipientPubkey = recipientNpub
    ? (() => { try { return pubkeyFromNpub(recipientNpub); } catch { return ""; } })()
    : "";

  // All messages stored in a ref so polling/subscription can merge without races
  const allMsgsRef = useRef<DMMessage[]>([]);
  const seenRef = useRef(new Set<string>());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(DELETED_KEY) || "[]")); }
    catch { return new Set(); }
  });
  const deletedRef = useRef(deletedIds);
  deletedRef.current = deletedIds;

  const tryUnwrap = (wrap: Event, myPk: string, mysk: Uint8Array, deleted: Set<string>): DMMessage | null => {
    try {
      if (deleted.has(wrap.id)) return null;
      const rumor = nip17Unwrap(wrap, mysk);
      if (rumor.kind !== 14) return null;
      if (seenRef.current.has(rumor.id)) return null;
      if (deleted.has(rumor.id)) return null;
      seenRef.current.add(rumor.id);

      const from = rumor.pubkey;
      const isMine = from === myPk;
      const pTags = rumor.tags.filter((t: string[]) => t[0] === "p").map((t: string[]) => t[1]);
      const partner = isMine
        ? (pTags.find((p: string) => p !== myPk) ?? pTags[0] ?? "")
        : from;

      if (!partner) return null;

      return {
        id: rumor.id,
        wrapId: wrap.id,
        from,
        partner,
        content: rumor.content,
        createdAt: rumor.created_at,
        isMine,
      };
    } catch {
      return null;
    }
  };

  const rebuildConversations = (msgs: DMMessage[]) => {
    const convMap = new Map<string, Conversation>();
    for (const msg of msgs) {
      const existing = convMap.get(msg.partner);
      if (!existing || msg.createdAt > existing.lastTimestamp) {
        convMap.set(msg.partner, {
          pubkey: msg.partner,
          lastMessage: msg.content.slice(0, 80),
          lastTimestamp: msg.createdAt,
        });
      }
    }
    setConversations([...convMap.values()].sort((a, b) => b.lastTimestamp - a.lastTimestamp));
  };

  const fetchAndMerge = async (myPk: string, mySk: Uint8Array, deleted: Set<string>) => {
    const wraps = await pool.querySync(DEFAULT_RELAYS, {
      kinds: [GIFT_WRAP],
      "#p": [myPk],
      limit: 500,
    });

    let added = false;
    for (const wrap of wraps) {
      const msg = tryUnwrap(wrap, myPk, mySk, deleted);
      if (msg) {
        allMsgsRef.current.push(msg);
        added = true;
      }
    }

    if (added) {
      allMsgsRef.current.sort((a, b) => a.createdAt - b.createdAt);
      setMessages([...allMsgsRef.current]);
      rebuildConversations(allMsgsRef.current);

      // Fetch any missing profiles
      const allPubkeys = [...new Set(allMsgsRef.current.flatMap((m) => [m.from, m.partner]))];
      if (allPubkeys.length > 0) {
        const profs = await fetchProfiles(allPubkeys);
        setProfiles((prev) => {
          const merged = new Map(prev);
          profs.forEach((v, k) => merged.set(k, v));
          return merged;
        });
      }
    }

    return added;
  };

  // Initial fetch + poll every 3 seconds for new messages
  useEffect(() => {
    if (!pubkey || !sk) return;
    let cancelled = false;
    allMsgsRef.current = [];
    seenRef.current.clear();

    const mySk = sk as Uint8Array;

    // Initial fetch
    fetchAndMerge(pubkey, mySk, deletedRef.current).then(() => {
      if (!cancelled) setLoading(false);
    });

    // Poll for new messages every 3 seconds
    const interval = setInterval(() => {
      if (!cancelled) fetchAndMerge(pubkey, mySk, deletedRef.current);
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pubkey, sk]);

  // Scroll to bottom when viewing a conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [recipientPubkey, messages]);

  const handleSend = async () => {
    if (!sk || !pubkey || !recipientPubkey || !newMessage.trim()) return;
    setSending(true);
    try {
      const content = newMessage.trim();

      // Create ONE rumor with the actual recipient in p-tags
      const rumor = createRumor({
        kind: 14,
        content,
        tags: [["p", recipientPubkey]],
      }, sk as Uint8Array);

      // Wrap the SAME rumor for the recipient and for ourselves
      const wrapForRecipient = createWrap(
        createSeal(rumor, sk as Uint8Array, recipientPubkey),
        recipientPubkey,
      );
      const wrapForSelf = createWrap(
        createSeal(rumor, sk as Uint8Array, pubkey),
        pubkey,
      );

      // Publish both wraps
      await Promise.allSettled([
        ...pool.publish(DEFAULT_RELAYS, wrapForRecipient),
        ...pool.publish(DEFAULT_RELAYS, wrapForSelf),
      ]);

      // Optimistically add to local state
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        wrapId: wrapForSelf.id,
        from: pubkey,
        partner: recipientPubkey,
        content,
        createdAt: Math.floor(Date.now() / 1000),
        isMine: true,
      }]);
      setNewMessage("");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to send message", "error");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (msg: DMMessage) => {
    // Remove from local state immediately
    const newDeleted = new Set(deletedIds);
    newDeleted.add(msg.id);
    newDeleted.add(msg.wrapId);
    setDeletedIds(newDeleted);
    localStorage.setItem(DELETED_KEY, JSON.stringify([...newDeleted]));

    allMsgsRef.current = allMsgsRef.current.filter((m) => m.id !== msg.id);
    setMessages([...allMsgsRef.current]);
    rebuildConversations(allMsgsRef.current);

    // Publish NIP-09 deletion event for the wrap if we have a secret key
    if (sk && msg.wrapId) {
      try {
        const deleteEvent = await signWith(sk, {
          kind: DELETION,
          content: "Deleted message",
          tags: [["e", msg.wrapId]],
          created_at: Math.floor(Date.now() / 1000),
        });
        await Promise.allSettled(pool.publish(DEFAULT_RELAYS, deleteEvent));
      } catch {
        // Deletion request is best-effort; local removal already happened
      }
    }

    toast("Message deleted", "info");
  };

  const handleDeleteConversation = (partnerPubkey: string) => {
    const convMsgs = allMsgsRef.current.filter((m) => m.partner === partnerPubkey);
    const newDeleted = new Set(deletedIds);
    for (const msg of convMsgs) {
      newDeleted.add(msg.id);
      newDeleted.add(msg.wrapId);
    }
    setDeletedIds(newDeleted);
    localStorage.setItem(DELETED_KEY, JSON.stringify([...newDeleted]));

    allMsgsRef.current = allMsgsRef.current.filter((m) => m.partner !== partnerPubkey);
    setMessages([...allMsgsRef.current]);
    rebuildConversations(allMsgsRef.current);
    setConfirmDeleteConv(null);
    toast("Conversation deleted", "info");
  };

  const handleStartConversation = () => {
    const input = newConversation.trim();
    if (!input) return;
    try {
      const npub = input.startsWith("npub") ? input : npubFromPubkey(input);
      navigate(`/messages/${npub}`);
    } catch {
      toast("Invalid npub or pubkey", "error");
    }
  };

  if (!pubkey) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-float-up">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Private Messages</h2>
        <p className="text-text-secondary text-sm mb-5">End-to-end encrypted with NIP-17</p>
        <Link to="/login" className="btn btn-primary no-underline hover:no-underline px-6 py-2.5 rounded-xl text-sm font-medium">Sign in to start messaging</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-float-up">
        <div className="relative w-12 h-12 mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
          <div className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-text-secondary">Decrypting messages...</p>
      </div>
    );
  }

  const activeMessages = recipientPubkey
    ? messages.filter((m) => m.partner === recipientPubkey)
    : [];

  const recipientProfile = recipientPubkey ? profiles.get(recipientPubkey) : null;
  const msgCount = activeMessages.length;

  return (
    <div className="max-w-5xl mx-auto animate-float-up">
      <div className="flex gap-0 border border-border rounded-2xl overflow-hidden shadow-lg" style={{ height: "calc(100vh - 180px)", minHeight: "500px" }}>

        {/* ─── Sidebar ─── */}
        <div className="w-80 shrink-0 border-r border-border bg-bg-primary flex flex-col">
          {/* Sidebar header */}
          <div className="p-4 border-b border-border">
            <h1 className="text-lg font-bold text-text-primary mb-3">Messages</h1>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                  <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
                </svg>
                <input
                  type="text"
                  value={newConversation}
                  onChange={(e) => setNewConversation(e.target.value)}
                  placeholder="Search or start new chat..."
                  className="w-full bg-bg-secondary border border-border rounded-xl pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                  onKeyDown={(e) => e.key === "Enter" && handleStartConversation()}
                />
              </div>
              <button
                onClick={handleStartConversation}
                className="w-9 h-9 flex items-center justify-center bg-accent text-white rounded-xl text-sm cursor-pointer hover:brightness-110 transition-all hover:scale-105 active:scale-95 border-0 shrink-0"
                title="Start new conversation"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 text-center animate-float-up">
                <div className="w-12 h-12 rounded-2xl bg-bg-tertiary flex items-center justify-center mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <p className="text-sm font-medium text-text-secondary">No conversations yet</p>
                <p className="text-xs text-text-muted mt-1">Enter an npub above to start chatting</p>
              </div>
            ) : (
              conversations.map((conv, i) => {
                const prof = profiles.get(conv.pubkey);
                const isActive = recipientPubkey === conv.pubkey;
                const isConfirmingConv = confirmDeleteConv === conv.pubkey;
                const unreadCount = 0; // placeholder for future unread tracking
                return (
                  <div
                    key={conv.pubkey}
                    className="animate-conv-slide"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <div className={`group/conv relative transition-colors duration-150 ${
                      isActive
                        ? "bg-accent/10 border-l-2 border-l-accent"
                        : "hover:bg-bg-tertiary/60 border-l-2 border-l-transparent"
                    }`}>
                      <Link
                        to={`/messages/${npubFromPubkey(conv.pubkey)}`}
                        className="block px-4 py-3 no-underline hover:no-underline"
                      >
                        <div className="flex items-center gap-3">
                          {/* Avatar with online-style ring */}
                          <div className="relative shrink-0">
                            {prof?.picture ? (
                              <img src={prof.picture} alt="" className={`w-10 h-10 rounded-full object-cover ring-2 transition-all ${isActive ? "ring-accent/30" : "ring-transparent"}`} referrerPolicy="no-referrer" />
                            ) : (
                              <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center text-accent text-sm font-bold ring-2 transition-all ${isActive ? "ring-accent/30" : "ring-transparent"}`}>
                                {(prof?.name ?? "?")[0].toUpperCase()}
                              </div>
                            )}
                            {unreadCount > 0 && (
                              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-bg-primary">{unreadCount}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-sm truncate ${isActive ? "font-semibold text-text-primary" : "font-medium text-text-primary"}`}>
                                {prof?.displayName || prof?.name || shortenKey(conv.pubkey)}
                              </span>
                              <span className="text-[10px] text-text-muted shrink-0">{timeAgo(conv.lastTimestamp)}</span>
                            </div>
                            <div className="text-xs text-text-muted truncate mt-0.5">{conv.lastMessage}</div>
                          </div>
                        </div>
                      </Link>

                      {/* Delete overlay */}
                      {isConfirmingConv ? (
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-bg-primary/90 backdrop-blur-sm z-10 px-3 animate-delete-confirm rounded-sm">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-red shrink-0">
                            <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/>
                          </svg>
                          <span className="text-xs font-medium text-text-primary">Delete chat?</span>
                          <button
                            onClick={() => handleDeleteConversation(conv.pubkey)}
                            className="px-3 py-1 text-xs font-semibold text-white bg-red rounded-lg cursor-pointer border-0 hover:brightness-110 transition-all active:scale-95"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmDeleteConv(null)}
                            className="px-3 py-1 text-xs font-medium text-text-secondary bg-bg-tertiary rounded-lg cursor-pointer border-0 hover:bg-border transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.preventDefault(); setConfirmDeleteConv(conv.pubkey); }}
                          className="absolute top-1/2 -translate-y-1/2 right-3 opacity-0 group-hover/conv:opacity-100 transition-all duration-200 p-2 rounded-lg text-text-muted hover:text-red hover:bg-red/10 bg-bg-primary/80 backdrop-blur-sm border border-border/50 cursor-pointer shadow-sm hover:shadow-md hover:scale-110 active:scale-95"
                          title="Delete conversation"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Sidebar footer */}
          <div className="px-4 py-2.5 border-t border-border bg-bg-secondary/50">
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>End-to-end encrypted (NIP-17)</span>
            </div>
          </div>
        </div>

        {/* ─── Chat area ─── */}
        <div className="flex-1 flex flex-col bg-bg-secondary">
          {recipientPubkey ? (
            <>
              {/* Chat header */}
              <div className="px-5 py-3 border-b border-border bg-bg-primary/80 backdrop-blur-sm flex items-center gap-3">
                <div className="relative">
                  {recipientProfile?.picture ? (
                    <img src={recipientProfile.picture} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-border" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center text-accent text-sm font-bold ring-2 ring-border">
                      {(recipientProfile?.name ?? shortenKey(recipientPubkey))[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-text-primary truncate">
                    {recipientProfile?.displayName || recipientProfile?.name || shortenKey(recipientPubkey)}
                  </div>
                  <div className="text-[11px] text-text-muted truncate">
                    {recipientProfile?.nip05 || shortenKey(recipientPubkey)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] text-green bg-green/10 px-2 py-1 rounded-full font-medium">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-green">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    Encrypted
                  </span>
                  <Link
                    to={`/user/${recipientNpub}`}
                    className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary no-underline transition-colors"
                    title="View profile"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
                    </svg>
                  </Link>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {activeMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full animate-float-up">
                    <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
                        <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-text-primary mb-1">Start the conversation</p>
                    <p className="text-xs text-text-muted">Messages are end-to-end encrypted</p>
                  </div>
                ) : (
                  <>
                    {/* Date separator for context */}
                    <div className="flex items-center gap-3 py-2 animate-fadeIn">
                      <div className="flex-1 h-px bg-border/50" />
                      <span className="text-[10px] font-medium text-text-muted bg-bg-secondary px-3 py-1 rounded-full border border-border/50">{msgCount} message{msgCount !== 1 ? "s" : ""}</span>
                      <div className="flex-1 h-px bg-border/50" />
                    </div>

                    {activeMessages.map((msg, i) => {
                      const senderProfile = msg.isMine
                        ? profiles.get(pubkey)
                        : recipientProfile;
                      const senderName = senderProfile?.displayName || senderProfile?.name || shortenKey(msg.from);
                      const isConfirming = confirmDeleteId === msg.id;
                      const showAvatar = i === 0 || activeMessages[i - 1].isMine !== msg.isMine;
                      return (
                        <div
                          key={msg.id}
                          className={`group/msg flex items-end gap-2.5 ${msg.isMine ? "flex-row-reverse" : ""} ${msg.isMine ? "animate-msg-right" : "animate-msg-left"}`}
                          style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
                        >
                          {/* Avatar — only show when sender changes */}
                          {showAvatar ? (
                            senderProfile?.picture ? (
                              <img
                                src={senderProfile.picture}
                                alt=""
                                className="w-8 h-8 rounded-full object-cover shrink-0 ring-2 ring-bg-secondary transition-transform hover:scale-110"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center text-[11px] text-accent font-bold shrink-0 ring-2 ring-bg-secondary transition-transform hover:scale-110">
                                {senderName[0].toUpperCase()}
                              </div>
                            )
                          ) : (
                            <div className="w-8 shrink-0" />
                          )}

                          {/* Bubble + actions */}
                          <div className={`flex items-center gap-1.5 max-w-[70%] ${msg.isMine ? "flex-row-reverse" : ""}`}>
                            {/* Message bubble */}
                            <div className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm transition-shadow hover:shadow-md ${
                              msg.isMine
                                ? "bg-gradient-to-br from-accent to-accent/90 text-white rounded-br-md"
                                : "bg-bg-primary text-text-primary rounded-bl-md border border-border/50"
                            }`}>
                              {showAvatar && (
                                <div className={`text-[10px] font-semibold mb-1 ${msg.isMine ? "text-white/70" : "text-accent"}`}>
                                  {senderName}
                                </div>
                              )}
                              <div className="leading-relaxed">{msg.content}</div>
                              <div className={`text-[10px] mt-1.5 flex items-center gap-1 ${msg.isMine ? "text-white/50" : "text-text-muted"}`}>
                                {timeAgo(msg.createdAt)}
                                {msg.isMine && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/40">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                )}
                              </div>
                            </div>

                            {/* Delete action — floats beside the bubble */}
                            <div className={`shrink-0 ${isConfirming ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100"} transition-all duration-200`}>
                              {isConfirming ? (
                                <div className="flex items-center gap-1 bg-bg-primary border border-border rounded-xl px-2.5 py-1.5 shadow-lg animate-delete-confirm">
                                  <button
                                    onClick={() => { handleDelete(msg); setConfirmDeleteId(null); }}
                                    className="p-1.5 rounded-lg text-white bg-red cursor-pointer border-0 hover:brightness-110 transition-all active:scale-90"
                                    title="Confirm delete"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/>
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="p-1.5 rounded-lg text-text-muted bg-bg-tertiary cursor-pointer border-0 hover:bg-border transition-colors active:scale-90"
                                    title="Cancel"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(msg.id)}
                                  className="p-1.5 rounded-lg text-text-muted/50 hover:text-red hover:bg-red/10 bg-transparent border-0 cursor-pointer transition-all duration-200 hover:scale-110 active:scale-90"
                                  title="Delete message"
                                >
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="px-5 py-3 border-t border-border bg-bg-primary/80 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Write a message..."
                      className="w-full bg-bg-secondary border border-border rounded-2xl pl-4 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    />
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={sending || !newMessage.trim()}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl text-white border-0 cursor-pointer transition-all duration-200 ${
                      newMessage.trim()
                        ? "bg-accent hover:brightness-110 hover:scale-105 active:scale-95 shadow-md shadow-accent/20"
                        : "bg-bg-tertiary text-text-muted cursor-not-allowed"
                    }`}
                  >
                    {sending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="translate-x-px">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-text-muted/60">
                  <kbd className="px-1 py-0.5 bg-bg-tertiary border border-border/50 rounded text-[9px]">Enter</kbd>
                  <span>to send</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full animate-float-up">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent/10 to-accent/5 flex items-center justify-center mb-5">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-accent">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-text-primary mb-1">Your Messages</h2>
              <p className="text-sm text-text-muted text-center max-w-xs">Select a conversation from the sidebar or start a new one to begin messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
