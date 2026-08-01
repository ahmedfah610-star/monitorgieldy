import type { Metadata } from "next";
import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Market Dashboard — GPW · USA",
  description: "Osobisty dashboard rynkowy: notowania, rekomendacje, insiderzy, shorty, ranking i makro.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex items-center justify-between gap-4 py-3">
              <Link href="/" className="group flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25 ring-1 ring-white/10">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 17l5-5 4 3 7-8" />
                    <path d="M16 4h4v4" />
                  </svg>
                </span>
                <span className="flex flex-col leading-none">
                  <span className="text-[15px] font-semibold tracking-tight text-neutral-100">
                    Market<span className="text-blue-400">Scope</span>
                  </span>
                  <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                    GPW · USA · makro
                  </span>
                </span>
              </Link>
              <a
                href="https://www.gpw.pl"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden rounded-full border border-white/[0.08] px-3 py-1.5 text-xs text-neutral-400 transition hover:border-white/20 hover:text-neutral-200 sm:block"
              >
                Narzędzie informacyjne
              </a>
            </div>
            <NavBar />
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>

        <footer className="mx-auto mt-10 max-w-6xl px-4 pb-10">
          <div className="border-t border-white/[0.06] pt-5 text-xs text-neutral-600">
            <span className="text-neutral-500">MarketScope</span> — osobisty dashboard rynkowy.
            Dane: GPW/bankier, KNF, World Bank, NBP, Yahoo Finance. Narzędzie informacyjne, nie
            doradztwo inwestycyjne.
          </div>
        </footer>
      </body>
    </html>
  );
}
