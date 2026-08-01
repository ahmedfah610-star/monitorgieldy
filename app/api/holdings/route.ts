import { NextResponse } from "next/server";
import { getHoldingsView } from "@/lib/holdings";

export const dynamic = "force-dynamic";

/** Zwraca zapisane zawiadomienia o znacznych pakietach (art. 69). */
export async function GET() {
  try {
    const view = await getHoldingsView();
    return NextResponse.json(view);
  } catch (e) {
    console.error("[/api/holdings] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
