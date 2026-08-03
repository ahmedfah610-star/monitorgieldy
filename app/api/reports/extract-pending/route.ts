import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { extractPendingReports } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Wsadowa ekstrakcja "Wynikow r/r" — wyciaga liczby (AI) z raportow watchlisty
 * bez extracted_json (limit chroni tokeny/czas). Wlasny request => wlasny budzet
 * czasu (Hobby 60s). Wymaga ANTHROPIC_API_KEY.
 */
export async function POST() {
  if (!hasDb()) {
    return NextResponse.json(
      { error: "Brak POSTGRES_URL — ustaw baze i uruchom /api/init-db." },
      { status: 503 },
    );
  }
  try {
    const res = await extractPendingReports(6);
    return NextResponse.json(res);
  } catch (e) {
    console.error("[/api/reports/extract-pending] error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
