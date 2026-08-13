import { NextRequest, NextResponse } from "next/server";
import { refreshPrices } from "@/lib/prices";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Zaciaga notowania (kurs, zmiana dzienna, momentum 1M/3M) dla calego uniwersum
 * i zapisuje do bazy (cache dla rankingu). POST — przycisk; GET — Vercel Cron.
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
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const summary = await refreshPrices();
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[/api/prices/refresh] error", e);
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
