"use client";

import { useEffect, useState } from "react";

const BITCOIN_ADDRESS = "1G6bCnb536mvkWJWsFBP2keQ3r1zGd6F2";

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function DonateButton() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        await copyText(BITCOIN_ADDRESS);
        setCopied(true);
      }}
      className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-4 text-xs font-semibold text-fg transition hover:border-fg/30 hover:bg-surface2 active:scale-[0.98]"
      title={BITCOIN_ADDRESS}
      aria-live="polite"
    >
      {copied ? "Copied BTC address" : "Donate"}
    </button>
  );
}
