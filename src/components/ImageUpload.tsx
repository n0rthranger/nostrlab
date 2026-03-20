import { useState, useRef, useCallback } from "react";
import { uploadImage } from "../lib/nostr";
import { useAuth } from "../hooks/useAuth";

interface Props {
  value: string;
  onChange: (url: string) => void;
  label: string;
  preview?: "avatar" | "banner";
  accept?: string;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export default function ImageUpload({ value, onChange, label, preview = "avatar", accept = "image/*" }: Props) {
  const { signer } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("File too large (max 25MB)");
      return;
    }
    if (!signer) {
      setError("Sign in to upload images");
      return;
    }

    setError("");
    setUploading(true);
    setProgress("Uploading to nostr.build...");
    setImgError(false);

    try {
      const url = await uploadImage(signer, file);
      onChange(url);
      setProgress("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress("");
    } finally {
      setUploading(false);
    }
  }, [onChange, signer]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be selected again
    e.target.value = "";
  }, [handleFile]);

  const handleRemove = () => {
    onChange("");
    setImgError(false);
    setError("");
  };

  const hasPreview = value && !imgError;

  return (
    <div>
      <label className="text-sm text-text-primary block mb-1.5 font-medium">{label}</label>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          dragOver
            ? "border-accent bg-accent/5"
            : "border-border hover:border-text-muted"
        } ${uploading ? "pointer-events-none opacity-70" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
        />

        {hasPreview ? (
          // Show preview
          <div className={`relative ${preview === "banner" ? "h-32" : "p-4 flex items-center gap-4"}`}>
            {preview === "banner" ? (
              <img
                key={value}
                src={value}
                alt=""
                className="w-full h-full object-cover rounded-md"
                onError={() => setImgError(true)}
                referrerPolicy="no-referrer"
              />
            ) : (
              <>
                <img
                  key={value}
                  src={value}
                  alt=""
                  className="w-20 h-20 rounded-full object-cover border-2 border-border shrink-0"
                  onError={() => setImgError(true)}
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary font-medium mb-1">Image uploaded</p>
                  <p className="text-xs text-text-muted truncate">{value}</p>
                  <p className="text-xs text-text-muted mt-1">Click or drag to replace</p>
                </div>
              </>
            )}

            {/* Remove button */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemove(); }}
              className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-bg-primary/80 border border-border text-text-muted hover:text-red hover:border-red cursor-pointer text-xs"
              data-tooltip="Remove image"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>

            {preview === "banner" && (
              <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-medium">Click or drag to replace</span>
              </div>
            )}
          </div>
        ) : (
          // Empty state
          <div className={`flex flex-col items-center justify-center text-center ${preview === "banner" ? "py-8" : "py-6"}`}>
            {uploading ? (
              <>
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-sm text-text-secondary">{progress}</p>
              </>
            ) : (
              <>
                <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="text-text-muted mb-2">
                  <path d="M3.75 1.5a.25.25 0 0 0-.25.25v11.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V6H9.75A1.75 1.75 0 0 1 8 4.25V1.5ZM10 4.25v-2.5l3.5 3.25H10.5a.25.25 0 0 1-.25-.25h-.25ZM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25Z" />
                  <path d="M6.25 7.5a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5ZM6.25 9.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" />
                </svg>
                <p className="text-sm text-text-primary font-medium">
                  Drag and drop an image, or <span className="text-accent">browse</span>
                </p>
                <p className="text-xs text-text-muted mt-1">PNG, JPG, GIF, WebP up to 25MB</p>
                <p className="text-xs text-text-muted">Uploaded to nostr.build (free, decentralized)</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-2 text-sm text-red flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z" />
          </svg>
          {error}
        </div>
      )}

      {/* URL fallback input */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-text-muted shrink-0">or paste URL:</span>
        <input
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setImgError(false); setError(""); }}
          placeholder="https://example.com/image.jpg"
          className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}
