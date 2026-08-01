import { NextResponse } from "next/server";
import { getInsiderView } from "@/lib/insider";

export const dynamic = "force-dynamic";

/** Zwraca zapisane transakcje insiderow (art. 19 MAR) dla watchlisty. */
export async function GET() {
  try {
    const view = await getInsiderView();
    return NextResponse.json(view);
  } catch (e) {
    console.error("[/api/insider] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
