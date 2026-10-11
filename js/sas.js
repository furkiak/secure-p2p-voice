/*
 * sas.js — "short authentication string" for out-of-band verification.
 *
 * Both browsers hash the pair of DTLS certificate fingerprints that appear in
 * the two session descriptions. If the numbers (shown as emoji) match when the
 * people compare them aloud, nobody sits in the middle of the media path.
 */
(function (global) {
  'use strict';

  const SPV = global.SPV || (global.SPV = {});
  const { SPVError, utf8 } = SPV.Util || require('./util.js');

  // 64 visually distinct emoji, single code point each (6 bits per symbol).
  const SYMBOLS = [
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
    '🐧', '🐦', '🦆', '🦉', '🐺', '🐴', '🦄', '🐝', '🦋', '🐢', '🐍', '🐙', '🦀', '🐬', '🐳', '🦈',
    '🌵', '🌲', '🌴', '🍀', '🍁', '🌸', '🌻', '🌈', '⭐', '🌙', '⚡', '🔥', '💧', '🍎', '🍌', '🍇',
    '🍓', '🍑', '🍋', '🍉', '🍕', '🍔', '🍩', '🎈', '🎁', '🔔', '🎵', '⚽', '🚀', '🚲', '🔑', '💎',
  ];
  const SYMBOL_COUNT = 8; // 48 bits

  /** First `a=fingerprint:` line of a session description, canonicalised. */
  function fingerprintOf(sdp) {
    const m = /^a=fingerprint:(\S+)\s+([0-9A-Fa-f:]+)/m.exec(sdp || '');
    if (!m) throw new SPVError('NO_FINGERPRINT', 'No DTLS fingerprint in the session description.');
    return `${m[1].toLowerCase()} ${m[2].toUpperCase()}`;
  }

  /** Both sides get the same result regardless of who is "local". */
  async function compute(localSdp, remoteSdp) {
    const pair = [fingerprintOf(localSdp), fingerprintOf(remoteSdp)].sort();
    const digest = new Uint8Array(await global.crypto.subtle.digest('SHA-256', utf8.encode(`spv-sas-v1|${pair.join('|')}`)));
    // 8 symbols × 6 bits = 48 bits, taken from the first 6 digest bytes.
    let acc = 0n;
    for (let i = 0; i < 6; i++) acc = (acc << 8n) | BigInt(digest[i]);
    const symbols = [];
    for (let i = SYMBOL_COUNT - 1; i >= 0; i--) symbols.push(SYMBOLS[Number((acc >> BigInt(i * 6)) & 63n)]);
    return { symbols, text: symbols.join(' ') };
  }

  SPV.Sas = { SYMBOLS, SYMBOL_COUNT, fingerprintOf, compute };

  if (typeof module === 'object' && module.exports) module.exports = SPV.Sas;
})(typeof window !== 'undefined' ? window : globalThis);
