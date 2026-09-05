"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Pulpit" },
  { href: "/ranking", label: "Ranking" },
  { href: "/screener", label: "Screener" },
  { href: "/heatmap", label: "Heatmapa" },
  { href: "/portfolio", label: "Portfel" },
  { href: "/macro", label: "Makro" },
  { href: "/recommendations", label: "Rekomendacje" },
  { href: "/reports", label: "Raporty" },
  { href: "/outlook", label: "Perspektywy" },
  { href: "/forecast", label: "Prognozy" },
  { href: "/insider", label: "Insiderzy" },
  { href: "/short", label: "Shorty" },
  { href: "/holdings", label: "Pakiety" },
  { href: "/dividends", label: "Dywidendy" },
  { href: "/watchlist", label: "Watchlista" },
];

export function NavBar() {
  const path = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`navpill relative ${
              active
                ? "bg-white/[0.06] text-white ring-1 ring-inset ring-white/10"
                : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-100"
            }`}
          >
            {l.label}
            {active && (
              <span className="absolute inset-x-3 -bottom-[9px] h-0.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
