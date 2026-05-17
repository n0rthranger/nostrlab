import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "nostrlab",
      release: process.env.NOSTRLAB_RELEASE ?? null,
      runtimeRole: process.env.NOSTRLAB_RUNTIME_ROLE ?? null,
      ts: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
