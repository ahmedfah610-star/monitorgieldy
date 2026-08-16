import { SECTORS } from "./sectors";

/**
 * Koniunktura SEKTORA (branzowa) — zastepuje w rankingu makro na poziomie kraju.
 *
 * Dlaczego? Klimat PL/USA (PKB, inflacja) jest IDENTYCZNY dla wszystkich spolek
 * danego rynku, wiec w rankingu wzglednym nic nie roznicuje. Orlen zalezy od
 * koniunktury paliw/energetyki, PKO od bankowosci, CDR od gamingu — i to ma
 * realny wplyw na atrakcyjnosc kupna na dzis.
 *
 * Model (bez AI, przejrzysty):
 *  1. PRIOR STRUKTURALNY — przygotowany z gory dla KAZDEGO sektora obecnego w
 *     WIG20/mWIG40 (i sektorow US): pozycja sektora w cyklu na dzis, [-1, 1],
 *     z krotkim uzasadnieniem. To "dane przygotowane wczesniej".
 *  2. SKLADNIK ODDOLNY (live) — srednia sila wzgledna 3M spolek danego sektora
 *     z naszego uniwersum. Sprawia, ze koniunktura sektora rusza sie z rynkiem,
 *     a nie jest sama tylko statyczna opinia.
 *  3. BLEND: 0.6*prior + 0.4*oddolny (gdy sa spolki sektora z historia),
 *     w innym razie sam prior.
 */

export interface SectorPrior {
  climate: number; // [-1, 1]; >0 = sprzyjajaca koniunktura sektora
  note: string; // jednolinijkowe uzasadnienie (stan na ~2025/2026)
}

// Prior przygotowany dla kazdego sektora z listy SECTORS. Wartosci umiarkowane,
// aktualizowalne — to punkt wyjscia, nie wyrocznia.
export const SECTOR_CLIMATE_PRIOR: Record<string, SectorPrior> = {
  Bankowość: { climate: 0.35, note: "Wysokie stopy → rekordowe zyski; nadchodzące cięcia lekko schłodzą marże odsetkowe." },
  "Finanse i ubezpieczenia": { climate: 0.25, note: "Solidny popyt; zmienność rynku sprzyja brokerom, ubezpieczyciele stabilni." },
  Energetyka: { climate: 0.05, note: "Transformacja energetyczna: wysoki capex i regulacje ciążą, popyt stabilny." },
  Paliwa: { climate: -0.05, note: "Słabsze marże rafineryjne i presja na spready wobec rekordowych poprzednich lat." },
  "Surowce i górnictwo": { climate: 0.0, note: "Cykliczne: miedź trzyma się nieźle, węgiel pod presją; zależne od cen surowców." },
  "Technologia i IT": { climate: 0.35, note: "Strukturalny wzrost: popyt na oprogramowanie, cyfryzację i AI." },
  Gaming: { climate: 0.1, note: "Zależne od kalendarza premier; cykl produkcyjny, wysoka zmienność." },
  "E-commerce": { climate: 0.2, note: "Rosnąca penetracja handlu online, ale konkurencja i presja na marże." },
  "Handel detaliczny": { climate: 0.15, note: "Konsument odbudowuje siłę nabywczą po dezinflacji; presja płac kosztowa." },
  Nieruchomości: { climate: -0.1, note: "Wrażliwe na stopy; deweloperzy mieszkaniowi zależni od dostępności kredytu." },
  Przemysł: { climate: 0.05, note: "Poprawa PMI, ale eksport wrażliwy na koniunkturę w Niemczech." },
  Budownictwo: { climate: 0.15, note: "Fundusze UE/KPO napędzają inwestycje infrastrukturalne." },
  Telekomunikacja: { climate: 0.1, note: "Defensywny: stabilne przepływy, niski wzrost, odporny na cykl." },
  Media: { climate: 0.0, note: "Presja strukturalna i walka o budżety reklamowe z platformami cyfrowymi." },
  Motoryzacja: { climate: 0.1, note: "Dystrybucja części odporna; popyt na serwis i naprawy stabilny." },
  "Ochrona zdrowia": { climate: 0.2, note: "Defensywny wzrost: starzenie się społeczeństwa, stały popyt." },
  Gastronomia: { climate: 0.05, note: "Odbudowa konsumpcji, ale presja kosztów pracy i najmu." },
  Turystyka: { climate: 0.15, note: "Silny popyt na wyjazdy po pandemii; wrażliwy na siłę konsumenta." },
  Usługi: { climate: 0.1, note: "Stabilny popyt (benefity, HR, usługi dla firm)." },
  "Dobra konsumenckie": { climate: 0.1, note: "Defensywny: przewidywalny popyt, odporność na cykl." },
  Inna: { climate: 0.0, note: "Brak przypisanego sektora — koniunktura neutralna." },
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Skala mapowania sredniej sily sektora na [-1,1]: ±15% → ±1. */
const MOMENTUM_SCALE = 0.15;
// Koniunktura ma "zyc z rynkiem" — wiec skladnik LIVE (sila kursow sektora) wazy
// wiecej niz strukturalny prior. Prior jest tylko kotwica na starcie / gdy malo danych.
const LIVE_WEIGHT = 0.6;
const PRIOR_WEIGHT = 0.4;

export interface SectorClimate {
  sector: string;
  prior: number; // strukturalny prior [-1,1]
  bottomUp: number | null; // skladnik LIVE z kursow sektora [-1,1]
  climate: number; // finalny blend [-1,1]
  members: number; // ile spolek sektora mialo dane
  mom3m: number | null; // srednia sila 3M sektora (ulamek)
  mom1m: number | null; // srednia sila 1M sektora (ulamek)
  breadth: number | null; // udzial spolek sektora na plusie 3M [0,1]
  note: string;
}

/**
 * Liczy koniunkture sektora — ZYWA, poruszajaca sie z rynkiem. Skladnik LIVE
 * (sila kursow spolek sektora: 3M z wieksza, 1M z mniejsza waga + szerokosc rynku)
 * wazy 60%, strukturalny prior 40%. `members` to {sector, r1m, r3m} z uniwersum.
 */
export function computeSectorClimates(
  members: { sector: string; r1m: number | null; r3m: number | null }[],
): Map<string, SectorClimate> {
  const agg = new Map<string, { s3: number; n3: number; s1: number; n1: number; up: number }>();
  for (const m of members) {
    const a = agg.get(m.sector) ?? { s3: 0, n3: 0, s1: 0, n1: 0, up: 0 };
    if (m.r3m !== null && Number.isFinite(m.r3m)) {
      a.s3 += m.r3m; a.n3 += 1; if (m.r3m > 0) a.up += 1;
    }
    if (m.r1m !== null && Number.isFinite(m.r1m)) { a.s1 += m.r1m; a.n1 += 1; }
    agg.set(m.sector, a);
  }

  const out = new Map<string, SectorClimate>();
  for (const sector of SECTORS) {
    const p = SECTOR_CLIMATE_PRIOR[sector] ?? SECTOR_CLIMATE_PRIOR.Inna;
    const a = agg.get(sector);
    const mom3m = a && a.n3 ? a.s3 / a.n3 : null;
    const mom1m = a && a.n1 ? a.s1 / a.n1 : null;
    const breadth = a && a.n3 ? a.up / a.n3 : null;

    // LIVE: sila kursow (3M mocniej, 1M lzej) + lekki przechyl od szerokosci rynku.
    // Wymaga >=2 spolek z historia 3M, inaczej sam prior (za malo danych).
    let bottomUp: number | null = null;
    if (a && a.n3 >= 2 && mom3m !== null) {
      const momPart = (0.65 * mom3m + 0.35 * (mom1m ?? mom3m)) / MOMENTUM_SCALE;
      const breadthTilt = breadth !== null ? (breadth - 0.5) * 0.5 : 0; // ±0.25
      bottomUp = clamp(momPart + breadthTilt, -1, 1);
    }
    const climate = bottomUp === null ? p.climate : clamp(PRIOR_WEIGHT * p.climate + LIVE_WEIGHT * bottomUp, -1, 1);

    out.set(sector, {
      sector, prior: p.climate, bottomUp, climate,
      members: a?.n3 ?? 0, mom3m, mom1m, breadth, note: p.note,
    });
  }
  return out;
}
