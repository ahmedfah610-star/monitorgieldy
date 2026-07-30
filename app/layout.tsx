import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Market Dashboard",
  description: "Osobisty dashboard rynkowy: GPW + USA",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>
        <div className="mx-auto max-w-5xl px-4 py-6">
          <header className="mb-8 flex items-center justify-between border-b border-neutral-800 pb-4">
            <Link href="/" className="text-xl font-semibold tracking-tight">
              📈 Market Dashboard
            </Link>
            <nav className="flex gap-4 text-sm text-neutral-400">
              <Link href="/" className="hover:text-neutral-100">
                Dashboard
              </Link>
              <Link href="/watchlist" className="hover:text-neutral-100">
                Watchlista
              </Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
