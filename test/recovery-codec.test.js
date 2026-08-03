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

  assert.equal(encoded.password, 'a'.repeat(19));
  assert.equal(encoded.wordCount, 12);
  assert.equal(decoded.mnemonic, ZERO_ENTROPY_MNEMONIC);
  assert.equal(decoded.entropyHex, '00'.repeat(16));
});

for (const byteLength of [16, 20, 24, 28, 32]) {
  test(`round-trip dla ${byteLength * 8} bitów entropii`, () => {
    const entropy = Uint8Array.from({ length: byteLength }, (_, index) => (index * 37 + byteLength) & 0xff);
    const mnemonic = entropyToMnemonic(entropy, wordlist);
    const encoded = encodeEntropy(entropy);
    const decoded = decodeCredentials(encoded.password, encoded.number);

    assert.equal(decoded.mnemonic, mnemonic);
    assert.equal(decoded.entropyHex, Buffer.from(entropy).toString('hex'));
  });
}

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
  assert.throws(() => decodeCredentials(encoded.password.toUpperCase(), encoded.number), RecoveryCodeError);
  assert.throws(() => decodeRecoveryCode(`swd2:${encoded.password}:${encoded.number}`), RecoveryCodeError);
  assert.throws(() => decodeCredentials(encoded.password, `0${encoded.number}`), RecoveryCodeError);
});
