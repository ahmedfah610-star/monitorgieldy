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

/** Skala mapowania sredniej sily 3M sektora na [-1,1]: ±15% kwartalnie → ±1. */
const MOMENTUM_SCALE = 0.15;

export interface SectorClimate {
  sector: string;
  prior: number;
  bottomUp: number | null; // z sily 3M spolek sektora, [-1,1]
  climate: number; // finalny blend, [-1,1]
  members: number; // ile spolek sektora mialo dane
  note: string;
}

/**
 * Liczy koniunkture sektora: blend priora ze srednia sila 3M spolek sektora.
 * `members` to lista {sector, r3m} ze wszystkich spolek uniwersum (r3m moze byc null).
 */
export function computeSectorClimates(
  members: { sector: string; r3m: number | null }[],
): Map<string, SectorClimate> {
  // Agregacja oddolna: srednia r3m per sektor (tylko spolki z historia).
  const agg = new Map<string, { sum: number; n: number }>();
  for (const m of members) {
    if (m.r3m === null || !Number.isFinite(m.r3m)) continue;
    const a = agg.get(m.sector) ?? { sum: 0, n: 0 };
    a.sum += m.r3m;
    a.n += 1;
    agg.set(m.sector, a);
  }

  const out = new Map<string, SectorClimate>();
  for (const sector of SECTORS) {
    const p = SECTOR_CLIMATE_PRIOR[sector] ?? SECTOR_CLIMATE_PRIOR.Inna;
    const a = agg.get(sector);
    // Potrzeba >=2 spolek, by srednia sektora byla sensowna (mniej = sam szum).
    const bottomUp = a && a.n >= 2 ? clamp(a.sum / a.n / MOMENTUM_SCALE, -1, 1) : null;
    const climate = bottomUp === null ? p.climate : clamp(0.6 * p.climate + 0.4 * bottomUp, -1, 1);
    out.set(sector, {
      sector,
      prior: p.climate,
      bottomUp,
      climate,
      members: a?.n ?? 0,
      note: p.note,
    });
  }
  return out;
}
