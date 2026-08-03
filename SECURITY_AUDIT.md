# 🛡️ Audyt bezpieczeństwa — 2026-08-03

## Podsumowanie

Ręczny audyt wersji `1.1.0` na bazowym commicie `c115e6c` nie wykazał krytycznego błędu implementacyjnego w odwracalnym round-tripie `swd1`/`swd2` ani w sprawdzonym wektorze zgodności `wallet-decoder`. Projekt pozostaje jednak eksperymentalnym, niestandardowym kodekiem i nie przeszedł niezależnego audytu kryptograficznego.

Najważniejsze ustalenie dotyczy modelu backupu: `hasło + liczba` jest technicznym podziałem reprezentacji, a nie równorzędnym podziałem sekretu. Dla mnemonika 24-wyrazowego hasło zawiera 216 bitów entropii, natomiast liczba tylko 40 bitów tajnej entropii. Nie wolno przedstawiać tego jako 2FA ani bezpiecznego secret sharing.

| Poziom | Liczba |
| --- | ---: |
| 🔴 Krytyczny | 0 |
| 🟠 Wysoki w modelu rozdzielonego backupu | 1 |
| 🟡 Średni | 2 |
| 🔵 Niski / informacyjny | 3 |

## Zakres i metoda

Sprawdzono:

- `src/recovery-codec.js` — kodowanie, dekodowanie, wersjonowanie, walidację i tag;
- `src/legacy-wallet-decoder.js` — deterministyczną ścieżkę Bitcoin i zgodność kontraktu wejścia;
- `src/cli.js` — obsługę sekretów, wejścia interaktywnego i potokowego;
- testy, dokumentację, `package.json` i pełne drzewo zależności;
- zgodność założeń BIP-39 ze [specyfikacją BIP-39](https://bips.dev/39/);
- deklarowany status używanej biblioteki [@scure/bip39](https://github.com/paulmillr/scure-bip39#security).

Wykonane polecenia:

```text
npm run check             -> 20/20 testów, 0 błędów
npm audit --omit=dev      -> 0 znanych podatności
npm ls --all              -> 5 przypiętych pakietów w drzewie produkcyjnym
```

Wynik `npm audit` jest migawką z dnia audytu, a nie gwarancją braku przyszłych lub nieznanych podatności.

## Ustalenia

### AUD-01 — Asymetryczny podział entropii

**Poziom:** 🟠 wysoki, jeżeli pola są traktowane jako dwa niezależne sekrety

**Status:** otwarty — zachowanie wynika z formatu; dodano ostrzeżenia

Dla 24 słów BIP-39 kodek dzieli 256 bitów entropii na:

- 216-bitowy prefiks kodowany w haśle;
- 40-bitowy ogon zapisany w liczbie;
- 24-bitowy tag i nagłówek, które nie są tajne.

Jeżeli napastnik pozna samo hasło, może enumerować około `2^40` ogonów. Przy znanym adresie portfela, historii transakcji lub innym celu weryfikacyjnym może rozpoznać właściwego kandydata; bez takiego celu pozostaje mu `2^40` możliwych mnemoniców. To znacznie mniej niż 256-bitowa przestrzeń pełnego losowego mnemonika. Odwrotna sytuacja — ujawnienie samej liczby — pozostawia większość entropii nieznaną, nawet gdy zawarty w liczbie tag służy do filtrowania prób.

**Rekomendacja:** traktować pełny kod jak jedną reprezentację mnemonika. Do odpornego podziału między lokalizacje użyć osobnego, niezależnie przeanalizowanego schematu secret sharing albo szyfrowanego magazynu. Nie określać `hasło + liczba` jako 2FA.

### AUD-02 — Sekrety pojawiają się w wyjściu i pamięci procesu

**Poziom:** 🟡 średni

**Status:** częściowo ograniczony ukrytym promptem; ryzyko pozostaje

CLI ukrywa znaki przy wpisywaniu, lecz następnie wyświetla kod, mnemonic i wynik legacy na standardowym wyjściu. Tryby JSON oraz potoki mogą trafić do scrollbacku terminala, logów CI, plików lub historii narzędzi nadrzędnych. JavaScript nie zapewnia niezawodnego wyzerowania wszystkich kopii stringów i buforów w pamięci.

**Rekomendacja:** pracować offline na czystym systemie, bez nagrywania terminala i bez logowania wyjścia. Nie używać prawdziwych sekretów w CI. Po zakończeniu zamknąć proces i usunąć artefakty tymczasowe zgodnie z zasadami systemu.

### AUD-03 — Niestandardowy i jednokierunkowy algorytm legacy

**Poziom:** 🟡 średni

**Status:** zachowanie zamierzone i udokumentowane

Tryb `legacy` wielokrotnie haszuje dane pochodzące z klucza prywatnego albo adresu zależnie od bitów liczby. Nie jest standardową metodą tworzenia portfela ani częścią BIP-39/BIP-44. Wynik jest deterministyczny, lecz nie można praktycznie odzyskać z niego hasła, liczby ani Mnemonika A. Zmiana wielkości jednej litery zmienia finalny portfel.

**Rekomendacja:** używać tylko dla zgodności i testów. Przed wpłatą środków odtworzyć portfel na niezależnym, czystym środowisku oraz zweryfikować mnemonic i adres znak po znaku.

### AUD-04 — 24-bitowy tag nie uwierzytelnia danych

**Poziom:** 🔵 niski

**Status:** zgodny z projektem

Tag wykrywa typowe pomyłki z prawdopodobieństwem przypadkowego fałszywego zaakceptowania około `1 / 2^24`, ale nie jest MAC-em i nie chroni przed celową modyfikacją. Każdy, kto zna entropię, może obliczyć poprawny tag.

### AUD-05 — Wielkość liter zwiększa ryzyko błędu ręcznego

**Poziom:** 🔵 niski

**Status:** ograniczony walidacją, tagiem i formatem papierowym

Base52 skraca hasło bez usuwania bitów, ale `a` i `A` są różnymi cyframi. Autokorekta, nieczytelny charakter pisma lub przepisanie małymi literami zmieni wynik. Czwarte pole z liczbą słów pomaga w diagnostyce, lecz nie naprawia błędu.

### AUD-06 — Brak pełnego fuzzingu i dowodu kryptograficznego

**Poziom:** 🔵 informacyjny

**Status:** otwarty

Testy obejmują wszystkie dozwolone długości entropii, obie wersje formatu, błędy kanoniczności i stały wektor legacy. Nie przeprowadzono jednak szerokiego fuzzingu/property testingu, analizy side-channel, reprodukowalnego builda ani niezależnego przeglądu kryptograficznego.

## Dobre praktyki obecne w kodzie

- ✅ walidacja sumy kontrolnej BIP-39 przed kodowaniem;
- ✅ deterministyczny round-trip dla `swd1` i `swd2`;
- ✅ wersjonowanie oraz kanoniczna długość i alfabet;
- ✅ porównanie tagu przez `timingSafeEqual`;
- ✅ przypięte wersje zależności i `package-lock.json`;
- ✅ małe drzewo produkcyjne oparte na rodzinie `@scure`/`@noble`;
- ✅ brak połączeń sieciowych i automatycznego zapisu sekretów w kodzie aplikacji;
- ✅ ukryty prompt interaktywny oraz testy negatywne.

## Priorytety dalszych prac

1. 🔴 Nie używać formatu jako 2FA ani równorzędnego podziału seeda.
2. 🟠 Dodać property-based testing/fuzzing parsera i round-tripu.
3. 🟠 Opublikować niezależne wektory zgodności dla większej liczby wejść legacy.
4. 🟡 Rozważyć osobny, wersjonowany format zaszyfrowanego backupu z uwierzytelnianiem zamiast skracania sekretu.
5. 🟡 Dodać udokumentowaną procedurę reprodukowalnej, odłączonej instalacji zależności.

## Werdykt użytkowy

Projekt nadaje się do edukacji, eksperymentów offline i testów na pustym portfelu. Ten audyt nie stanowi rekomendacji przechowywania realnych środków. Przed takim użyciem potrzebny jest niezależny audyt, pełny test odtworzeniowy i świadoma akceptacja ryzyka niestandardowego algorytmu.
