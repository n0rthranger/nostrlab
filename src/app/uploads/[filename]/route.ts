import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPLOAD_RE = /^[a-f0-9]{32}\.(jpg|png|webp|gif)$/i;
const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function uploadPath(filename: string) {
  if (!UPLOAD_RE.test(filename)) return null;
  return path.join(process.cwd(), "public", "uploads", filename);
}

function contentType(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

export async function GET(_req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const filePath = uploadPath(filename);
  if (!filePath) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const file = await readFile(filePath);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(file.byteLength),
        "Content-Type": contentType(filename),
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function HEAD(_req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const filePath = uploadPath(filename);
  if (!filePath) return new NextResponse(null, { status: 404 });

  try {
    const info = await stat(filePath);
    return new NextResponse(null, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(info.size),
        "Content-Type": contentType(filename),
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
