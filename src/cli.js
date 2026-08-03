#!/usr/bin/env node

import { decodeRecoveryCode, encodeMnemonic } from './recovery-codec.js';
import { generateLegacyBitcoin } from './legacy-wallet-decoder.js';

const HELP = `
Seed Generator Wallet Decoder

Użycie:
  npm run encode              mnemonic BIP-39 -> hasło + liczba
  npm run decode              hasło + liczba -> ten sam mnemonic BIP-39
  npm run legacy:12|legacy:24
                              generator zgodny z hattimon/wallet-decoder dla Bitcoin
  npm --silent run encode:json|decode:json|legacy:json
                              warianty do automatyzacji przez stdin/stdout

Opcje:
  --json                      wynik w JSON
  --words 12|24               liczba słów w trybie legacy (domyślnie 24)
  --help                      ta pomoc

Sekrety są odczytywane bez wyświetlania znaków. Przy wejściu potokowym:
  encode oczekuje mnemonika w jednej wartości,
  decode oczekuje pełnego kodu swd1:hasło:liczba,
  legacy oczekuje JSON: {"password":"...","number":"...","wordCount":24}.
`;

class UserCancelledError extends Error {}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function optionValue(args, name, fallback) {
  const position = args.indexOf(name);
  if (position === -1) return fallback;
  if (!args[position + 1]) throw new Error(`Brak wartości opcji ${name}.`);
  return args[position + 1];
}

async function readAllStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8').trim();
}

async function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Ukryty prompt wymaga terminala. Użyj opisanego w --help wejścia potokowego.');
  }

  process.stdout.write(prompt);
  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let value = '';

    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          reject(new UserCancelledError('Przerwano przez użytkownika.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\b' || char === '\u007f') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (char >= ' ') {
          value += char;
          process.stdout.write('*');
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

function printEncodeResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\nKod odzyskiwania utworzony poprawnie:');
  console.log(`Hasło: ${result.password}`);
  console.log(`Liczba: ${result.number}`);
  console.log(`Pełny kod: ${result.recoveryCode}`);
  console.log(`Liczba słów: ${result.wordCount}`);
  console.log('\nTo nie jest szyfrowanie. Kod należy chronić dokładnie tak samo jak mnemonic.');
}

function printDecodeResult(result, json) {
  if (json) {
    console.log(JSON.stringify({
      format: result.format,
      mnemonic: result.mnemonic,
      wordCount: result.wordCount,
    }, null, 2));
    return;
  }

  console.log('\nOdtworzony mnemonic BIP-39:');
  console.log(result.mnemonic);
  console.log(`Liczba słów: ${result.wordCount}`);
}

async function runEncode(json) {
  const mnemonic = process.stdin.isTTY
    ? await readHidden('Wklej mnemonic BIP-39 z SeedGenerator: ')
    : await readAllStdin();
  printEncodeResult(encodeMnemonic(mnemonic), json);
}

async function runDecode(json) {
  const code = process.stdin.isTTY
    ? await readHidden('Wklej pełny kod swd1:hasło:liczba: ')
    : await readAllStdin();
  printDecodeResult(decodeRecoveryCode(code), json);
}

async function runLegacy(args, json) {
  const requestedWordCount = Number(optionValue(args, '--words', '24'));
  let input;
  if (process.stdin.isTTY) {
    input = {
      password: await readHidden('Hasło legacy (litery A-Z/a-z): '),
      number: await readHidden('Liczba sterująca: '),
      wordCount: requestedWordCount,
    };
  } else {
    const raw = await readAllStdin();
    try {
      input = JSON.parse(raw);
    } catch {
      throw new Error('Wejście potokowe legacy musi być poprawnym obiektem JSON.');
    }
  }

  const result = generateLegacyBitcoin({
    password: input.password,
    decodeNumber: input.number,
    wordCount: Number(input.wordCount ?? requestedWordCount),
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\nMnemonic wygenerowany algorytmem legacy:');
  console.log(result.mnemonic);
  console.log(`Adres Bitcoin: ${result.address}`);
  console.log(`Wzorzec binarny: ${result.binaryPattern}`);
  console.log('\nTryb legacy jest jednokierunkowy: mnemonika nie da się praktycznie odwrócić do hasła.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP.trim());
    return;
  }

  const command = args[0];
  const json = hasFlag(args, '--json');

  if (command === 'encode') return runEncode(json);
  if (command === 'decode') return runDecode(json);
  if (command === 'legacy') return runLegacy(args.slice(1), json);
  throw new Error(`Nieznane polecenie: ${command}. Użyj --help.`);
}

main().catch((error) => {
  if (!(error instanceof UserCancelledError)) console.error(`Błąd: ${error.message}`);
  process.exitCode = 1;
});
