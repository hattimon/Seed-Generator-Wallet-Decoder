import { createHash } from 'node:crypto';
import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

const BITCOIN_BIP44_PREFIX = "m/44'/0'/0'/0";
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export class LegacyGeneratorError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LegacyGeneratorError';
  }
}

function sha256(data) {
  return createHash('sha256').update(data).digest();
}

function textToMnemonic(text, wordCount) {
  const digest = sha256(Buffer.from(text, 'utf8'));
  const entropy = digest.subarray(0, wordCount === 24 ? 32 : 16);
  return entropyToMnemonic(entropy, wordlist);
}

function encodeBase58(bytes) {
  let value = BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
  let result = '';

  while (value > 0n) {
    result = BASE58_ALPHABET[Number(value % 58n)] + result;
    value /= 58n;
  }

  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) {
    leadingZeroes += 1;
  }

  return '1'.repeat(leadingZeroes) + result;
}

function publicKeyToP2pkhAddress(publicKey) {
  const publicKeyHash = createHash('ripemd160').update(sha256(publicKey)).digest();
  const payload = Buffer.concat([Buffer.from([0x00]), publicKeyHash]);
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return encodeBase58(Buffer.concat([payload, checksum]));
}

function parseDecodeNumber(input) {
  const text = typeof input === 'bigint' ? input.toString(10) : String(input);
  if (!/^(0|[1-9][0-9]*)$/u.test(text)) {
    throw new LegacyGeneratorError('Liczba sterująca musi być nieujemną liczbą całkowitą.');
  }
  return BigInt(text);
}

function assertKey(node) {
  if (!node.privateKey || !node.publicKey) {
    throw new LegacyGeneratorError('Nie udało się wyprowadzić pary kluczy BIP-32.');
  }
}

export function generateLegacyBitcoin({ password, decodeNumber, wordCount = 24 }) {
  if (typeof password !== 'string' || !/^[a-zA-Z]+$/u.test(password)) {
    throw new LegacyGeneratorError('Hasło legacy może zawierać wyłącznie litery A-Z i a-z.');
  }
  if (wordCount !== 12 && wordCount !== 24) {
    throw new LegacyGeneratorError('Tryb legacy obsługuje wyłącznie 12 albo 24 słowa.');
  }

  const number = parseDecodeNumber(decodeNumber);
  const binaryPattern = number.toString(2);
  let mnemonic = textToMnemonic(password, wordCount);
  let root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic));

  for (let index = 0; index < password.length; index += 1) {
    const letterIndex = password[index].toLowerCase().charCodeAt(0) - 96;
    const bit = index < binaryPattern.length ? binaryPattern[index] : '0';
    const child = root.derive(`${BITCOIN_BIP44_PREFIX}/${letterIndex}`);
    assertKey(child);

    const source = bit === '1'
      ? publicKeyToP2pkhAddress(child.publicKey)
      : Buffer.from(child.privateKey).toString('hex');

    mnemonic = textToMnemonic(source, wordCount);
    root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic));
  }

  const finalNode = root.derive(`${BITCOIN_BIP44_PREFIX}/0`);
  assertKey(finalNode);

  return {
    algorithm: 'hattimon/wallet-decoder-compatible',
    network: 'bitcoin',
    wordCount,
    binaryPattern,
    mnemonic,
    address: publicKeyToP2pkhAddress(finalNode.publicKey),
  };
}
