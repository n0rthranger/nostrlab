"use client";

import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (url: string) => void;
  // Preview aspect ratio (Tailwind shorthand, e.g. "16/9", "1/1")
  aspect?: string;
  // Inline size hint shown inside the dropzone (after "click to browse")
  sizeHint?: string;
  // Helper caption shown below the dropzone when there's no error
  helperText?: string;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function BannerUploader({
  value, onChange,
  aspect = "16/9",
  sizeHint = "Any shape works · optimized to 1600 × 900",
  helperText = "Optional. Upload any crop and NostrLab will format it as a 16:9 event banner.",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [urlDraft, setUrlDraft] = useState("");

  const upload = useCallback(async (file: File) => {
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("Only image files are supported.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErr(`Image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Max ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      onChange(json.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const importUrl = useCallback(async () => {
    setErr(null);
    const url = urlDraft.trim();
    if (!/^https?:\/\//i.test(url)) {
      setErr("Enter an http(s) image URL.");
      return;
    }

    setUploading(true);
    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Image import failed");
      onChange(json.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }, [onChange, urlDraft]);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      upload(file);
      return;
    }
    // Fallback: image dragged from another browser tab — use the URL directly.
    const url =
      e.dataTransfer.getData("text/uri-list") ||
      e.dataTransfer.getData("text/plain");
    if (url && /^https?:\/\//i.test(url)) {
      onChange(url);
    }
  };

  const onSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  };

  // PREVIEW
  if (value) {
    return (
      <div className="space-y-2">
        <div className="relative group rounded-xl border border-border overflow-hidden bg-surface2">
          <div
            className="bg-cover bg-center"
            style={{ aspectRatio: aspect, backgroundImage: `url(${value})` }}
          />
          <div className="absolute inset-0 bg-fg/0 group-hover:bg-fg/40 transition-colors grid place-items-center opacity-0 group-hover:opacity-100">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="h-9 px-3.5 rounded-full bg-bg/95 text-fg text-sm font-medium shadow-md hover:bg-bg transition-colors"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => onChange("")}
                className="h-9 px-3.5 rounded-full bg-bg/95 text-danger text-sm font-medium shadow-md hover:bg-bg transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
        <div className="text-[11px] text-muted truncate font-mono">{value}</div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onSelect}
          className="hidden"
        />
      </div>
    );
  }

  // EMPTY — drop zone or URL input
  return (
    <div className="space-y-2">
      {mode === "upload" ? (
        <div
          onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          className={cn(
            "relative rounded-xl border-2 border-dashed transition-all cursor-pointer overflow-hidden",
            "p-8 grid place-items-center text-center min-h-[180px]",
            dragOver
              ? "border-accent bg-accentSoft/40 scale-[1.01]"
              : "border-border hover:border-subtle hover:bg-surface2/50",
            uploading && "pointer-events-none opacity-70"
          )}
        >
          <div className="space-y-2 max-w-xs">
            <div className="mx-auto w-10 h-10 rounded-full bg-surface2 grid place-items-center text-muted">
              {uploading ? (
                <span className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              )}
            </div>
            <div className="text-sm font-medium">
              {uploading ? "Uploading…" : dragOver ? "Drop to upload" : "Drag an image here"}
            </div>
            {!uploading && (
              <div className="text-xs text-muted leading-relaxed">
                or <span className="text-accent underline underline-offset-2">click to browse</span>
                <br />
                {sizeHint}
                <br />
                JPG, PNG, WebP, GIF · up to {MAX_IMAGE_BYTES / 1024 / 1024}MB
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={onSelect}
            className="hidden"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface2/40 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              placeholder="https://..."
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  importUrl();
                }
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={importUrl}
              disabled={uploading}
              className="h-10 shrink-0 rounded-full bg-fg px-4 text-sm font-medium text-bg transition-colors hover:bg-fg/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? "Importing..." : "Import"}
            </button>
          </div>
          <div className="mt-2 text-[11px] text-muted">
            The image will be fetched, cropped, and stored as a 16:9 banner.
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {err ? <div className="text-xs text-danger">{err}</div> : <span className="text-[11px] text-muted">{helperText}</span>}
        <button
          type="button"
          onClick={() => { setMode(mode === "upload" ? "url" : "upload"); setErr(null); }}
          className="text-xs text-muted hover:text-fg transition-colors shrink-0"
        >
          {mode === "upload" ? "Use a URL instead" : "Upload a file instead"}
        </button>
      </div>
    </div>
  );
}
