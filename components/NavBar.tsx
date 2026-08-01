"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Pulpit" },
  { href: "/ranking", label: "Ranking" },
  { href: "/portfolio", label: "Portfel" },
  { href: "/macro", label: "Makro" },
  { href: "/recommendations", label: "Rekomendacje" },
  { href: "/reports", label: "Raporty" },
  { href: "/outlook", label: "Perspektywy" },
  { href: "/insider", label: "Insiderzy" },
  { href: "/short", label: "Shorty" },
  { href: "/holdings", label: "Pakiety" },
  { href: "/dividends", label: "Dywidendy" },
  { href: "/watchlist", label: "Watchlista" },
];

export function NavBar() {
  const path = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${
              active
                ? "bg-blue-500/10 text-blue-300 ring-1 ring-inset ring-blue-500/25"
                : "text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
