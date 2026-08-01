import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { getMacroView, refreshMacro } from "@/lib/macro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET — zapisana koniunktura makro PL/US. */
export async function GET() {
  try {
    const view = await getMacroView();
    return NextResponse.json(view);
  } catch (e) {
    console.error("[/api/macro GET] error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}

/** POST — pobiera i zapisuje makro (World Bank + NBP). GET z cronem robi refresh-all. */
export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json(
      { error: "Brak POSTGRES_URL — ustaw baze i uruchom /api/init-db." },
      { status: 503 },
    );
  }
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await refreshMacro();
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[/api/macro POST] error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
