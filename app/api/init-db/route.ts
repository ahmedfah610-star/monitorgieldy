import { NextResponse } from "next/server";
import { hasDb, initSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Tworzy tabele w bazie (idempotentnie). Wywolaj raz po podpieciu
 * Vercel Postgres: otworz /api/init-db w przegladarce (GET) albo POST.
 */
async function run() {
  if (!hasDb()) {
    return NextResponse.json(
      { error: "Brak POSTGRES_URL — najpierw skonfiguruj Vercel Postgres w .env.local." },
      { status: 503 },
    );
  }
  try {
    await initSchema();
    return NextResponse.json({ ok: true, message: "Tabele utworzone (lub juz istnialy)." });
  } catch (e) {
    console.error("[/api/init-db] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}

export const GET = run;
export const POST = run;
