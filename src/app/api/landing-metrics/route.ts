import { NextResponse } from "next/server";
import { getLandingMetrics } from "@/lib/landing-metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const metrics = await getLandingMetrics();
  return NextResponse.json(metrics, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
