/*
 * qr.js — minimal QR Code encoder (ISO/IEC 18004), byte mode, versions 1–40.
 *
 * Dependency-free on purpose: a security tool should not load third-party
 * scripts just to draw a square. Output is a boolean matrix plus helpers to
 * turn it into an SVG path.
 */
(function (global) {
  'use strict';

  const SPV = global.SPV || (global.SPV = {});
  const { SPVError, utf8 } = SPV.Util || require('./util.js');

  // Index 0 = L, 1 = M, 2 = Q, 3 = H. Row index = version (0 unused).
  const ECC_LEVELS = { L: 0, M: 1, Q: 2, H: 3 };
  const FORMAT_BITS = [1, 0, 3, 2];
  const ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];

  // ---- capacity helpers ---------------------------------------------------

  function rawDataModules(ver) {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function dataCodewords(ver, ecl) {
    return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
  }

  // ---- Reed–Solomon over GF(2^8) / 0x11D ----------------------------------

  function gfMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function rsDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = gfMultiply(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMultiply(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    const result = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      divisor.forEach((coef, i) => {
        result[i] ^= gfMultiply(coef, factor);
      });
    }
    return result;
  }

  function addEccAndInterleave(data, ver, ecl) {
    const numBlocks = NUM_BLOCKS[ecl][ver];
    const blockEccLen = ECC_PER_BLOCK[ecl][ver];
    const rawCodewords = Math.floor(rawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks = [];
    const divisor = rsDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, divisor);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    const result = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
      });
    }
    return result;
  }

  // ---- matrix construction ------------------------------------------------

  const getBit = (x, i) => ((x >>> i) & 1) !== 0;

  function alignmentPositions(ver) {
    if (ver === 1) return [];
    const numAlign = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function maskInvert(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0;
      default: return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
    }
  }

  function buildMatrix(codewords, ver, ecl, forcedMask) {
    const size = ver * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFn = (x, y, dark) => {
      modules[y][x] = dark;
      isFunction[y][x] = true;
    };

    const drawFormat = (mask) => {
      const data = (FORMAT_BITS[ecl] << 3) | mask;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setFn(8, i, getBit(bits, i));
      setFn(8, 7, getBit(bits, 6));
      setFn(8, 8, getBit(bits, 7));
      setFn(7, 8, getBit(bits, 8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(bits, i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(bits, i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(bits, i));
      setFn(8, size - 8, true);
    };

    // timing patterns
    for (let i = 0; i < size; i++) {
      setFn(6, i, i % 2 === 0);
      setFn(i, 6, i % 2 === 0);
    }
    // finder patterns with separators
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          const xx = cx + dx;
          const yy = cy + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    };
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    // alignment patterns
    const pos = alignmentPositions(ver);
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) setFn(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    drawFormat(0); // reserve the area; redrawn with the final mask below
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setFn(a, b, getBit(bits, i));
        setFn(b, a, getBit(bits, i));
      }
    }

    // zig-zag data placement
    let bit = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!isFunction[y][x] && bit < codewords.length * 8) {
            modules[y][x] = getBit(codewords[bit >>> 3], 7 - (bit & 7));
            bit++;
          }
        }
      }
    }

    const applyMask = (mask) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (!isFunction[y][x] && maskInvert(mask, x, y)) modules[y][x] = !modules[y][x];
        }
      }
    };

    let best = forcedMask;
    if (best === undefined) {
      let bestPenalty = Infinity;
      for (let mask = 0; mask < 8; mask++) {
        applyMask(mask);
        drawFormat(mask);
        const p = penalty(modules, size);
        if (p < bestPenalty) {
          bestPenalty = p;
          best = mask;
        }
        applyMask(mask); // undo (XOR)
      }
    }
    applyMask(best);
    drawFormat(best);
    return { size, modules, mask: best };
  }

  function penalty(m, size) {
    let total = 0;
    // rule 1: runs of >= 5 same-colour modules (rows and columns)
    for (let a = 0; a < size; a++) {
      for (const horizontal of [true, false]) {
        let run = 1;
        for (let b = 1; b < size; b++) {
          const cur = horizontal ? m[a][b] : m[b][a];
          const prev = horizontal ? m[a][b - 1] : m[b - 1][a];
          if (cur === prev) {
            run++;
            if (run === 5) total += 3;
            else if (run > 5) total += 1;
          } else run = 1;
        }
      }
    }
    // rule 2: 2x2 blocks
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) total += 3;
      }
    }
    // rule 3: finder-like 1:1:3:1:1 patterns with 4 light modules on a side
    const A = [true, false, true, true, true, false, true, false, false, false, false];
    const B = [false, false, false, false, true, false, true, true, true, false, true];
    const matches = (get, start, pat) => {
      for (let i = 0; i < 11; i++) if (get(start + i) !== pat[i]) return false;
      return true;
    };
    for (let a = 0; a < size; a++) {
      for (let s = 0; s + 11 <= size; s++) {
        for (const pat of [A, B]) {
          if (matches((i) => m[a][i], s, pat)) total += 40;
          if (matches((i) => m[i][a], s, pat)) total += 40;
        }
      }
    }
    // rule 4: dark/light balance
    let dark = 0;
    for (const row of m) for (const c of row) if (c) dark++;
    const k = Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1;
    return total + Math.max(0, k) * 10;
  }

  // ---- public API ---------------------------------------------------------

  /**
   * Encode `text` (UTF-8, byte mode).
   * @param {string} text
   * @param {{ecc?:'L'|'M'|'Q'|'H', prefer?:string[], maxVersion?:number, mask?:number}} [opts]
   *   `ecc` forces one error-correction level. Otherwise the first level in
   *   `prefer` that fits within `maxVersion` wins (default: M, then L), keeping
   *   the symbol as sparse — and as easy to scan — as possible.
   * @returns {{size:number, version:number, ecc:string, mask:number, modules:boolean[][]}}
   */
  function encode(text, { ecc, prefer = ['M', 'L'], maxVersion = 25, mask } = {}) {
    const bytes = utf8.encode(text);
    const candidates = ecc ? [ecc] : prefer;
    const fit = (level) => {
      const e = ECC_LEVELS[level];
      for (let ver = 1; ver <= 40; ver++) {
        const ccBits = ver < 10 ? 8 : 16;
        if (4 + ccBits + bytes.length * 8 <= dataCodewords(ver, e) * 8) return ver;
      }
      return 0;
    };

    let chosen = null;
    for (const level of candidates) {
      const ver = fit(level);
      if (ver && ver <= maxVersion) {
        chosen = { level, ver };
        break;
      }
    }
    if (!chosen) {
      // nothing fits the preferred size: use the last (lowest) level at any version
      const level = candidates[candidates.length - 1];
      const ver = fit(level);
      if (!ver) throw new SPVError('TOO_LARGE', 'Data too long for a QR code.');
      chosen = { level, ver };
    }

    const { level, ver } = chosen;
    const e = ECC_LEVELS[level];
    const ccBits = ver < 10 ? 8 : 16;
    // bit stream: mode(0100) + char count + data + terminator + padding
    const bits = [];
    const push = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };
    push(0x4, 4);
    push(bytes.length, ccBits);
    for (const b of bytes) push(b, 8);
    const capacityBits = dataCodewords(ver, e) * 8;
    push(0, Math.min(4, capacityBits - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }

    const all = addEccAndInterleave(data, ver, e);
    const built = buildMatrix(all, ver, e, mask);
    return { size: built.size, version: ver, ecc: level, mask: built.mask, modules: built.modules };
  }

  /** SVG path data (one rect per horizontal run of dark modules). */
  function toSvgPath(qr, border = 4) {
    const parts = [];
    for (let y = 0; y < qr.size; y++) {
      let x = 0;
      while (x < qr.size) {
        if (!qr.modules[y][x]) {
          x++;
          continue;
        }
        const start = x;
        while (x < qr.size && qr.modules[y][x]) x++;
        parts.push(`M${start + border} ${y + border}h${x - start}v1h${start - x}z`);
      }
    }
    return parts.join('');
  }

  SPV.QR = { encode, toSvgPath, dataCodewords, alignmentPositions };

  if (typeof module === 'object' && module.exports) module.exports = SPV.QR;
})(typeof window !== 'undefined' ? window : globalThis);
