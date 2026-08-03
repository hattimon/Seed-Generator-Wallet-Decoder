import { createHash, timingSafeEqual } from 'node:crypto';
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

const FORMAT_CONFIGS = Object.freeze({
  swd1: Object.freeze({
    name: 'swd1',
    version: 1,
    alphabet: 'abcdefghijklmnopqrstuvwxyz',
    tagDomain: Buffer.from('SeedGeneratorWalletDecoder/recovery-v1\0', 'utf8'),
  }),
  swd2: Object.freeze({
    name: 'swd2',
    version: 2,
    alphabet: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    tagDomain: Buffer.from('SeedGeneratorWalletDecoder/recovery-v2\0', 'utf8'),
  }),
});
const DEFAULT_FORMAT = 'swd2';
const TAIL_BITS = 40;
const TAG_BITS = 24;
const PAYLOAD_BITS = TAIL_BITS + TAG_BITS;
const TAIL_MASK = (1n << BigInt(TAIL_BITS)) - 1n;
const TAG_MASK = (1n << BigInt(TAG_BITS)) - 1n;
const ENTROPY_LENGTHS = [16, 20, 24, 28, 32];

export class RecoveryCodeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecoveryCodeError';
  }
}

function normalizeMnemonic(mnemonic) {
  if (typeof mnemonic !== 'string') {
    throw new RecoveryCodeError('Mnemonic musi być tekstem.');
  }

  return mnemonic.trim().split(/\s+/u).join(' ');
}

function bytesToBigInt(bytes) {
  const hex = Buffer.from(bytes).toString('hex');
  return BigInt(`0x${hex}`);
}

function bigIntToBytes(value, byteLength) {
  if (value < 0n || value >= (1n << BigInt(byteLength * 8))) {
    throw new RecoveryCodeError('Wartość nie mieści się w oczekiwanej długości entropii.');
  }

  const hex = value.toString(16).padStart(byteLength * 2, '0');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

function passwordLengthForBits(bitLength, radix) {
  const limit = 1n << BigInt(bitLength);
  let capacity = 1n;
  let length = 0;

  while (capacity < limit) {
    capacity *= BigInt(radix);
    length += 1;
  }

  return length;
}

function encodeBase(value, length, alphabet) {
  let remaining = value;
  const radix = BigInt(alphabet.length);
  const chars = new Array(length).fill(alphabet[0]);

  for (let position = length - 1; position >= 0; position -= 1) {
    chars[position] = alphabet[Number(remaining % radix)];
    remaining /= radix;
  }

  if (remaining !== 0n) {
    throw new RecoveryCodeError('Wewnętrzny błąd kodowania hasła odzyskiwania.');
  }

  return chars.join('');
}

function decodeBase(password, format) {
  let value = 0n;
  const radix = BigInt(format.alphabet.length);

  for (const char of password) {
    const digit = format.alphabet.indexOf(char);
    if (digit === -1) {
      const allowed = format.name === 'swd1' ? 'małe litery a-z' : 'litery a-z oraz A-Z';
      throw new RecoveryCodeError(`Hasło ${format.name} może zawierać wyłącznie ${allowed}.`);
    }
    value = value * radix + BigInt(digit);
  }

  return value;
}

function calculateTag(entropy, format) {
  return createHash('sha256')
    .update(format.tagDomain)
    .update(entropy)
    .digest()
    .subarray(0, TAG_BITS / 8);
}

function assertSupportedEntropy(entropy) {
  const lengthCode = ENTROPY_LENGTHS.indexOf(entropy.length);
  if (lengthCode === -1) {
    throw new RecoveryCodeError('Obsługiwane są mnemoniki BIP-39 mające 12, 15, 18, 21 lub 24 słowa.');
  }
  return lengthCode;
}

function parseNumber(number) {
  const text = typeof number === 'bigint' ? number.toString(10) : String(number);
  if (!/^(0|[1-9][0-9]*)$/u.test(text)) {
    throw new RecoveryCodeError('Liczba odzyskiwania musi być nieujemną liczbą dziesiętną bez zer wiodących.');
  }
  return BigInt(text);
}

function getFormatByName(name) {
  const format = FORMAT_CONFIGS[name];
  if (!format) {
    throw new RecoveryCodeError('Obsługiwane formaty kodowania to swd1 i swd2.');
  }
  return format;
}

function getFormatByVersion(version) {
  return Object.values(FORMAT_CONFIGS).find((format) => format.version === version);
}

export function encodeEntropy(entropyInput, { format: formatName = DEFAULT_FORMAT } = {}) {
  const entropy = Uint8Array.from(entropyInput);
  const format = getFormatByName(formatName);
  const lengthCode = assertSupportedEntropy(entropy);
  const entropyBits = entropy.length * 8;
  const prefixBits = entropyBits - TAIL_BITS;
  const entropyValue = bytesToBigInt(entropy);
  const prefix = entropyValue >> BigInt(TAIL_BITS);
  const tail = entropyValue & TAIL_MASK;
  const passwordLength = passwordLengthForBits(prefixBits, format.alphabet.length);
  const password = encodeBase(prefix, passwordLength, format.alphabet);
  const tag = bytesToBigInt(calculateTag(entropy, format));
  const header = (BigInt(format.version) << 3n) | BigInt(lengthCode);
  const number = (header << BigInt(PAYLOAD_BITS)) | (tail << BigInt(TAG_BITS)) | tag;
  const wordCount = (entropyBits + entropyBits / 32) / 11;

  return {
    format: format.name,
    password,
    number: number.toString(10),
    recoveryCode: `${format.name}:${password}:${number}`,
    paperCode: `${format.name}:${password}:${number}:${wordCount}`,
    wordCount,
  };
}

export function decodeCredentials(password, numberInput, expectedFormatName) {
  if (typeof password !== 'string') {
    throw new RecoveryCodeError('Hasło odzyskiwania musi być tekstem.');
  }

  const number = parseNumber(numberInput);
  const suppliedTag = number & TAG_MASK;
  const tail = (number >> BigInt(TAG_BITS)) & TAIL_MASK;
  const header = number >> BigInt(PAYLOAD_BITS);
  const version = Number(header >> 3n);
  const lengthCode = Number(header & 0b111n);
  const format = getFormatByVersion(version);

  if (!format || !Number.isInteger(lengthCode) || !ENTROPY_LENGTHS[lengthCode]) {
    throw new RecoveryCodeError('Nieobsługiwana wersja lub uszkodzony nagłówek liczby odzyskiwania.');
  }
  if (expectedFormatName && format.name !== expectedFormatName) {
    throw new RecoveryCodeError('Prefiks kodu nie pasuje do wersji zapisanej w liczbie odzyskiwania.');
  }

  const entropyLength = ENTROPY_LENGTHS[lengthCode];
  const prefixBits = entropyLength * 8 - TAIL_BITS;
  const expectedPasswordLength = passwordLengthForBits(prefixBits, format.alphabet.length);
  if (password.length !== expectedPasswordLength) {
    throw new RecoveryCodeError(`Nieprawidłowa długość hasła: oczekiwano ${expectedPasswordLength} liter.`);
  }

  const prefix = decodeBase(password, format);
  if (prefix >= (1n << BigInt(prefixBits))) {
    throw new RecoveryCodeError('Hasło odzyskiwania jest poza zakresem tego formatu.');
  }

  const entropyValue = (prefix << BigInt(TAIL_BITS)) | tail;
  const entropy = bigIntToBytes(entropyValue, entropyLength);
  const expectedTag = calculateTag(entropy, format);
  const suppliedTagBytes = bigIntToBytes(suppliedTag, TAG_BITS / 8);
  if (!timingSafeEqual(Buffer.from(expectedTag), Buffer.from(suppliedTagBytes))) {
    throw new RecoveryCodeError('Suma kontrolna nie pasuje. Hasło lub liczba są błędne.');
  }

  const mnemonic = entropyToMnemonic(entropy, wordlist);
  return {
    format: format.name,
    mnemonic,
    entropyHex: Buffer.from(entropy).toString('hex'),
    wordCount: mnemonic.split(' ').length,
  };
}

export function encodeMnemonic(mnemonicInput, options) {
  const mnemonic = normalizeMnemonic(mnemonicInput);
  let entropy;

  try {
    entropy = mnemonicToEntropy(mnemonic, wordlist);
  } catch {
    throw new RecoveryCodeError('Nieprawidłowy angielski mnemonic BIP-39 lub błędna suma kontrolna.');
  }

  return encodeEntropy(entropy, options);
}

export function decodeRecoveryCode(recoveryCode) {
  if (typeof recoveryCode !== 'string') {
    throw new RecoveryCodeError('Kod odzyskiwania musi być tekstem.');
  }

  const parts = recoveryCode.trim().split(':');
  if (![3, 4].includes(parts.length) || !FORMAT_CONFIGS[parts[0]]) {
    throw new RecoveryCodeError('Kod musi mieć postać format:hasło:liczba albo format:hasło:liczba:liczba_słów.');
  }

  const result = decodeCredentials(parts[1], parts[2], parts[0]);
  if (parts.length === 4) {
    if (!/^(12|15|18|21|24)$/u.test(parts[3]) || Number(parts[3]) !== result.wordCount) {
      throw new RecoveryCodeError('Jawna liczba słów nie zgadza się z długością zapisaną w kodzie.');
    }
  }

  return result;
}
