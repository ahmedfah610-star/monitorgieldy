"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Podstawowe (zawsze widoczne) — najważniejsze narzędzia + strefa klienta.
const PRIMARY: { href: string; label: string }[] = [
  { href: "/", label: "Pulpit" },
  { href: "/ranking", label: "Ranking" },
  { href: "/screener", label: "Screener" },
  { href: "/heatmap", label: "Heatmapa" },
  { href: "/macro", label: "Makro" },
  { href: "/account", label: "Strefa klienta" },
];

// Reszta — pod „Więcej" (dane rynkowe i sygnały). Rzeczy osobiste są w Strefie klienta.
const MORE: { href: string; label: string; group: string }[] = [
  { href: "/recommendations", label: "Rekomendacje", group: "Dane rynkowe" },
  { href: "/reports", label: "Raporty", group: "Dane rynkowe" },
  { href: "/dividends", label: "Dywidendy", group: "Dane rynkowe" },
  { href: "/insider", label: "Insiderzy", group: "Sygnały" },
  { href: "/short", label: "Shorty", group: "Sygnały" },
  { href: "/holdings", label: "Pakiety", group: "Sygnały" },
  { href: "/portfolio", label: "Portfel", group: "Strefa klienta" },
  { href: "/watchlist", label: "Watchlista", group: "Strefa klienta" },
  { href: "/outlook", label: "Perspektywy", group: "Strefa klienta" },
  { href: "/forecast", label: "Prognozy", group: "Strefa klienta" },
];

export function NavBar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const moreActive = MORE.some((l) => isActive(l.href));
  const groups = [...new Set(MORE.map((l) => l.group))];

  return (
    <nav className="-mx-4 hidden items-center gap-1 overflow-x-auto px-4 pb-2.5 sm:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {PRIMARY.map((l) => {
        const active = isActive(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`navpill relative ${active ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"}`}
          >
            {l.label}
            {active && <span className="absolute inset-x-3 -bottom-[9px] h-0.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" />}
          </Link>
        );
      })}

      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`navpill flex items-center gap-1 ${moreActive || open ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"}`}
        >
          Więcej
          <span className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </button>
        {open && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-52 rounded-xl border border-neutral-200 bg-white p-2 shadow-2xl shadow-black/50">
            {groups.map((g) => (
              <div key={g} className="mb-1 last:mb-0">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{g}</p>
                {MORE.filter((l) => l.group === g).map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`block rounded-lg px-2 py-1.5 text-[13px] transition ${isActive(l.href) ? "bg-blue-500/10 text-blue-700" : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"}`}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
