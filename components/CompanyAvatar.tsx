// Awatar spolki — kolorowy monogram (jak fallback logo na LinkedIn). Nie mamy
// zrodla prawdziwych logotypow, a zewnetrzne obrazki sa i tak blokowane przez
// CSP artefaktu — monogram jest pewny, spojny i czytelny. Kolor deterministyczny
// z tickera, wiec ta sama spolka zawsze wyglada tak samo.

const GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-blue-600",
  "from-lime-500 to-emerald-600",
  "from-fuchsia-500 to-violet-600",
  "from-sky-500 to-indigo-600",
  "from-red-500 to-rose-600",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string, ticker: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1 && words[0].length >= 2) return words[0].slice(0, 2).toUpperCase();
  return ticker.slice(0, 2).toUpperCase();
}

export function CompanyAvatar({
  name,
  ticker,
  size = "md",
}: {
  name: string;
  ticker: string;
  size?: "sm" | "md" | "lg";
}) {
  const grad = GRADIENTS[hash(ticker) % GRADIENTS.length];
  const cls =
    size === "lg"
      ? "h-16 w-16 rounded-2xl text-xl"
      : size === "sm"
        ? "h-8 w-8 rounded-lg text-[11px]"
        : "h-11 w-11 rounded-xl text-sm";
  return (
    <span
      className={`grid shrink-0 place-items-center bg-gradient-to-br ${grad} font-bold uppercase tracking-tight text-white shadow-sm ring-1 ring-black/5 ${cls}`}
      aria-hidden
    >
      {initials(name, ticker)}
    </span>
  );
}
