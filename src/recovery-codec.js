import { createHash, timingSafeEqual } from 'node:crypto';
import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

const FORMAT_NAME = 'swd1';
const FORMAT_VERSION = 1;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const TAIL_BITS = 40;
const TAG_BITS = 24;
const PAYLOAD_BITS = TAIL_BITS + TAG_BITS;
const TAIL_MASK = (1n << BigInt(TAIL_BITS)) - 1n;
const TAG_MASK = (1n << BigInt(TAG_BITS)) - 1n;
const ENTROPY_LENGTHS = [16, 20, 24, 28, 32];
const TAG_DOMAIN = Buffer.from('SeedGeneratorWalletDecoder/recovery-v1\0', 'utf8');

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

function passwordLengthForBits(bitLength) {
  const limit = 1n << BigInt(bitLength);
  let capacity = 1n;
  let length = 0;

  while (capacity < limit) {
    capacity *= 26n;
    length += 1;
  }

  return length;
}

function encodeBase26(value, length) {
  let remaining = value;
  const chars = new Array(length).fill('a');

  for (let position = length - 1; position >= 0; position -= 1) {
    chars[position] = ALPHABET[Number(remaining % 26n)];
    remaining /= 26n;
  }

  if (remaining !== 0n) {
    throw new RecoveryCodeError('Wewnętrzny błąd kodowania hasła odzyskiwania.');
  }

  return chars.join('');
}

function decodeBase26(password) {
  let value = 0n;

  for (const char of password) {
    const digit = char.charCodeAt(0) - 97;
    if (digit < 0 || digit >= 26) {
      throw new RecoveryCodeError('Hasło odzyskiwania może zawierać tylko małe litery a-z.');
    }
    value = value * 26n + BigInt(digit);
  }

  return value;
}

function calculateTag(entropy) {
  return createHash('sha256')
    .update(TAG_DOMAIN)
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

export function encodeEntropy(entropyInput) {
  const entropy = Uint8Array.from(entropyInput);
  const lengthCode = assertSupportedEntropy(entropy);
  const entropyBits = entropy.length * 8;
  const prefixBits = entropyBits - TAIL_BITS;
  const entropyValue = bytesToBigInt(entropy);
  const prefix = entropyValue >> BigInt(TAIL_BITS);
  const tail = entropyValue & TAIL_MASK;
  const passwordLength = passwordLengthForBits(prefixBits);
  const password = encodeBase26(prefix, passwordLength);
  const tag = bytesToBigInt(calculateTag(entropy));
  const header = (BigInt(FORMAT_VERSION) << 3n) | BigInt(lengthCode);
  const number = (header << BigInt(PAYLOAD_BITS)) | (tail << BigInt(TAG_BITS)) | tag;

  return {
    format: FORMAT_NAME,
    password,
    number: number.toString(10),
    recoveryCode: `${FORMAT_NAME}:${password}:${number}`,
    wordCount: (entropyBits + entropyBits / 32) / 11,
  };
}

export function decodeCredentials(password, numberInput) {
  if (typeof password !== 'string') {
    throw new RecoveryCodeError('Hasło odzyskiwania musi być tekstem.');
  }

  const number = parseNumber(numberInput);
  const suppliedTag = number & TAG_MASK;
  const tail = (number >> BigInt(TAG_BITS)) & TAIL_MASK;
  const header = number >> BigInt(PAYLOAD_BITS);
  const version = Number(header >> 3n);
  const lengthCode = Number(header & 0b111n);

  if (version !== FORMAT_VERSION || !Number.isInteger(lengthCode) || !ENTROPY_LENGTHS[lengthCode]) {
    throw new RecoveryCodeError('Nieobsługiwana wersja lub uszkodzony nagłówek liczby odzyskiwania.');
  }

  const entropyLength = ENTROPY_LENGTHS[lengthCode];
  const prefixBits = entropyLength * 8 - TAIL_BITS;
  const expectedPasswordLength = passwordLengthForBits(prefixBits);
  if (password.length !== expectedPasswordLength) {
    throw new RecoveryCodeError(`Nieprawidłowa długość hasła: oczekiwano ${expectedPasswordLength} liter.`);
  }

  const prefix = decodeBase26(password);
  if (prefix >= (1n << BigInt(prefixBits))) {
    throw new RecoveryCodeError('Hasło odzyskiwania jest poza zakresem tego formatu.');
  }

  const entropyValue = (prefix << BigInt(TAIL_BITS)) | tail;
  const entropy = bigIntToBytes(entropyValue, entropyLength);
  const expectedTag = calculateTag(entropy);
  const suppliedTagBytes = bigIntToBytes(suppliedTag, TAG_BITS / 8);
  if (!timingSafeEqual(Buffer.from(expectedTag), Buffer.from(suppliedTagBytes))) {
    throw new RecoveryCodeError('Suma kontrolna nie pasuje. Hasło lub liczba są błędne.');
  }

  const mnemonic = entropyToMnemonic(entropy, wordlist);
  return {
    format: FORMAT_NAME,
    mnemonic,
    entropyHex: Buffer.from(entropy).toString('hex'),
    wordCount: mnemonic.split(' ').length,
  };
}

export function encodeMnemonic(mnemonicInput) {
  const mnemonic = normalizeMnemonic(mnemonicInput);
  let entropy;

  try {
    entropy = mnemonicToEntropy(mnemonic, wordlist);
  } catch {
    throw new RecoveryCodeError('Nieprawidłowy angielski mnemonic BIP-39 lub błędna suma kontrolna.');
  }

  return encodeEntropy(entropy);
}

export function decodeRecoveryCode(recoveryCode) {
  if (typeof recoveryCode !== 'string') {
    throw new RecoveryCodeError('Kod odzyskiwania musi być tekstem.');
  }

  const parts = recoveryCode.trim().split(':');
  if (parts.length !== 3 || parts[0] !== FORMAT_NAME) {
    throw new RecoveryCodeError(`Kod musi mieć postać ${FORMAT_NAME}:hasło:liczba.`);
  }

  return decodeCredentials(parts[1], parts[2]);
}
