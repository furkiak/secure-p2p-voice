/*
 * util.js — small dependency-free helpers shared by every module.
 *
 * All modules attach themselves to a single `SPV` namespace so the app works
 * from a plain file:// URL (no bundler, no ES-module CORS issues) and the same
 * files can be `require()`d by the Node unit tests.
 */
(function (global) {
  'use strict';

  const SPV = global.SPV || (global.SPV = {});

  /** Error with a machine-readable code so the UI can show a localized message. */
  class SPVError extends Error {
    constructor(code, message, detail) {
      super(message || code);
      this.name = 'SPVError';
      this.code = code;
      this.detail = detail;
    }
  }

  // ---- bytes <-> text -----------------------------------------------------

  const utf8 = new TextEncoder();
  const utf8d = new TextDecoder('utf-8', { fatal: true });

  function toBase64Url(bytes) {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new SPVError('BAD_FORMAT', 'Invalid base64url');
    if (text.length % 4 === 1) throw new SPVError('BAD_FORMAT', 'Invalid base64url length');
    let b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function concatBytes(...parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }

  function randomBytes(n) {
    return global.crypto.getRandomValues(new Uint8Array(n));
  }

  /** Uniform random integer in [0, max) without modulo bias. */
  function randomInt(max) {
    if (!(max > 0 && max <= 256)) throw new RangeError('randomInt: max must be 1..256');
    const limit = 256 - (256 % max);
    for (;;) {
      const b = randomBytes(1)[0];
      if (b < limit) return b % max;
    }
  }

  // ---- misc ---------------------------------------------------------------

  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  /** localStorage wrapper that never throws (private mode, blocked storage…). */
  const Store = {
    _mem: {},
    get(key, fallback) {
      try {
        const raw = global.localStorage.getItem('spv:' + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (_) {
        return key in this._mem ? this._mem[key] : fallback;
      }
    },
    set(key, value) {
      this._mem[key] = value;
      try {
        global.localStorage.setItem('spv:' + key, JSON.stringify(value));
      } catch (_) {
        /* storage unavailable: keep in memory for this session */
      }
    },
  };

  SPV.Util = {
    SPVError,
    utf8,
    utf8d,
    toBase64Url,
    fromBase64Url,
    concatBytes,
    randomBytes,
    randomInt,
    formatDuration,
    clamp,
    Store,
  };

  if (typeof module === 'object' && module.exports) module.exports = SPV.Util;
})(typeof window !== 'undefined' ? window : globalThis);
