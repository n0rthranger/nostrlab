"use client";

import { useMemo, useState } from "react";
import { useNostr } from "@/hooks/useNostr";
import { Badge } from "@/components/ui/Badge";

interface Props {
  attendeePubkey: string;
  organizerPubkey: string;
  privatePayload: string;
}

interface StoredPrivatePayload {
  encryptedPayload?: {
    method: "nip04";
    recipientPubkey: string;
    ciphertext: string;
  } | null;
}

interface DecryptedPayload {
  note?: string;
  status?: string;
  createdAt?: string;
}

function parsePayload(raw: string): StoredPrivatePayload | null {
  try {
    return JSON.parse(raw) as StoredPrivatePayload;
  } catch {
    return null;
  }
}

function parseDecrypted(raw: string): DecryptedPayload {
  try {
    return JSON.parse(raw) as DecryptedPayload;
  } catch {
    return { note: raw };
  }
}

export function PrivateRsvpPayload({ attendeePubkey, organizerPubkey, privatePayload }: Props) {
  const { identity, signer } = useNostr();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [decrypted, setDecrypted] = useState<DecryptedPayload | null>(null);
  const stored = useMemo(() => parsePayload(privatePayload), [privatePayload]);
  const encrypted = stored?.encryptedPayload;
  const canDecrypt =
    !!encrypted &&
    encrypted.method === "nip04" &&
    identity?.pubkey?.toLowerCase() === organizerPubkey.toLowerCase() &&
    !!signer?.nip04;

  async function decrypt() {
    if (!encrypted || !signer?.nip04) return;
    setBusy(true);
    setErr(null);
    try {
      const plaintext = await signer.nip04.decrypt(attendeePubkey, encrypted.ciphertext);
      setDecrypted(parseDecrypted(plaintext));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!encrypted) return <Badge tone="muted" size="sm">private</Badge>;

  return (
    <span className="inline-flex flex-col items-end gap-1 text-right">
      <span className="inline-flex items-center gap-2">
        <Badge tone="muted" size="sm">encrypted</Badge>
        {canDecrypt && !decrypted && (
          <button
            type="button"
            onClick={decrypt}
            disabled={busy}
            className="h-6 rounded-full border border-border px-2 text-[11px] font-medium text-muted hover:text-fg disabled:opacity-60"
          >
            {busy ? "Decrypting" : "Decrypt"}
          </button>
        )}
      </span>
      {decrypted && (
        <span className="max-w-[220px] rounded-lg border border-border bg-surface2 px-2 py-1 text-[11px] text-fg">
          {decrypted.note || decrypted.status || decrypted.createdAt || "No private note"}
        </span>
      )}
      {err && <span className="max-w-[220px] text-[11px] text-danger">{err}</span>}
    </span>
  );
}
