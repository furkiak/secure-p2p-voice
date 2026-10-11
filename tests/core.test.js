'use strict';
// Unit tests for the dependency-free core: run with `node --test tests/`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Util = require('../js/util.js');
const Crypto = require('../js/crypto.js');
const Codec = require('../js/codec.js');
const Sas = require('../js/sas.js');
const QR = require('../js/qr.js');

const SDP = fs.readFileSync(path.join(__dirname, 'fixtures', 'chrome-offer.sdp'), 'utf8');
const FAST = 10000; // PBKDF2 iterations used by tests to keep them quick

const rejectsWith = (promise, code) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
    return true;
  });

// ---------------------------------------------------------------- util ----

test('base64url round-trips arbitrary bytes and rejects garbage', () => {
  for (let n = 0; n < 200; n++) {
    const bytes = Util.randomBytes(n);
    assert.deepEqual(Util.fromBase64Url(Util.toBase64Url(bytes)), bytes);
  }
  assert.throws(() => Util.fromBase64Url('abc+def'), { code: 'BAD_FORMAT' });
  assert.throws(() => Util.fromBase64Url('a'), { code: 'BAD_FORMAT' });
  assert.doesNotMatch(Util.toBase64Url(new Uint8Array(100).fill(251)), /[+/=]/);
});

test('randomInt is within range and has no obvious bias', () => {
  const counts = new Array(31).fill(0);
  for (let i = 0; i < 31000; i++) counts[Util.randomInt(31)]++;
  for (const c of counts) assert.ok(c > 800 && c < 1200, `suspicious bucket ${c}`);
  assert.throws(() => Util.randomInt(0), RangeError);
  assert.throws(() => Util.randomInt(257), RangeError);
});

test('formatDuration', () => {
  assert.equal(Util.formatDuration(0), '00:00');
  assert.equal(Util.formatDuration(65), '01:05');
  assert.equal(Util.formatDuration(3725), '1:02:05');
  assert.equal(Util.formatDuration(-5), '00:00');
});

// -------------------------------------------------------------- crypto ----

test('generated passphrases are well-formed and unique', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const p = Crypto.generatePassphrase();
    assert.match(p, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    assert.doesNotMatch(p, /[ILO01]/);
    seen.add(p);
  }
  assert.equal(seen.size, 200);
});

test('password canonicalisation', () => {
  assert.equal(Crypto.canonicalPassword('  hunter2  '), 'hunter2');
  assert.equal(Crypto.canonicalPassword('ｆｕｌｌｗｉｄｔｈ'), 'fullwidth'); // NFKC
  assert.equal(Crypto.canonicalPassword('abcd-efgh-jklm-npqr'), 'ABCD-EFGH-JKLM-NPQR');
  assert.equal(Crypto.canonicalPassword('abcd efgh'), 'abcd efgh'); // ordinary passwords stay case-sensitive
});

test('strength estimation orders passwords sensibly', () => {
  const s = (p) => Crypto.estimateStrength(p);
  assert.equal(s('').score, 0);
  assert.equal(s('password').score, 0);
  assert.equal(s('12345678').score, 0);
  assert.equal(s('aaaaaaaaaaaa').score, 0);
  assert.ok(s('correct horse').score < s('correct horse battery staple').score);
  assert.ok(s('Tr0ub4dor&3xQ').bits > s('troubador').bits);
  assert.equal(s(Crypto.generatePassphrase()).score, 4);
});

test('seal/open round-trip', async () => {
  const plain = Util.utf8.encode('hello, world — şifreli 🔒');
  const packet = await Crypto.seal(plain, 'correct horse', { flags: 5, iterations: FAST });
  const { plain: out, flags } = await Crypto.open(packet, 'correct horse');
  assert.deepEqual(out, plain);
  assert.equal(flags, 5);
});

test('every seal uses a fresh salt and IV', async () => {
  const plain = Util.utf8.encode('same input');
  const a = await Crypto.seal(plain, 'pw-12345', { iterations: FAST });
  const b = await Crypto.seal(plain, 'pw-12345', { iterations: FAST });
  assert.notDeepEqual(a.subarray(3, 19), b.subarray(3, 19), 'salt must differ');
  assert.notDeepEqual(a.subarray(19, 31), b.subarray(19, 31), 'iv must differ');
  assert.notDeepEqual(a, b);
});

test('wrong password is rejected', async () => {
  const packet = await Crypto.seal(Util.utf8.encode('x'), 'right-password', { iterations: FAST });
  await rejectsWith(Crypto.open(packet, 'wrong-password'), 'BAD_PASSWORD');
  await rejectsWith(Crypto.open(packet, ''), 'NO_PASSWORD');
});

test('flipping any single bit anywhere in the packet is detected', async () => {
  const packet = await Crypto.seal(Util.utf8.encode('integrity matters'), 'pw-12345', { iterations: FAST });
  for (let i = 0; i < packet.length; i++) {
    const bad = packet.slice();
    bad[i] ^= 0x01;
    await assert.rejects(Crypto.open(bad, 'pw-12345'), (e) => e instanceof Util.SPVError, `byte ${i} not protected`);
  }
});

test('truncated and over-long packets', async () => {
  const packet = await Crypto.seal(Util.utf8.encode('payload'), 'pw-12345', { iterations: FAST });
  await rejectsWith(Crypto.open(packet.subarray(0, packet.length - 3), 'pw-12345'), 'TRUNCATED');
  await rejectsWith(Crypto.open(packet.subarray(0, 10), 'pw-12345'), 'BAD_FORMAT');
  const padded = Util.concatBytes(packet, Util.randomBytes(7)); // trailing junk is ignored
  assert.deepEqual((await Crypto.open(padded, 'pw-12345')).plain, Util.utf8.encode('payload'));
});

test('unsupported version', async () => {
  const packet = await Crypto.seal(Util.utf8.encode('v'), 'pw-12345', { iterations: FAST });
  packet[0] = 9;
  await rejectsWith(Crypto.open(packet, 'pw-12345'), 'UNSUPPORTED_VERSION');
});

test('default KDF cost meets current guidance', () => {
  assert.ok(Crypto.DEFAULT_ITERATIONS >= 600000);
});

// --------------------------------------------------------------- codec ----

test('offer code round-trip with a real Chromium SDP', async () => {
  const code = await Codec.encode({ type: 'offer', sdp: SDP, password: 'pw-12345', iterations: FAST });
  assert.match(code, /^spv1\.[A-Za-z0-9_-]+$/);
  const out = await Codec.decode(code, 'pw-12345', { expectedType: 'offer' });
  assert.equal(out.sdp, SDP);
  assert.equal(out.type, 'offer');
});

test('codes are compact (the original scheme produced ~10 000 characters)', async () => {
  const code = await Codec.encode({ type: 'offer', sdp: SDP, password: 'pw-12345', iterations: FAST });
  assert.ok(code.length < 1300, `code is ${code.length} chars`);
});

test('type is authenticated: offers and answers cannot be swapped', async () => {
  const offer = await Codec.encode({ type: 'offer', sdp: SDP, password: 'pw-12345', iterations: FAST });
  await rejectsWith(Codec.decode(offer, 'pw-12345', { expectedType: 'answer' }), 'WRONG_TYPE');
  assert.equal(Codec.inspect(offer).type, 'offer');
  // forging the type bit in the header must fail authentication
  const forged = Codec.inspect(offer).packet.slice();
  forged[1] ^= 0b10;
  const forgedCode = Codec.PREFIX + Util.toBase64Url(forged);
  await rejectsWith(Codec.decode(forgedCode, 'pw-12345', { expectedType: 'answer' }), 'BAD_PASSWORD');
});

test('expired and future-dated codes are rejected', async () => {
  const now = 1_700_000_000_000;
  const code = await Codec.encode({ type: 'answer', sdp: SDP, password: 'pw-12345', iterations: FAST, now });
  await Codec.decode(code, 'pw-12345', { now: now + 29 * 60000 });
  await rejectsWith(Codec.decode(code, 'pw-12345', { now: now + 31 * 60000 }), 'EXPIRED');
  await rejectsWith(Codec.decode(code, 'pw-12345', { now: now - 31 * 60000 }), 'EXPIRED');
});

test('extractCode tolerates links, wrapping, punctuation and chatter', async () => {
  const code = await Codec.encode({ type: 'offer', sdp: SDP, password: 'pw-12345', iterations: FAST });
  const body = code.slice(Codec.PREFIX.length);
  const cases = [
    code,
    `  ${code}\n`,
    `Hi! Here you go: ${code} — call me`,
    `"${code}".`,
    Codec.buildLink('https://example.org/app/index.html#old', code),
    code.slice(0, 200) + '\n' + code.slice(200, 400) + '\r\n' + code.slice(400),
    code.toUpperCase().slice(0, 5) + body, // prefix is case-insensitive
  ];
  for (const text of cases) {
    const out = await Codec.decode(text, 'pw-12345');
    assert.equal(out.sdp, SDP);
  }
  assert.equal(Codec.extractCode('no code here'), null);
  assert.equal(Codec.extractCode(42), null);
});

test('link builder replaces any existing fragment', () => {
  assert.equal(Codec.buildLink('https://a.b/c#x', 'spv1.AAA'), 'https://a.b/c#c=spv1.AAA');
});

test('incomplete codes are reported as truncated, not as a wrong password', async () => {
  const code = await Codec.encode({ type: 'offer', sdp: SDP, password: 'pw-12345', iterations: FAST });
  await rejectsWith(Codec.decode(code.slice(0, code.length - 40), 'pw-12345'), 'TRUNCATED');
  await rejectsWith(Codec.decode('spv1.', 'pw-12345'), 'BAD_FORMAT');
  await rejectsWith(Codec.decode('hello', 'pw-12345'), 'BAD_FORMAT');
});

test('a code cut off at ANY position is reported as truncated', async () => {
  const code = await Codec.encode({ type: 'offer', sdp: SDP, password: 'pw-12345', iterations: FAST });
  for (let cut = 1; cut <= 90; cut++) {
    await rejectsWith(Codec.decode(code.slice(0, code.length - cut), 'pw-12345'), 'TRUNCATED');
  }
  for (const keep of [6, 7, 8, 9, 20, 40]) {
    await assert.rejects(Codec.decode(code.slice(0, Codec.PREFIX.length + keep), 'pw-12345'), (e) => ['TRUNCATED', 'BAD_FORMAT'].includes(e.code));
  }
});

test('wrong password on a valid code', async () => {
  const code = await Codec.encode({ type: 'offer', sdp: SDP, password: 'pw-12345', iterations: FAST });
  await rejectsWith(Codec.decode(code, 'pw-54321'), 'BAD_PASSWORD');
});

test('generated passphrases work regardless of case or grouping typed', async () => {
  const pass = Crypto.generatePassphrase();
  const code = await Codec.encode({ type: 'offer', sdp: SDP, password: pass, iterations: FAST });
  assert.equal((await Codec.decode(code, pass.toLowerCase())).sdp, SDP);
  assert.equal((await Codec.decode(code, `  ${pass}  `)).sdp, SDP);
});

// ----------------------------------------------------------------- sas ----

const sdpWithFp = (fp) => `v=0\r\na=fingerprint:sha-256 ${fp}\r\n`;
const FP_A = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
const FP_B = '99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA:99:88:77:66:55:44:33:22:11:00:FF:EE:DD:CC:BB:AA';

test('SAS symbol table is 64 distinct entries', () => {
  assert.equal(Sas.SYMBOLS.length, 64);
  assert.equal(new Set(Sas.SYMBOLS).size, 64);
});

test('SAS is identical on both sides and changes with either fingerprint', async () => {
  const a = sdpWithFp(FP_A);
  const b = sdpWithFp(FP_B);
  const caller = await Sas.compute(a, b);
  const callee = await Sas.compute(b, a);
  assert.deepEqual(caller.symbols, callee.symbols);
  assert.equal(caller.symbols.length, Sas.SYMBOL_COUNT);
  const mitm = await Sas.compute(a, sdpWithFp(FP_B.replace('99:88', '99:89')));
  assert.notDeepEqual(mitm.symbols, caller.symbols);
});

test('SAS reads fingerprints case-insensitively and from real SDP', async () => {
  assert.match(Sas.fingerprintOf(SDP), /^sha-256 ([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  assert.equal(Sas.fingerprintOf(sdpWithFp(FP_A.toLowerCase())), `sha-256 ${FP_A}`);
  assert.throws(() => Sas.fingerprintOf('v=0\r\n'), { code: 'NO_FINGERPRINT' });
});

// ------------------------------------------------------------------ qr ----

test('QR picks the smallest version and honours the preference order', () => {
  const small = QR.encode('HELLO WORLD');
  assert.equal(small.version, 1);
  assert.equal(small.ecc, 'M');
  assert.equal(small.size, 21);
  const big = QR.encode('x'.repeat(1100));
  assert.equal(big.ecc, 'L', 'falls back to L when M would exceed the preferred size');
  assert.equal(big.size, big.version * 4 + 17);
  assert.equal(QR.encode('hi', { ecc: 'H' }).ecc, 'H');
});

test('QR capacity boundaries match the specification', () => {
  // byte-mode capacities from ISO/IEC 18004 table 7 (version 1, 10, 40 at L/M/Q/H)
  const cap = { 'L1': 17, 'M1': 14, 'Q1': 11, 'H1': 7, 'L10': 271, 'M10': 213, 'Q10': 151, 'H10': 119, 'L40': 2953, 'M40': 2331, 'Q40': 1663, 'H40': 1273 };
  for (const [key, bytes] of Object.entries(cap)) {
    const level = key[0];
    const ver = Number(key.slice(1));
    assert.equal(QR.encode('a'.repeat(bytes), { ecc: level }).version, ver, `${key} fits`);
    const over = () => QR.encode('a'.repeat(bytes + 1), { ecc: level });
    if (ver === 40) assert.throws(over, { code: 'TOO_LARGE' }, `${key}+1 overflows`);
    else assert.ok(over().version > ver, `${key}+1 needs a bigger version`);
  }
  assert.throws(() => QR.encode('a'.repeat(2954), { ecc: 'L' }), { code: 'TOO_LARGE' });
});

test('QR output is deterministic and has the mandatory function patterns', () => {
  const a = QR.encode('deterministic');
  const b = QR.encode('deterministic');
  assert.deepEqual(a.modules, b.modules);
  const m = a.modules;
  // 7x7 finder pattern: dark ring, light ring, 3x3 dark centre
  assert.equal(m[0][0] && m[0][6] && m[6][0] && m[6][6], true);
  assert.equal(m[1][1] || m[1][5] || m[5][1] || m[5][5], false);
  assert.equal(m[3][3], true);
  assert.equal(m[a.size - 8][8], true, 'dark module');
  assert.ok(QR.toSvgPath(a).startsWith('M'));
});
