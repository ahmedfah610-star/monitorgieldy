import { NextRequest, NextResponse } from "next/server";
import { generateSectorAnalyses, getSectorAnalysisView } from "@/lib/sectorAnalysis";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET: kontekst sektorów + analizy AI z cache'u. POST: generuje analizy AI (Haiku). */
export async function GET() {
  try {
    const view = await getSectorAnalysisView();
    return NextResponse.json(view);
  } catch (e) {
    console.error("[/api/sector-analysis GET] error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json(
      { error: "Brak POSTGRES_URL — skonfiguruj Vercel Postgres i uruchom /api/init-db." },
      { status: 503 },
    );
  }
  try {
    const summary = await generateSectorAnalyses();
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[/api/sector-analysis POST] error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
