import assert from 'node:assert/strict';
import test from 'node:test';
import { generateLegacyBitcoin, LegacyGeneratorError } from '../src/legacy-wallet-decoder.js';

test('legacy Bitcoin jest deterministyczny dla tych samych danych', () => {
  const input = { password: 'Test', decodeNumber: '13', wordCount: 12 };
  const first = generateLegacyBitcoin(input);
  const second = generateLegacyBitcoin(input);

  assert.deepEqual(second, first);
  assert.equal(first.binaryPattern, '1101');
  assert.equal(
    first.mnemonic,
    'word feature face pepper patrol brother play jewel neglect risk clip brass',
  );
  assert.equal(first.address, '17vumvw4vNSoVHvvCwXq8fJkvhM5QxnvZD');
});

test('legacy odrzuca dane spoza kontraktu oryginału', () => {
  assert.throws(
    () => generateLegacyBitcoin({ password: 'haslo-1', decodeNumber: 1, wordCount: 12 }),
    LegacyGeneratorError,
  );
  assert.throws(
    () => generateLegacyBitcoin({ password: 'Haslo', decodeNumber: -1, wordCount: 12 }),
    LegacyGeneratorError,
  );
  assert.throws(
    () => generateLegacyBitcoin({ password: 'Haslo', decodeNumber: 1, wordCount: 15 }),
    LegacyGeneratorError,
  );
});
