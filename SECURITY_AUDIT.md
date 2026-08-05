# 🛡️ Audyt bezpieczeństwa — 2026-08-05

## Podsumowanie

Ręczny audyt wersji `1.1.0` na bazowym commicie `7d42bd2` nie wykazał krytycznej ani wysokiej podatności implementacyjnej w odwracalnym round-tripie `swd1`/`swd2` ani w sprawdzonym wektorze zgodności `wallet-decoder`. Projekt pozostaje jednak eksperymentalnym, niestandardowym kodekiem i nie przeszedł formalnego audytu kryptograficznego przez wyspecjalizowaną firmę.

Para `hasło + liczba` jest zgodnie z założeniem jednym, gęstszym zapisem pełnej entropii. Wewnętrzny podział `216 + 40 bitów` nie ogranicza 256-bitowej entropii kompletnego kodu i nie stanowi podatności kodeka. Najistotniejsze ryzyka znajdują się przed kodekiem i wokół niego: ograniczona lub przejęta entropia, zmodyfikowany generator, zainfekowane środowisko oraz przechwycenie sekretów podczas wejścia, wyjścia albo pracy procesu.

| Poziom | Liczba |
| --- | ---: |
| 🔴 Krytyczny | 0 |
| 🟠 Wysoki — implementacja | 0 |
| 🟡 Średni | 2 |
| 🔵 Niski / informacyjny | 4 |

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
npm audit signatures      -> podpisy i attestacje 5/5 pakietów zweryfikowane
```

Wynik `npm audit` jest migawką z dnia audytu, a nie gwarancją braku przyszłych lub nieznanych podatności.

## Audyt aktualnego środowiska

Przegląd wykonano 5 sierpnia 2026 r. w środowisku Windows x64 z Node.js `22.17.1`, npm `10.9.2` i Git `2.50.1.windows.1`.

- kod w `src/` nie importuje modułów sieciowych i nie wykonuje `fetch`, WebSocket ani automatycznego zapisu plików;
- zainstalowane drzewo produkcyjne zawiera 5 przypiętych pakietów `@scure`/`@noble`;
- nie znaleziono skryptów lifecycle `preinstall`, `install` ani `postinstall` w zainstalowanych pakietach;
- `npm audit --omit=dev` zgłosił 0 znanych podatności;
- `npm audit signatures` potwierdził podpisy rejestru oraz attestacje wszystkich 5 pakietów;
- środowisko miało aktywne fizyczne i wirtualne interfejsy sieciowe, dlatego nie było środowiskiem offline odpowiednim do przetwarzania prawdziwego mnemonika;
- status ochrony antywirusowej nie był dostępny w kontekście audytu, więc nie można potwierdzić braku malware, keyloggera ani narzędzia przechwytującego ekran lub schowek.

Ten wynik potwierdza właściwości sprawdzonej konfiguracji, ale nie certyfikuje komputera użytkownika. Brak wykrytej funkcji sieciowej w aplikacji nie chroni przed złośliwym systemem operacyjnym lub innym procesem działającym na tym samym urządzeniu.

## Ustalenia

### AUD-01 — Podział reprezentacji `hasło + liczba`

**Poziom:** 🔵 informacyjny

**Status:** zgodny z założonym modelem

Dla 24 słów BIP-39 kodek dzieli 256 bitów entropii na:

- 216-bitowy prefiks kodowany w haśle;
- 40-bitowy ogon zapisany w liczbie;
- 24-bitowy tag i nagłówek, które nie są tajne.

Kompletny rekord zachowuje wszystkie 256 bitów entropii. Rozkład informacji pomiędzy polami nie obniża bezpieczeństwa pełnego kodu, ponieważ projekt nie traktuje pól jako 2FA ani niezależnych udziałów sekretu. Znajomość kompletnego kodu jest równoważna znajomości mnemonika i tak należy go chronić.

**Rekomendacja:** opisywać `hasło + liczba` jako jeden alternatywny zapis pełnego sekretu. Analiza pojedynczych pól ma znaczenie wyłącznie wtedy, gdy użytkownik sam nada im rolę granicy bezpieczeństwa, czego projekt nie zakłada.

### ENV-01 — Źródło entropii i integralność środowiska

**Poziom skutków:** 🟠 wysoki poza kodekiem

**Status:** zależny od użytkownika i sposobu uruchomienia

Kodek zachowuje dostarczone bity, ale nie może udowodnić, że pierwotna entropia była losowa, nieobciążona i wygenerowana przez niezmodyfikowane oprogramowanie. Przejęty SeedGenerator, przewidywalne źródło losowości, keylogger, malware, zdalny dostęp, nagrywanie ekranu lub aktywna synchronizacja schowka mogą ujawnić sekret niezależnie od poprawności SWD1/SWD2.

**Rekomendacja:** zweryfikować generator i zależności przed odłączeniem urządzenia, a operację wykonać na czystym, dedykowanym systemie z fizycznie odłączoną siecią i wyłączonymi interfejsami radiowymi. Najpierw przeprowadzić pełny test na pustym portfelu.

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

1. 🔴 Zweryfikować źródło entropii, generator i środowisko przed użyciem prawdziwego sekretu.
2. 🟠 Dodać property-based testing/fuzzing parsera i round-tripu.
3. 🟠 Opublikować niezależne wektory zgodności dla większej liczby wejść legacy.
4. 🟡 Dodać udokumentowaną procedurę reprodukowalnej, odłączonej instalacji zależności.

## Werdykt użytkowy

Pełny kod SWD1/SWD2 zachowuje źródłową entropię i nie traci jej wskutek podziału na `hasło + liczba`. W sprawdzonym kodzie nie znaleziono krytycznej ani wysokiej podatności implementacyjnej. Największe praktyczne ryzyko stanowi jakość entropii oraz urządzenie, na którym sekret jest generowany i przetwarzany. Badane środowisko było połączone z siecią, dlatego nie powinno być używane do prawdziwego mnemonika. Projekt pozostaje przeznaczony do edukacji, eksperymentów offline i testów na pustym portfelu do czasu formalnego audytu kryptograficznego.
