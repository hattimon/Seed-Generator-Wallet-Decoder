# Seed Generator Wallet Decoder

Lokalne narzędzie do **dokładnego, odwracalnego** przekształcania angielskiego mnemonika BIP-39 na parę `hasło + liczba` i z powrotem.

Projekt powstał jako bezpieczna realizacja przepływu łączącego:

- [Rav3nPL/SeedGenerator](https://github.com/Rav3nPL/SeedGenerator/tree/master) — źródło mnemonika wygenerowanego z kart i czasu kliknięć,
- [hattimon/wallet-decoder](https://github.com/hattimon/wallet-decoder) — inspirację interfejsem `hasło + liczba` oraz osobny tryb zgodności dla Bitcoin.

## Najważniejsze ograniczenie oryginalnej metody

`wallet-decoder` nie dekoduje seeda do hasła. Jest generatorem jednokierunkowym:

```text
hasło + liczba -> SHA-256 -> BIP-39 -> BIP-44 -> kolejne SHA-256 -> mnemonic
```

Nie da się praktycznie znaleźć hasła i liczby, które odtworzą dowolny, wcześniej losowo wygenerowany mnemonic z SeedGenerator. Dlatego projekt ma dwa rozdzielone tryby:

1. `encode` / `decode` — odwracalny format `swd1`, który gwarantuje odzyskanie identycznego mnemonika;
2. `legacy` — zgodny z algorytmem `wallet-decoder` dla domyślnej sieci Bitcoin, ale celowo opisany jako jednokierunkowy.

## Przepływ właściwy dla tego projektu

```text
SeedGenerator -> mnemonic BIP-39 -> encode -> hasło + liczba
                                               |
                                               v
ten sam mnemonic BIP-39 <- decode <------------+
```

Hasło `swd1` jest wyliczanym kodem odzyskiwania, a nie dowolnym hasłem wybranym przez użytkownika. Para `hasło + liczba` zawiera tę samą tajną entropię co mnemonic i musi być chroniona równie starannie.

## Wymagania i instalacja

- Node.js 22 lub nowszy;
- Git;
- internet jest potrzebny tylko do sklonowania repozytorium i wykonania `npm ci`;
- wszystkie operacje na seedzie odbywają się lokalnie.

### Windows PowerShell

```powershell
git clone https://github.com/hattimon/Seed-Generator-Wallet-Decoder.git
Set-Location Seed-Generator-Wallet-Decoder
npm ci
npm run check
```

### Linux / macOS

```bash
git clone https://github.com/hattimon/Seed-Generator-Wallet-Decoder.git
cd Seed-Generator-Wallet-Decoder
npm ci
npm run check
```

Zależności są przypięte do konkretnych wersji w `package-lock.json`.

### Uruchamianie

```powershell
npm run encode
npm run decode
npm run legacy:12
npm run legacy:24
```

### Aktualizacja istniejącej instalacji

```powershell
git pull origin main
npm ci
npm run check
```

## Użycie

### 1. SeedGenerator -> hasło i liczba

Wygeneruj mnemonic w SeedGenerator, zamknij inne aplikacje i uruchom:

```powershell
npm run encode
```

Wklej mnemonic do ukrytego promptu. Program zwróci:

- hasło z małych liter `a-z`,
- liczbę dziesiętną,
- pełny kod w formacie `swd1:hasło:liczba`.

### 2. Hasło i liczba -> identyczny seed

```powershell
npm run decode
```

Wklej pełny kod `swd1:hasło:liczba`. Program zweryfikuje sumę kontrolną i odtworzy dokładnie ten sam mnemonic.

### 3. Tryb zgodności z wallet-decoder

```powershell
npm run legacy:24
```

Użyj `legacy:12` albo `legacy:24`. Obsługiwana jest sieć Bitcoin (domyślna ścieżka `m/44'/0'/0'/0/index`). Ten tryb zachowuje regułę liter `A-Z/a-z`, binarny wzorzec liczby oraz wybór klucza prywatnego/adresu publicznego z oryginału. Wyniku nie można odwrócić do hasła.

## Automatyzacja bez argumentów zawierających sekrety

Przy wejściu potokowym `encode` przyjmuje mnemonic, a `decode` pełny kod. Nie przekazuj prawdziwego seeda jako argumentu procesu ani nie zapisuj go w historii powłoki.

```powershell
Get-Content -Raw .\mnemonic.txt | npm --silent run encode:json
Get-Content -Raw .\recovery-code.txt | npm --silent run decode:json
```

Po użyciu bezpiecznie usuń pliki tymczasowe zgodnie z zasadami swojego systemu. Program sam nie zapisuje seedów ani kluczy na dysku.

## Weryfikacja

```powershell
npm run check
```

Testy obejmują wszystkie długości entropii BIP-39: 128, 160, 192, 224 i 256 bitów, oficjalny wektor zerowej entropii, wykrywanie zmian hasła/liczby oraz wektor trybu legacy porównany z oryginalnym skryptem.

Przed użyciem z realnymi środkami wykonaj niezależny audyt kodu i test na pustym portfelu. Szczegóły formatu są w [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), a model bezpieczeństwa w [docs/SECURITY.md](./docs/SECURITY.md).
