import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

/**
 * Prosta ochrona calej aplikacji jednym haslem.
 * Aktywna TYLKO gdy ustawisz DASHBOARD_PASSWORD (inaczej przepuszcza wszystko —
 * wygodne podczas lokalnego developmentu).
 */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  if (req.cookies.get(AUTH_COOKIE)?.value === password) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Pomijamy zasoby statyczne Next.js.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
