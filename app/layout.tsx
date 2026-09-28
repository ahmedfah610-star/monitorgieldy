import type { Metadata } from "next";
import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NavBar } from "@/components/NavBar";
import { IndexTicker } from "@/components/IndexTicker";
import { BottomNav } from "@/components/BottomNav";
import { CompanySearch } from "@/components/CompanySearch";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarketScope — GPW · USA · Makro",
  description: "Profesjonalny dashboard rynkowy: notowania, ranking atrakcyjności, rekomendacje, insiderzy, shorty i makro.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto max-w-[1360px] px-4 sm:px-6">
            <div className="flex items-center gap-3 py-3">
              <Link href="/" className="group flex shrink-0 items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 ring-1 ring-neutral-200 transition group-hover:shadow-blue-500/50">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 17l5-5 4 3 7-8" />
                    <path d="M16 4h4v4" />
                  </svg>
                </span>
                <span className="flex flex-col leading-none">
                  <span className="text-[15px] font-semibold tracking-tight text-neutral-900">
                    Market<span className="text-blue-600">Scope</span>
                  </span>
                  <span className="mt-1 hidden text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500 sm:block">
                    GPW · USA · Makro
                  </span>
                </span>
              </Link>
              <div className="ml-auto w-full max-w-[180px] sm:max-w-sm">
                <CompanySearch compact />
              </div>
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Dane na żywo
                </span>
              </div>
            </div>
            <NavBar />
            <IndexTicker />
          </div>
        </header>

        <div className="mx-auto max-w-[1360px] px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">{children}</div>

        <BottomNav />

        <footer className="mx-auto mt-10 max-w-[1360px] px-4 pb-24 sm:px-6 sm:pb-10">
          <div className="flex flex-col gap-3 border-t border-neutral-200 pt-5 text-xs text-neutral-500">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="font-semibold text-neutral-600">MarketScope</span>
              <Link href="/regulamin" className="hover:text-blue-600 hover:underline">Regulamin</Link>
              <Link href="/polityka-prywatnosci" className="hover:text-blue-600 hover:underline">Polityka prywatności</Link>
              <Link href="/zastrzezenia" className="hover:text-blue-600 hover:underline">Zastrzeżenia prawne</Link>
            </div>
            <span>
              Materiał informacyjny — <strong className="text-neutral-600">nie stanowi doradztwa inwestycyjnego
              ani rekomendacji w rozumieniu MAR</strong>. Decyzje inwestycyjne podejmujesz samodzielnie i na
              własną odpowiedzialność.
            </span>
            <span>
              Źródła danych: Yahoo Finance, bankier.pl, KNF, NBP, World Bank. Prawa do danych źródłowych
              przysługują ich dostawcom.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
