import { NextResponse } from "next/server";
import { computeRankings } from "@/lib/ranking";

export const dynamic = "force-dynamic";

/** Wewnetrzny ranking atrakcyjnosci spolek — liczony z sygnalow, bez AI. */
export async function GET() {
  try {
    const view = await computeRankings();
    return NextResponse.json(view);
  } catch (e) {
    console.error("[/api/ranking] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
