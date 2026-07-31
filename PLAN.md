# Plan: Osobisty dashboard rynkowy (GPW + USA) z AI-analizą wyników spółek

Projekt jednoosobowy, bez logowania wielu userów — priorytet to szybkie MVP, potem rozbudowa.

## 1. Cel

Aplikacja (klik = odświeżenie), która na jednym ekranie pokazuje:

- Notowania z GPW (Twoja watchlista + WIG20/mWIG40) i najważniejsze dane z USA (S&P500, Nasdaq, Twoja watchlista US).
- Najnowsze rekomendacje analityków dla obserwowanych spółek.
- Nowe raporty finansowe (kwartalne/roczne) obserwowanych spółek — automatyczne wykrycie, wyciągnięcie kluczowych liczb i porównanie do poprzedniego okresu + wnioski pisane przez AI.

## 2. Rekomendowana architektura

- **Next.js (App Router) na Vercelu** — pasuje do "klikam i dostaję dane", łatwy deploy, darmowy tier wystarczy.
- **Baza danych: Vercel Postgres** — KLUCZOWE: bez bazy nie da się "porównać do poprzednich wyników", bo trzeba gdzieś trzymać historię (ostatni znany raport, ostatnia znana rekomendacja), żeby wykrywać co jest nowe.
- **Ochrona dostępu**: proste hasło przez middleware (Edge Middleware + zmienna środowiskowa) — appka będzie publicznie dostępna pod adresem `*.vercel.app`.
- **Silnik analizy**: wywołania Anthropic API (Claude) z backendu (Vercel Functions) — do parsowania raportów finansowych i generowania wniosków. Wymaga własnego klucza API.
- **Automatyzacja**: Vercel Cron Jobs (codziennie rano) do pobrania danych i zapisania "snapshotu".

## 3. Źródła danych (zweryfikowane, lipiec 2026)

| Potrzeba | Źródło | Typ dostępu | Uwagi |
|---|---|---|---|
| Notowania GPW (ceny, historia) | stooq.pl / stooq.com | Darmowy CSV bez klucza | Brak oficjalnego API, endpointy CSV działają od lat |
| Notowania USA (indeksy, spółki) | stooq.pl (tickery `aapl.us`) lub Finnhub | CSV / oficjalne API | Finnhub ma dane real-time-ish |
| Komunikaty ESPI/EBI GPW | gpw.pl/komunikaty | HTML, scraping | Brak oficjalnego API; parsowanie listy i linków do PDF |
| Rekomendacje analityków PL | bankier.pl, stockwatch.pl | HTML, scraping | Pełne wyceny bywają za abonamentem |
| Rekomendacje analityków USA | Finnhub — recommendation trends | Oficjalne, darmowy tier (60/min) | Najsensowniejsza opcja na start dla USA |
| Dane fundamentalne/earnings USA | Alpha Vantage / Finnhub | Oficjalne API | Alpha Vantage darmowy tier bardzo wąski (~25/dzień) |
| Pełne sprawozdania US (AI) | SEC EDGAR (Full-Text / XBRL) | Oficjalne, darmowe | Najlepsze źródło danych fundamentalnych US |
| Pełne sprawozdania PL (AI) | PDF-y z ESPI na gpw.pl / infostrefa.com | Pliki PDF | Brak odpowiednika SEC EDGAR — trzeba parsować PDF |

**Ważne:** scraping bankier/stockwatch/gpw to użytek osobisty — uszanuj robots.txt i nie odpytuj zbyt często (Cron raz dziennie zamiast przy każdym kliknięciu).

> **Zmiana vs pierwotny plan (Faza 1):** Stooq w 2026 dodał ochronę antybotową (JS
> proof-of-work) na endpointach CSV — przestały działać bez przeglądarki. Notowania
> pobieramy więc z **Yahoo Finance chart API** (keyless, JSON, GPW przez sufiks `.WA`
> oraz USA). To realizacja ryzyka „źródło może się wywalić" z sekcji 6.

## 4. Fazy budowy

- **Faza 0 — Setup i watchlista.** Next.js (App Router, TS, Tailwind) + Vercel Postgres + tabela `watchlist` + strona edycji. ✅ *(zrobione)*
- **Faza 1 — Notowania (MVP).** Ceny + zmiana dzienna dla watchlisty i indeksów (WIG20, mWIG40, S&P500, Nasdaq). ✅ *(zrobione — źródło: Yahoo Finance zamiast Stooq, patrz niżej)*
- **Faza 2 — Rekomendacje analityków.** USA: Finnhub (recommendation trends). PL: scraper bankier.pl (per-spółka + feed rynkowy). Zapis każdej rekomendacji z datą + wykrywanie nowych (fingerprint). ✅ *(zrobione)*
- **Faza 3 — Wykrywanie nowych raportów.** Scraper ESPI/EBI z gpw.pl filtrowany po słowach kluczowych. Zapis linku do PDF + daty.
- **Faza 4 — Ekstrakcja danych z raportu.** PDF → tekst (pdf-parse) → Claude → ustrukturyzowany JSON (przychody, zysk netto, EBITDA, marże). Zapis w bazie.
- **Faza 5 — Porównanie i wnioski AI.** Gdy ≥2 okresy: drugie wywołanie Claude porównuje liczby i pisze 3-4 zdania wniosków.
- **Faza 6 — Dashboard końcowy.** Jeden ekran: PL / USA / nowe rekomendacje / nowe wyniki + wnioski AI. Przycisk "Odśwież teraz" + Cron raz dziennie.
- **Faza 7 (opcjonalnie) — Powiadomienia.** Codzienny e-mail (Resend) z podsumowaniem.

## 5. Model danych — minimalny szkielet

```
watchlist(ticker, market, name)
price_snapshots(ticker, date, close, change_pct)
recommendations(ticker, source, rating, price_target, date)
reports(ticker, period, report_type, pdf_url, published_at, extracted_json)
ai_conclusions(ticker, period, text, created_at)
```

## 6. Ryzyka i ograniczenia

- Brak oficjalnego API dla komunikatów GPW i rekomendacji PL → scraping może się wywalić przy zmianie strony (buduj scrapery odpornie, z logowaniem błędów).
- Darmowe tiery API (zwłaszcza Alpha Vantage) są ciasne — bez płatnego planu brak real-time dla USA; Finnhub free tier wystarcza na start.
- Ekstrakcja liczb z PDF-ów bywa niedokładna — traktuj wnioski AI jako pomoc do przeglądu, nie finalne źródło prawdy.
- To narzędzie **informacyjne, nie doradztwo inwestycyjne**.

## 7. Status realizacji

- [x] Faza 0 — setup + watchlista
- [x] Faza 1 — notowania (PL/US + indeksy; Yahoo Finance)
- [x] Faza 2 — rekomendacje (Finnhub US + scraper bankier.pl PL, zapis + wykrywanie nowych)
- [ ] Faza 3 — wykrywanie raportów
- [ ] Faza 4 — ekstrakcja z PDF
- [ ] Faza 5 — wnioski AI
- [ ] Faza 6 — dashboard końcowy
- [ ] Faza 7 — powiadomienia
