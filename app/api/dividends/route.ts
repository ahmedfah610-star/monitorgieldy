import { NextResponse } from "next/server";
import { getDividendsView } from "@/lib/dividends";

export const dynamic = "force-dynamic";

/** Zwraca zapisane dywidendy dla watchlisty. */
export async function GET() {
  try {
    const view = await getDividendsView();
    return NextResponse.json(view);
  } catch (e) {
    console.error("[/api/dividends] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
