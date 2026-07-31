import { NextRequest, NextResponse } from "next/server";
import { refreshRecommendations } from "@/lib/recommendations";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Pobiera i zapisuje rekomendacje. Wywolywane:
 *  - recznie przyciskiem "Odswiez rekomendacje" (POST),
 *  - przez Vercel Cron raz dziennie (GET).
 *
 * Jesli ustawiono CRON_SECRET, GET wymaga naglowka Authorization: Bearer <secret>
 * (Vercel Cron dostarcza go automatycznie). POST z UI dziala bez sekretu.
 */
async function run(req: NextRequest, requireSecret: boolean) {
  if (!hasDb()) {
    return NextResponse.json(
      { error: "Brak POSTGRES_URL — skonfiguruj Vercel Postgres i uruchom /api/init-db." },
      { status: 503 },
    );
  }

  const secret = process.env.CRON_SECRET;
  if (requireSecret && secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const summary = await refreshRecommendations();
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[/api/recommendations/refresh] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return run(req, false);
}

export async function GET(req: NextRequest) {
  return run(req, true);
}
