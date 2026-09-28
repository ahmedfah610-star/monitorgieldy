import { LegalPage, H2, P, UL } from "@/components/Legal";

export const metadata = {
  title: "Zastrzeżenia prawne — MarketScope",
  description: "Charakter informacyjny serwisu, brak doradztwa inwestycyjnego i rekomendacji w rozumieniu MAR.",
};

export default function DisclaimerPage() {
  return (
    <LegalPage eyebrow="Informacje prawne" title="Zastrzeżenia prawne" updated="28 września 2026">
      <H2>Charakter serwisu</H2>
      <P>
        MarketScope („Serwis") jest narzędziem <strong>informacyjno-analitycznym</strong>. Prezentuje
        publicznie dostępne dane rynkowe, wskaźniki, zestawienia i autorskie wyniki ilościowe dotyczące
        spółek notowanych na GPW oraz wybranych rynkach zagranicznych. Serwis ma charakter wyłącznie
        edukacyjny i informacyjny.
      </P>

      <H2>To NIE jest doradztwo inwestycyjne</H2>
      <P>
        Treści w Serwisie <strong>nie stanowią doradztwa inwestycyjnego</strong> w rozumieniu ustawy z dnia
        29 lipca 2005 r. o obrocie instrumentami finansowymi. Serwis nie świadczy usług maklerskich, nie
        udziela porad inwestycyjnych ani nie przygotowuje spersonalizowanych rekomendacji dopasowanych do
        sytuacji konkretnego użytkownika. Prezentowane wyniki są identyczne dla wszystkich odbiorców i nie
        uwzględniają indywidualnej sytuacji finansowej, wiedzy ani celów inwestycyjnych użytkownika.
      </P>

      <H2>To NIE jest rekomendacja inwestycyjna (MAR)</H2>
      <P>
        Materiały w Serwisie <strong>nie stanowią rekomendacji inwestycyjnej</strong> ani informacji
        sugerującej strategię inwestycyjną w rozumieniu Rozporządzenia Parlamentu Europejskiego i Rady (UE)
        nr 596/2014 (MAR) oraz Rozporządzenia delegowanego Komisji (UE) 2016/958. Autorski „ranking
        atrakcyjności", „screener" i podobne zestawienia są wynikiem deterministycznego, ilościowego modelu
        (wskaźnik złożony), a nie oceny ani zalecenia zakupu, sprzedaży czy utrzymania instrumentu
        finansowego.
      </P>

      <H2>Ryzyko inwestycyjne</H2>
      <P>
        Inwestowanie w instrumenty finansowe wiąże się z ryzykiem, w tym z ryzykiem utraty części lub całości
        zainwestowanego kapitału. Wyniki historyczne oraz dane prezentowane w Serwisie nie stanowią gwarancji
        przyszłych rezultatów. Decyzje inwestycyjne użytkownik podejmuje samodzielnie i na własną
        odpowiedzialność, po rozważeniu ryzyka i — w razie potrzeby — po konsultacji z licencjonowanym
        doradcą.
      </P>

      <H2>Źródła danych i ich jakość</H2>
      <P>Dane prezentowane w Serwisie pochodzą m.in. z następujących źródeł zewnętrznych:</P>
      <UL>
        <li>notowania i dane rynkowe — Yahoo Finance;</li>
        <li>komunikaty spółek (raporty okresowe, transakcje osób zarządzających art. 19 MAR, znaczne pakiety art. 69), rekomendacje i dywidendy — bankier.pl;</li>
        <li>krótkie pozycje netto — publiczny rejestr Komisji Nadzoru Finansowego (KNF);</li>
        <li>dane makroekonomiczne — Narodowy Bank Polski (NBP) oraz Bank Światowy (World Bank).</li>
      </UL>
      <P>
        Prawa do danych źródłowych przysługują ich dostawcom. Serwis nie gwarantuje kompletności,
        aktualności ani bezbłędności prezentowanych danych, w szczególności gdy pochodzą one ze źródeł
        zewnętrznych, które mogą zawierać opóźnienia lub błędy.
      </P>

      <H2>Metodyka</H2>
      <P>
        Autorskie wskaźniki (ranking, screener) liczone są jako wskaźnik złożony według podejścia
        zbliżonego do metodyki OECD/JRC: standaryzacja przekrojowa sygnałów względem grupy porównawczej,
        ważona agregacja i mapowanie na skalę 0–100. Model jest deterministyczny i nie wykorzystuje uczenia
        nadzorowanego. Wagi i składowe mogą ulegać zmianom.
      </P>
    </LegalPage>
  );
}
