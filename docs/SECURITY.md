# Model bezpieczeństwa

## Co ten projekt zapewnia

- deterministyczny i bezstratny round-trip mnemonika BIP-39;
- lokalne działanie po instalacji zależności;
- walidację sumy kontrolnej BIP-39 przy kodowaniu;
- 24-bitowy tag wykrywający typowe błędy w haśle lub liczbie;
- brak automatycznego zapisu mnemonika, kodu odzyskiwania i kluczy prywatnych;
- ukrywanie znaków przy interaktywnym wprowadzaniu sekretów.

## Czego projekt nie zapewnia

- nie szyfruje mnemonika;
- nie zamienia seeda w łatwe do zapamiętania hasło;
- nie chroni przed złośliwym systemem, keyloggerem, przejętym schowkiem lub pamięcią procesu;
- nie odzyskuje hasła oryginalnego `wallet-decoder` z jego wyniku;
- nie zastępuje sprzętowego portfela, metalowego backupu ani audytu kryptograficznego.

Hasło `swd1` i liczba są razem równoważne mnemonicowi. Utrata jednego elementu uniemożliwia odzyskanie, a ujawnienie obu daje dostęp do portfela.

## Zalecany sposób użycia

1. Uruchom aplikację na czystym, odłączonym od sieci systemie.
2. Zweryfikuj hash i źródło Node.js oraz zależności.
3. Najpierw wykonaj próbę na mnemonic bez środków.
4. Sprawdź round-trip: `encode`, następnie `decode`, a wyniki porównaj znak po znaku.
5. Nie używaj schowka, historii terminala, synchronizowanych notatek ani zdjęć.
6. Przechowuj hasło i liczbę w dwóch kontrolowanych lokalizacjach, uwzględniając ryzyko trwałej utraty jednej części.
7. Nie traktuj 24-bitowego tagu jako ochrony przed celową modyfikacją.

## Hasło wybrane przez człowieka

Jeżeli wymagane jest krótkie, własne hasło, istnieją tylko dwa uczciwe warianty:

- seed od początku deterministycznie wyprowadzany z hasła — wtedy nie jest seedem wylosowanym przez SeedGenerator i jego bezpieczeństwo jest ograniczone entropią hasła;
- losowy seed z SeedGenerator przechowywany w zaszyfrowanym pliku odzyskiwania — wtedy samo hasło i liczba bez tego pliku nie wystarczą.

Format `swd1` wybiera trzeci wariant: bez dodatkowego pliku i bez utraty losowej entropii, ale kosztem dłuższego, maszynowo wyliczonego hasła odzyskiwania.
