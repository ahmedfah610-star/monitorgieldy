import { NextResponse } from "next/server";
import { getForecastView } from "@/lib/forecast";

export const dynamic = "force-dynamic";

/** Prognoza przychodow MarketScope — trend firmy + branza + makro, bez AI. */
export async function GET() {
  try {
    const view = await getForecastView();
    return NextResponse.json(view);
  } catch (e) {
    console.error("[/api/forecast] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
