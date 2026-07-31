import { NextResponse } from "next/server";
import { getRecommendationsView } from "@/lib/recommendations";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const view = await getRecommendationsView();
    return NextResponse.json({ ...view, usingDb: hasDb() });
  } catch (e) {
    console.error("[/api/recommendations] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
