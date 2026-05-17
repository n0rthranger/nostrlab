"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useNostr } from "@/hooks/useNostr";
import { hashAuthPayload } from "@/lib/auth-client";

interface Props {
  eventId: string;
  organizerPubkey: string;
  cohostPubkeys: string[];
}

interface ScanResult {
  ticketId: string;
  ok: boolean;
  message: string;
}

export function CheckInScanner({ eventId, organizerPubkey, cohostPubkeys }: Props) {
  const { identity, login, signEvent, hasSigner } = useNostr();
  const [raw, setRaw] = useState("");
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const isAuthorized = identity
    && (identity.pubkey === organizerPubkey || cohostPubkeys.includes(identity.pubkey));

  async function checkIn(input: string) {
    setErr(null);
    let currentIdentity = identity;
    if (!currentIdentity) { try { currentIdentity = await login(); } catch (e) { setErr((e as Error).message); return; } }
    if (!(currentIdentity.pubkey === organizerPubkey || cohostPubkeys.includes(currentIdentity.pubkey))) {
      setErr("This npub isn't an organizer or co-host.");
      return;
    }

    let ticketId: string | null = null;
    let secret: string | null = null;
    let ticketProof: unknown = null;
    let paymentPreimage: string | null = null;
    try {
      const parsed = JSON.parse(input);
      if (typeof parsed === "object" && parsed) {
        const value = parsed as Record<string, unknown>;
        if (value.type === "nostrlab.ticket.v1" && value.ticketId && value.secret) {
          ticketId = String(value.ticketId);
          secret = String(value.secret);
          ticketProof = value.proof ?? null;
          const payment = typeof value.payment === "object" && value.payment
            ? value.payment as Record<string, unknown>
            : null;
          paymentPreimage = typeof payment?.preimage === "string" ? payment.preimage : null;
        } else if (value.t && value.s) {
          ticketId = String(value.t);
          secret = String(value.s);
        }
      }
    } catch { /* not json */ }
    if (!ticketId && input.includes(":")) {
      const [t, s] = input.split(":"); ticketId = t; secret = s;
    }
    if (!ticketId || !secret) { setErr("Couldn't parse ticket payload."); return; }

    setBusy(true);
    try {
      const payload = { eventId, ticketId, ticketSecret: secret };
      const payloadHash = await hashAuthPayload(payload);
      const signed = await signEvent({
        pubkey: currentIdentity.pubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["action", "checkin"],
          ["event_id", eventId],
          ["t", ticketId],
          ["payload_hash", payloadHash],
        ],
      });
      const res = await fetch(`/api/tickets/${ticketId}/check-in`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketSecret: secret,
          ticketProof,
          paymentPreimage,
          signedAuthEvent: signed,
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setHistory((h) => [{ ticketId: ticketId!, ok: true, message: "Admitted" }, ...h]);
      } else if (json.alreadyCheckedIn) {
        setHistory((h) => [{ ticketId: ticketId!, ok: false, message: "Already in" }, ...h]);
      } else {
        setHistory((h) => [{ ticketId: ticketId!, ok: false, message: json.error ?? "Failed" }, ...h]);
      }
      setRaw("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function startCamera() {
    setErr(null);
    const Detector = (window as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => { detect(video: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    if (!Detector) {
      setErr("Camera QR scanning is not available in this browser. Paste the ticket payload instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ["qr_code"] });
      const scan = async () => {
        const currentVideo = videoRef.current;
        if (!currentVideo || !streamRef.current) return;
        try {
          const codes = await detector.detect(currentVideo);
          const value = codes.find((code) => code.rawValue)?.rawValue;
          if (value) {
            stopCamera();
            await checkIn(value);
            return;
          }
        } catch {
          // Keep scanning; some frames fail while autofocus is settling.
        }
        rafRef.current = requestAnimationFrame(scan);
      };
      rafRef.current = requestAnimationFrame(scan);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Camera permission failed.");
      stopCamera();
    }
  }

  useEffect(() => () => stopCamera(), []);

  if (!hasSigner && !identity) {
    return <Card><CardBody className="text-sm text-muted">Install Alby or nos2x to authenticate as organizer.</CardBody></Card>;
  }
  if (!identity) return <Button onClick={() => login().catch(() => {})}>Sign in to scan</Button>;
  if (!isAuthorized) return <Card><CardBody className="text-sm text-danger">Signed-in npub isn't an organizer or co-host of this event.</CardBody></Card>;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div>
            <div className="font-semibold text-base">Door scanner</div>
            <p className="text-sm text-muted mt-0.5">
              Scan a ticket QR or paste the payload below.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className={cameraOn ? "block aspect-video w-full object-cover" : "hidden"}
            />
            {!cameraOn && (
              <div className="grid aspect-video place-items-center text-sm text-white/70">
                Camera is off
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={cameraOn ? stopCamera : startCamera}>
              {cameraOn ? "Stop camera" : "Scan with camera"}
            </Button>
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder='{"t":"ck1...","s":"abcd..."}'
            rows={3}
            className="!font-mono !text-xs"
          />
          <div className="flex items-center justify-between">
            {err ? <div className="text-xs text-danger">{err}</div> : <span />}
            <Button onClick={() => checkIn(raw.trim())} disabled={busy || !raw.trim()} loading={busy}>
              Admit
            </Button>
          </div>
        </CardBody>
      </Card>

      {history.length > 0 && (
        <Card>
          <ul className="divide-y divide-border">
            {history.map((h, i) => (
              <li key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="font-mono text-xs truncate text-muted">{h.ticketId}</span>
                <Badge tone={h.ok ? "success" : "danger"}>{h.message}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
