import Link from "next/link";

/**
 * Kompaktowy disclaimer pod sekcje analityczne (ranking/screener/profil).
 * Wariant "inline" — subtelny pasek; "card" — wyraźniejsza ramka.
 */
export function LegalDisclaimer({ variant = "inline" }: { variant?: "inline" | "card" }) {
  const base =
    "text-xs leading-relaxed text-neutral-500";
  if (variant === "card") {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
        <p className={base}>
          <strong className="text-neutral-600">Materiał informacyjny.</strong> Nie stanowi doradztwa
          inwestycyjnego ani rekomendacji w rozumieniu MAR. Decyzje inwestycyjne podejmujesz samodzielnie.{" "}
          <Link href="/zastrzezenia" className="text-blue-600 hover:underline">Zastrzeżenia prawne →</Link>
        </p>
      </div>
    );
  }
  return (
    <p className={base}>
      Materiał informacyjny — nie stanowi doradztwa inwestycyjnego ani rekomendacji w rozumieniu MAR.{" "}
      <Link href="/zastrzezenia" className="text-blue-600 hover:underline">Więcej →</Link>
    </p>
  );
}
