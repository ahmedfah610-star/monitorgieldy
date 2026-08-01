import { NextResponse } from "next/server";
import { getShortView } from "@/lib/knf";

export const dynamic = "force-dynamic";

/** Zwraca zapisane krotkie pozycje netto (rejestr KNF) dla watchlisty. */
export async function GET() {
  try {
    const view = await getShortView();
    return NextResponse.json(view);
  } catch (e) {
    console.error("[/api/short] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
