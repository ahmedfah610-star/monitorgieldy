import { NextResponse } from "next/server";
import { getCompanyList } from "@/lib/company";

export const dynamic = "force-dynamic";

/** Lekka lista katalogu spolek do wyszukiwarki (ticker, nazwa, rynek, branza). */
export async function GET() {
  try {
    const companies = await getCompanyList();
    return NextResponse.json({ companies });
  } catch (e) {
    console.error("[/api/companies] error", e);
    return NextResponse.json({ companies: [], error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
