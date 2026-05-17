import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import { writeFile, mkdir, stat } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { nip19 } from "nostr-tools";
import { finalizeEvent } from "nostr-tools/pure";
import sharp from "sharp";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

// POST /api/uploads — accepts a multipart `file` field, validates it as an
// image, converts event banners to a fixed 16:9 WebP, content-hashes the
// optimized bytes, stores them through the configured upload backend, and
// returns the public URL. Hashing dedupes identical optimized files automatically.

const MAX_BYTES = 12 * 1024 * 1024; // originals are optimized before storage
const BANNER_WIDTH = 1600;
const BANNER_HEIGHT = 900;
const MAX_INPUT_PIXELS = 48_000_000;
const OUTPUT_TYPE = "image/webp";
const OUTPUT_EXT = "webp";
const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REMOTE_REDIRECTS = 3;

class UploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type UploadBackend = "local" | "s3" | "blossom";

function uploadBackend(): UploadBackend {
  const configured = process.env.UPLOAD_BACKEND?.trim().toLowerCase();
  if (configured === "local" || configured === "s3" || configured === "blossom") return configured;
  return process.env.OBJECT_STORAGE_BUCKET ? "s3" : "local";
}

function detectImage(buf: Buffer): { type: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { type: "image/jpeg", ext: "jpg" };
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { type: "image/png", ext: "png" };
  }
  const header = buf.subarray(0, 12).toString("ascii");
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) {
    return { type: "image/gif", ext: "gif" };
  }
  if (buf.length >= 12 && header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") {
    return { type: "image/webp", ext: "webp" };
  }
  return null;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }
  return false;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function assertPublicImageUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UploadError("Enter a valid image URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UploadError("Image URL must start with http:// or https://.");
  }
  if (url.username || url.password) {
    throw new UploadError("Image URL cannot include credentials.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new UploadError("Image URL must use a standard web port.");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UploadError("Local image URLs cannot be imported.");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new UploadError("Image URL must resolve to a public address.");
  }

  return url;
}

async function readCappedBody(res: Response): Promise<Buffer> {
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BYTES) {
    throw new UploadError(`Image is ${(contentLength / 1024 / 1024).toFixed(1)}MB. Max ${MAX_BYTES / 1024 / 1024}MB.`, 413);
  }
  if (!res.body) throw new UploadError("Image URL did not return a readable body.", 502);

  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BYTES) {
      throw new UploadError(`Image is larger than ${MAX_BYTES / 1024 / 1024}MB.`, 413);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function fetchRemoteImage(rawUrl: string, redirectCount = 0): Promise<{ buf: Buffer; declaredType: string | null }> {
  const url = await assertPublicImageUrl(rawUrl);
  const res = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: "image/jpeg,image/png,image/webp,image/gif,*/*;q=0.1",
      "User-Agent": "NostrLab image importer",
    },
  });

  if (REDIRECT_STATUSES.has(res.status)) {
    const location = res.headers.get("location");
    if (!location) throw new UploadError("Image URL redirected without a location.", 502);
    if (redirectCount >= MAX_REMOTE_REDIRECTS) throw new UploadError("Image URL redirected too many times.", 502);
    return fetchRemoteImage(new URL(location, url).toString(), redirectCount + 1);
  }

  if (!res.ok) {
    throw new UploadError(`Image URL returned HTTP ${res.status}.`, 502);
  }

  const declaredType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? null;
  if (declaredType && !ALLOWED.has(declaredType) && declaredType !== "application/octet-stream") {
    throw new UploadError("Image URL must return a JPG, PNG, WebP, or GIF image.", 415);
  }

  return { buf: await readCappedBody(res), declaredType };
}

async function optimizeBannerImage(buf: Buffer) {
  const optimized = await sharp(buf, { pages: 1, animated: false, limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(BANNER_WIDTH, BANNER_HEIGHT, {
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .webp({ quality: 84, effort: 4 })
    .toBuffer();

  return {
    buf: optimized,
    type: OUTPUT_TYPE,
    ext: OUTPUT_EXT,
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
  };
}

function objectStorageConfig() {
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  if (!bucket) return null;
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("Object storage is partially configured.");
  }
  const endpointUrl = endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;
  return {
    bucket,
    endpointUrl,
    region: process.env.OBJECT_STORAGE_REGION ?? "fsn1",
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: process.env.OBJECT_STORAGE_PUBLIC_BASE_URL,
  };
}

function blossomConfig() {
  const rawUrl = process.env.BLOSSOM_SERVER_URL?.trim() || "https://blossom.nostr.build";
  const serverUrl = new URL(rawUrl);
  if (serverUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("BLOSSOM_SERVER_URL must use https in production.");
  }
  const signingNsec = process.env.BLOSSOM_SIGNING_NSEC?.trim() || process.env.NOSTRLAB_APP_NSEC?.trim();
  if (!signingNsec) throw new Error("BLOSSOM_SIGNING_NSEC or NOSTRLAB_APP_NSEC is required.");
  const decoded = nip19.decode(signingNsec);
  if (decoded.type !== "nsec") throw new Error("Blossom signing key must be an nsec.");
  return {
    serverUrl,
    secretKey: decoded.data as Uint8Array,
  };
}

function blossomAuth(secretKey: Uint8Array, serverUrl: URL, sha256: string) {
  const now = Math.floor(Date.now() / 1000);
  const signed = finalizeEvent({
    kind: 24242,
    created_at: now,
    tags: [
      ["t", "upload"],
      ["expiration", String(now + 5 * 60)],
      ["server", serverUrl.hostname.toLowerCase()],
      ["x", sha256],
    ],
    content: "Upload NostrLab event media",
  }, secretKey);
  return Buffer.from(JSON.stringify(signed)).toString("base64url");
}

async function storeBlossom(sha256: string, buf: Buffer, type: string) {
  const { serverUrl, secretKey } = blossomConfig();
  const uploadUrl = new URL("/upload", serverUrl);
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Nostr ${blossomAuth(secretKey, serverUrl, sha256)}`,
      "Content-Length": String(buf.byteLength),
      "Content-Type": type,
      "X-SHA-256": sha256,
    },
    body: new Uint8Array(buf),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = res.headers.get("x-reason") ?? (json && typeof json === "object" && "message" in json ? String(json.message) : null);
    throw new Error(reason ?? `Blossom upload failed with ${res.status}`);
  }
  const url = json && typeof json === "object" && "url" in json ? String(json.url) : "";
  if (!/^https?:\/\//i.test(url)) throw new Error("Blossom upload response did not include a public URL.");
  return { url, deduped: res.status === 200 };
}

async function storeS3(filename: string, buf: Buffer, type: string): Promise<{ url: string; deduped: boolean }> {
  const objectStorage = objectStorageConfig();
  if (!objectStorage) throw new Error("Object storage is not configured.");
  const key = `uploads/${filename}`;
  const s3 = new S3Client({
    region: objectStorage.region,
    endpoint: objectStorage.endpointUrl,
    credentials: {
      accessKeyId: objectStorage.accessKeyId,
      secretAccessKey: objectStorage.secretAccessKey,
    },
  });
  await s3.send(new PutObjectCommand({
    Bucket: objectStorage.bucket,
    Key: key,
    Body: buf,
    ContentType: type,
    CacheControl: "public, max-age=31536000, immutable",
  }));
  const base = objectStorage.publicBaseUrl?.replace(/\/$/, "")
    ?? `https://${objectStorage.bucket}.${new URL(objectStorage.endpointUrl).host}`;
  return { url: `${base}/${key}`, deduped: false };
}

async function storeLocal(filename: string, buf: Buffer): Promise<{ url: string; deduped: boolean }> {
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const target = path.join(uploadsDir, filename);
  const exists = await stat(target).then(() => true).catch(() => false);
  if (!exists) {
    await writeFile(target, buf);
  }
  return { url: `/uploads/${filename}`, deduped: exists };
}

async function storeUpload(sha256: string, filename: string, buf: Buffer, type: string): Promise<{ url: string; deduped: boolean }> {
  switch (uploadBackend()) {
    case "blossom":
      return storeBlossom(sha256, buf, type);
    case "s3":
      return storeS3(filename, buf, type);
    case "local":
      return storeLocal(filename, buf);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`upload:${ip}`, { capacity: 8, refillPerSec: 1 / 6 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  let buf: Buffer;
  let declaredType: string | null;
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Bad JSON body." }, { status: 400 }); }
    const url = body && typeof body === "object" && "url" in body ? String(body.url).trim() : "";
    if (!url) return NextResponse.json({ error: "No image URL provided." }, { status: 400 });
    try {
      const remote = await fetchRemoteImage(url);
      buf = remote.buf;
      declaredType = remote.declaredType;
    } catch (e) {
      const status = e instanceof UploadError ? e.status : 502;
      const message = e instanceof Error ? e.message : "Image URL could not be imported.";
      return NextResponse.json({ error: message }, { status });
    }
  } else {
    let formData: FormData;
    try { formData = await req.formData(); }
    catch { return NextResponse.json({ error: "Bad form data." }, { status: 400 }); }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPG, PNG, WebP, or GIF images are allowed." },
        { status: 415 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Max ${MAX_BYTES / 1024 / 1024}MB.` },
        { status: 413 }
      );
    }

    buf = Buffer.from(await file.arrayBuffer());
    declaredType = file.type;
  }

  const detected = detectImage(buf);
  if (!detected || (declaredType && ALLOWED.has(declaredType) && detected.type !== declaredType)) {
    return NextResponse.json(
      { error: "File contents do not match the declared image type." },
      { status: 415 }
    );
  }

  let optimized;
  try {
    optimized = await optimizeBannerImage(buf);
  } catch (e) {
    console.error("[uploads] optimization failed", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Image could not be optimized. Try a different JPG, PNG, WebP, or GIF." },
      { status: 422 }
    );
  }

  const hash = crypto.createHash("sha256").update(optimized.buf).digest("hex");
  const filename = `${hash.slice(0, 32)}.${optimized.ext}`;

  let stored;
  try {
    stored = await storeUpload(hash, filename, optimized.buf, optimized.type);
  } catch (e) {
    console.error("[uploads] storage failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Upload storage failed." }, { status: 502 });
  }

  return NextResponse.json({
    url: stored.url,
    bytes: optimized.buf.length,
    originalBytes: buf.length,
    originalType: detected.type,
    type: optimized.type,
    width: optimized.width,
    height: optimized.height,
    deduped: stored.deduped,
    optimized: true,
  });
}
