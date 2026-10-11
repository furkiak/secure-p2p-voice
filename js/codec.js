/*
 * codec.js — turns a WebRTC session description into a short, copy-paste-safe
 * text code (and back).
 *
 *   SDP ──► "<timestamp>\n<sdp>" ──► deflate-raw ──► AES-GCM (crypto.js) ──► base64url
 *                                                                     └──► "spv1." + text
 *
 * The code type (offer / answer) and the compression flag live in the
 * authenticated packet header, so an offer can never be replayed as an answer
 * and a pasted code is rejected with a precise error instead of a generic one.
 */
(function (global) {
  'use strict';

  const SPV = global.SPV || (global.SPV = {});
  const { SPVError, utf8, utf8d, toBase64Url, fromBase64Url } = SPV.Util || require('./util.js');
  const Crypto = SPV.Crypto || require('./crypto.js');

  const PREFIX = 'spv1.';
  const TYPES = { offer: 0, answer: 1 };
  const TYPE_NAMES = ['offer', 'answer'];
  const FLAG_DEFLATE = 1;
  /** A code older (or further in the future) than this is rejected. */
  const MAX_AGE_MS = 30 * 60 * 1000;
  const MAX_INFLATED_BYTES = 64 * 1024;

  // ---- compression --------------------------------------------------------

  const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

  async function pipe(bytes, stream, limit) {
    const writer = stream.writable.getWriter();
    writer.write(bytes).catch(() => {});
    writer.close().catch(() => {});
    const reader = stream.readable.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (limit && size > limit) {
        reader.cancel().catch(() => {});
        throw new SPVError('BAD_FORMAT', 'Decompressed payload too large.');
      }
      chunks.push(value);
    }
    const out = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  const deflate = (bytes) => pipe(bytes, new CompressionStream('deflate-raw'));
  const inflate = (bytes) => pipe(bytes, new DecompressionStream('deflate-raw'), MAX_INFLATED_BYTES);

  // ---- text <-> packet ----------------------------------------------------

  /**
   * Find a connection code inside arbitrary pasted text: a bare code, a code
   * wrapped over several lines by a messenger, a share link (`…#c=spv1.…`) or
   * a sentence that merely contains one. Returns the base64url body or null.
   */
  function extractCode(text) {
    if (typeof text !== 'string') return null;
    const idx = text.toLowerCase().indexOf(PREFIX);
    if (idx < 0) return null;
    const tokens = text.slice(idx + PREFIX.length).split(/\s+/);
    let body = '';
    for (const token of tokens) {
      const m = /^[A-Za-z0-9_-]+/.exec(token);
      if (!m) break;
      body += m[0];
      if (m[0].length !== token.length) break; // trailing punctuation ends the code
    }
    return body || null;
  }

  function buildLink(baseUrl, code) {
    return `${baseUrl.split('#')[0]}#c=${code}`;
  }

  // ---- public API ---------------------------------------------------------

  /**
   * @param {{type:'offer'|'answer', sdp:string, password:string, now?:number, iterations?:number}} p
   * @returns {Promise<string>} the shareable text code
   */
  async function encode({ type, sdp, password, now = Date.now(), iterations }) {
    if (!(type in TYPES)) throw new RangeError('unknown code type');
    let bytes = utf8.encode(`${now}\n${sdp}`);
    let flags = TYPES[type] << 1;
    if (canCompress()) {
      const packed = await deflate(bytes);
      if (packed.length < bytes.length) {
        bytes = packed;
        flags |= FLAG_DEFLATE;
      }
    }
    const packet = await Crypto.seal(bytes, password, { flags, iterations });
    return PREFIX + toBase64Url(packet);
  }

  /** Read which kind of code this is without needing the password. */
  function inspect(text) {
    let body = extractCode(text);
    if (!body) throw new SPVError('BAD_FORMAT', 'No connection code found.');
    // a single dangling character carries no complete byte: it only means the copy was cut off
    if (body.length % 4 === 1) body = body.slice(0, -1);
    let packet;
    try {
      packet = fromBase64Url(body);
    } catch (_) {
      throw new SPVError('BAD_FORMAT', 'Unreadable code.');
    }
    const info = Crypto.peek(packet);
    return { type: TYPE_NAMES[(info.flags >> 1) & 3], packet: packet.subarray(0, info.total), flags: info.flags };
  }

  /**
   * @param {string} text pasted code / link
   * @param {string} password shared password
   * @param {{expectedType?:'offer'|'answer', now?:number, maxAgeMs?:number}} [opts]
   * @returns {Promise<{type:string, sdp:string, createdAt:number}>}
   */
  async function decode(text, password, { expectedType, now = Date.now(), maxAgeMs = MAX_AGE_MS } = {}) {
    const info = inspect(text);
    if (expectedType && info.type !== expectedType) {
      throw new SPVError('WRONG_TYPE', `Expected an ${expectedType} code but got an ${info.type} code.`, info.type);
    }
    const { plain, flags } = await Crypto.open(info.packet, password);
    let bytes = plain;
    if (flags & FLAG_DEFLATE) {
      if (!canCompress()) throw new SPVError('UNSUPPORTED', 'This browser cannot decompress the code.');
      bytes = await inflate(plain);
    }
    let body;
    try {
      body = utf8d.decode(bytes);
    } catch (_) {
      throw new SPVError('BAD_FORMAT', 'Corrupt payload.');
    }
    const nl = body.indexOf('\n');
    const createdAt = Number(body.slice(0, nl));
    if (nl < 1 || !Number.isFinite(createdAt)) throw new SPVError('BAD_FORMAT', 'Corrupt payload.');
    if (Math.abs(now - createdAt) > maxAgeMs) throw new SPVError('EXPIRED', 'This code has expired.', createdAt);
    return { type: info.type, sdp: body.slice(nl + 1), createdAt };
  }

  SPV.Codec = { PREFIX, MAX_AGE_MS, encode, decode, inspect, extractCode, buildLink };

  if (typeof module === 'object' && module.exports) module.exports = SPV.Codec;
})(typeof window !== 'undefined' ? window : globalThis);
