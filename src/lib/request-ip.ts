import type { NextRequest } from "next/server";

export function clientIp(req: Request | NextRequest): string {
  const headers = req.headers;
  if (process.env.TRUST_PROXY_HEADERS === "true") {
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    const real = headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  return "direct";
}
