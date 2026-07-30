import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    return NextResponse.json({ ok: true, note: "Gate wylaczony." });
  }

  let submitted = "";
  try {
    const body = await req.json();
    submitted = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Nieprawidlowe zadanie." }, { status: 400 });
  }

  if (submitted !== password) {
    return NextResponse.json({ error: "Bledne haslo." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dni
  });
  return res;
}
