/*
 * crypto.js — password-based authenticated encryption for connection codes,
 * plus passphrase generation and strength estimation.
 *
 * Packet layout (binary, big-endian):
 *
 *   offset  size  field
 *   0       1     format version (1)
 *   1       1     flags (opaque to this module; the codec stores type/compression)
 *   2       1     PBKDF2 iterations / 10 000
 *   3       16    random PBKDF2 salt (fresh for every code)
 *   19      12    random AES-GCM IV
 *   31      2     length of the ciphertext incl. the 16-byte GCM tag
 *   33      n     ciphertext
 *
 * The whole 33-byte header is passed to AES-GCM as additional authenticated
 * data, so the version, flags, KDF cost, salt and length can not be altered
 * without the tag check failing.
 */
(function (global) {
  'use strict';

  const SPV = global.SPV || (global.SPV = {});
  const { SPVError, utf8, concatBytes, randomBytes, randomInt } = SPV.Util || require('./util.js');

  const FORMAT_VERSION = 1;
  const ITER_UNIT = 10000;
  const DEFAULT_ITERATIONS = 600000; // OWASP 2023+ guidance for PBKDF2-HMAC-SHA256
  const SALT_LEN = 16;
  const IV_LEN = 12;
  const TAG_LEN = 16;
  const HEADER_LEN = 3 + SALT_LEN + IV_LEN + 2;

  const subtle = () => {
    const s = global.crypto && global.crypto.subtle;
    if (!s) throw new SPVError('NO_CRYPTO', 'Web Crypto API is unavailable (a secure context is required).');
    return s;
  };

  // ---- passwords ----------------------------------------------------------

  // 31 symbols: no I, L, O, 0, 1 — easy to read aloud and to type on a phone.
  const PASSPHRASE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const PASSPHRASE_SHAPE = /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/i;

  /** 16 random symbols in 4 groups of 4 ≈ 79 bits of entropy. */
  function generatePassphrase(groups = 4, size = 4) {
    const parts = [];
    for (let g = 0; g < groups; g++) {
      let part = '';
      for (let i = 0; i < size; i++) {
        // randomInt is bias-free for any max <= 256
        part += PASSPHRASE_ALPHABET[randomInt(PASSPHRASE_ALPHABET.length)];
      }
      parts.push(part);
    }
    return parts.join('-');
  }

  /**
   * Normalise what the user typed so that equivalent input derives the same
   * key on both devices: Unicode NFKC, no surrounding whitespace, and
   * case-insensitive matching for generated passphrases only.
   */
  function canonicalPassword(password) {
    const p = String(password).normalize('NFKC').trim();
    return PASSPHRASE_SHAPE.test(p) ? p.toUpperCase() : p;
  }

  const COMMON_PASSWORDS = [
    'password', 'passw0rd', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'qwertyuiop',
    'iloveyou', 'letmein1', 'welcome1', 'admin123', 'abc12345', '11111111', '00000000', 'sifre123',
    'parola123', 'sifresifre', 'turkiye1', 'galatasaray', 'fenerbahce', 'besiktas1',
  ];

  /**
   * Rough entropy estimate (bits) with a 0–4 score. Deliberately conservative:
   * it only needs to steer people away from guessable passwords, since the
   * encrypted code can be attacked offline by anyone who intercepts it.
   */
  function estimateStrength(password) {
    const p = canonicalPassword(password);
    if (!p) return { bits: 0, score: 0 };
    if (PASSPHRASE_SHAPE.test(p)) return { bits: 79, score: 4 };

    let pool = 0;
    if (/[a-z]/.test(p)) pool += 26;
    if (/[A-Z]/.test(p)) pool += 26;
    if (/[0-9]/.test(p)) pool += 10;
    if (/[^A-Za-z0-9]/.test(p)) pool += 33;
    if (/[^\x00-\x7f]/.test(p)) pool += 60;

    const chars = Array.from(p);
    const unique = new Set(chars.map((c) => c.toLowerCase())).size;
    // repeated characters add very little
    const effectiveLength = unique + (chars.length - unique) * 0.25;
    let bits = effectiveLength * Math.log2(Math.max(pool, 2));

    const lower = p.toLowerCase();
    if (COMMON_PASSWORDS.some((w) => lower.includes(w))) bits = Math.min(bits, 12);
    if (/^(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf|zxcv)/i.test(p)) bits *= 0.6;
    if (/^(.)\1+$/.test(p)) bits = Math.min(bits, 6);

    bits = Math.round(bits);
    const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 56 ? 2 : bits < 72 ? 3 : 4;
    return { bits, score };
  }

  // ---- key derivation + AEAD ---------------------------------------------

  async function deriveKey(password, salt, iterations) {
    const material = await subtle().importKey('raw', utf8.encode(canonicalPassword(password)), 'PBKDF2', false, [
      'deriveKey',
    ]);
    return subtle().deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  /** Encrypt `plain` (Uint8Array) and return the packet described above. */
  async function seal(plain, password, { flags = 0, iterations = DEFAULT_ITERATIONS } = {}) {
    if (!password) throw new SPVError('NO_PASSWORD', 'A password is required.');
    const iterCode = Math.round(iterations / ITER_UNIT);
    if (iterCode < 1 || iterCode > 255) throw new RangeError('iterations out of range');
    const ctLen = plain.length + TAG_LEN;
    if (ctLen > 0xffff) throw new SPVError('TOO_LARGE', 'Payload too large.');

    const salt = randomBytes(SALT_LEN);
    const iv = randomBytes(IV_LEN);
    const header = concatBytes(
      Uint8Array.of(FORMAT_VERSION, flags & 0xff, iterCode),
      salt,
      iv,
      Uint8Array.of(ctLen >>> 8, ctLen & 0xff),
    );
    const key = await deriveKey(password, salt, iterCode * ITER_UNIT);
    const ct = new Uint8Array(
      await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: header, tagLength: TAG_LEN * 8 }, key, plain),
    );
    return concatBytes(header, ct);
  }

  /** Read the unauthenticated header (safe: it is authenticated again in open()). */
  function peek(packet) {
    if (!(packet instanceof Uint8Array) || packet.length < HEADER_LEN) {
      throw new SPVError('BAD_FORMAT', 'Packet too short.');
    }
    if (packet[0] !== FORMAT_VERSION) throw new SPVError('UNSUPPORTED_VERSION', 'Unsupported code version.', packet[0]);
    const iterCode = packet[2];
    const ctLen = (packet[HEADER_LEN - 2] << 8) | packet[HEADER_LEN - 1];
    if (iterCode < 1 || ctLen < TAG_LEN) throw new SPVError('BAD_FORMAT', 'Corrupt header.');
    if (packet.length < HEADER_LEN + ctLen) throw new SPVError('TRUNCATED', 'Code is incomplete.');
    return { version: packet[0], flags: packet[1], iterations: iterCode * ITER_UNIT, total: HEADER_LEN + ctLen };
  }

  /** Authenticate + decrypt. Throws BAD_PASSWORD on any authentication failure. */
  async function open(packet, password) {
    if (!password) throw new SPVError('NO_PASSWORD', 'A password is required.');
    const info = peek(packet);
    const header = packet.subarray(0, HEADER_LEN);
    const salt = packet.subarray(3, 3 + SALT_LEN);
    const iv = packet.subarray(3 + SALT_LEN, 3 + SALT_LEN + IV_LEN);
    const ct = packet.subarray(HEADER_LEN, info.total);
    const key = await deriveKey(password, salt, info.iterations);
    try {
      const plain = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: header, tagLength: TAG_LEN * 8 }, key, ct);
      return { plain: new Uint8Array(plain), flags: info.flags };
    } catch (_) {
      throw new SPVError('BAD_PASSWORD', 'Wrong password or corrupted code.');
    }
  }

  SPV.Crypto = {
    FORMAT_VERSION,
    DEFAULT_ITERATIONS,
    HEADER_LEN,
    PASSPHRASE_ALPHABET,
    generatePassphrase,
    canonicalPassword,
    estimateStrength,
    seal,
    open,
    peek,
  };

  if (typeof module === 'object' && module.exports) module.exports = SPV.Crypto;
})(typeof window !== 'undefined' ? window : globalThis);
