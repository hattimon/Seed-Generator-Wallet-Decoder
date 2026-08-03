import assert from 'node:assert/strict';
import test from 'node:test';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import {
  RecoveryCodeError,
  decodeCredentials,
  decodeRecoveryCode,
  encodeEntropy,
  encodeMnemonic,
} from '../src/recovery-codec.js';

const ZERO_ENTROPY_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('koduje i odtwarza oficjalny wektor BIP-39 z zerową entropią', () => {
  const encoded = encodeMnemonic(ZERO_ENTROPY_MNEMONIC);
  const decoded = decodeRecoveryCode(encoded.recoveryCode);

  assert.equal(encoded.format, 'swd2');
  assert.equal(encoded.password, 'a'.repeat(16));
  assert.equal(encoded.paperCode, `${encoded.recoveryCode}:12`);
  assert.equal(encoded.wordCount, 12);
  assert.equal(decoded.mnemonic, ZERO_ENTROPY_MNEMONIC);
  assert.equal(decoded.entropyHex, '00'.repeat(16));
  assert.equal(decodeRecoveryCode(encoded.paperCode).mnemonic, ZERO_ENTROPY_MNEMONIC);
});

test('zachowuje dokładny format i dekodowanie istniejącego wektora swd1', () => {
  const encoded = encodeMnemonic(ZERO_ENTROPY_MNEMONIC, { format: 'swd1' });
  const expectedCode = `swd1:${'a'.repeat(19)}:147573952589691405100`;

  assert.equal(encoded.recoveryCode, expectedCode);
  assert.equal(decodeRecoveryCode(expectedCode).mnemonic, ZERO_ENTROPY_MNEMONIC);
});

for (const format of ['swd1', 'swd2']) {
  for (const byteLength of [16, 20, 24, 28, 32]) {
    test(`round-trip ${format} dla ${byteLength * 8} bitów entropii`, () => {
      const entropy = Uint8Array.from({ length: byteLength }, (_, index) => (index * 37 + byteLength) & 0xff);
      const mnemonic = entropyToMnemonic(entropy, wordlist);
      const encoded = encodeEntropy(entropy, { format });
      const decoded = decodeCredentials(encoded.password, encoded.number);

      assert.equal(encoded.format, format);
      assert.equal(decoded.mnemonic, mnemonic);
      assert.equal(decoded.entropyHex, Buffer.from(entropy).toString('hex'));
    });
  }
}

test('swd2 zachowuje entropię w krótszym haśle base52', () => {
  const entropy = new Uint8Array(32).fill(0xff);
  const swd1 = encodeEntropy(entropy, { format: 'swd1' });
  const swd2 = encodeEntropy(entropy, { format: 'swd2' });

  assert.equal(swd1.password.length, 46);
  assert.equal(swd2.password.length, 38);
  assert.ok(swd2.password.length < swd1.password.length);
  assert.match(swd2.password, /^[a-zA-Z]+$/u);
  assert.match(swd2.password, /[A-Z]/u);
  assert.equal(decodeRecoveryCode(swd2.recoveryCode).entropyHex, 'ff'.repeat(32));
});

test('normalizuje białe znaki na wejściu mnemonika', () => {
  const noisy = `  ${ZERO_ENTROPY_MNEMONIC.split(' ').join('  \n ')}  `;
  const encoded = encodeMnemonic(noisy);
  assert.equal(decodeRecoveryCode(encoded.recoveryCode).mnemonic, ZERO_ENTROPY_MNEMONIC);
});

test('odrzuca mnemonic z błędną sumą kontrolną', () => {
  const invalid = ZERO_ENTROPY_MNEMONIC.replace(/about$/u, 'abandon');
  assert.throws(() => encodeMnemonic(invalid), RecoveryCodeError);
});

test('wykrywa zmianę liczby odzyskiwania', () => {
  const encoded = encodeMnemonic(ZERO_ENTROPY_MNEMONIC);
  const changedNumber = (BigInt(encoded.number) ^ 1n).toString(10);
  assert.throws(() => decodeCredentials(encoded.password, changedNumber), /Suma kontrolna/u);
});

test('odrzuca niekanoniczne lub uszkodzone dane', () => {
  const encoded = encodeMnemonic(ZERO_ENTROPY_MNEMONIC);
  const changedCase = `A${encoded.password.slice(1)}`;

  assert.throws(() => decodeCredentials(changedCase, encoded.number), RecoveryCodeError);
  assert.throws(() => decodeCredentials(`1${encoded.password.slice(1)}`, encoded.number), RecoveryCodeError);
  assert.throws(() => decodeRecoveryCode(`swd1:${encoded.password}:${encoded.number}`), RecoveryCodeError);
  assert.throws(() => decodeRecoveryCode(`${encoded.recoveryCode}:24`), /liczba słów/u);
  assert.throws(() => decodeCredentials(encoded.password, `0${encoded.number}`), RecoveryCodeError);
});
