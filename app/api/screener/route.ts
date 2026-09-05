import { NextResponse } from "next/server";
import { getScreenerView } from "@/lib/screener";

export const dynamic = "force-dynamic";

/** Dane screenera GPW — cały katalog z metrykami + wynikiem rankingu. */
export async function GET() {
  try {
    const view = await getScreenerView();
    return NextResponse.json(view);
  } catch (e) {
    console.error("[/api/screener] error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
