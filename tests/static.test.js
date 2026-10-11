'use strict';
// Static consistency checks: markup <-> scripts <-> translations <-> CSP.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));

require('../js/util.js');
require('../js/sas.js');
const I18n = require('../js/i18n.js');
const Call = require('../js/call.js');
const { en, tr } = I18n.dictionaries;

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

test('English and Turkish dictionaries have exactly the same keys', () => {
  assert.deepEqual(Object.keys(tr).sort(), Object.keys(en).sort());
  for (const [key, value] of Object.entries({ ...en, ...tr })) assert.ok(String(value).trim(), `${key} is empty`);
});

test('placeholders such as {n} are kept in every translation', () => {
  for (const key of Object.keys(en)) {
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(vars(tr[key]), vars(en[key]), `placeholder mismatch in ${key}`);
  }
});

test('every data-i18n key used in the markup exists, and the English default text matches', () => {
  const re = /<(\w+)([^>]*?)data-i18n="([^"]+)"([^>]*)>([^<]*)</g;
  let m;
  let seen = 0;
  while ((m = re.exec(html))) {
    const key = m[3];
    assert.ok(key in en, `missing key ${key}`);
    const text = decode(m[5]).trim();
    if (text) assert.equal(text, en[key], `default text of ${key} differs from the English dictionary`);
    seen++;
  }
  assert.ok(seen > 60, `only ${seen} keys found, regex is probably broken`);
  for (const m2 of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of m2[1].split(';')) assert.ok(pair.split(':')[1] in en, `missing attr key in ${pair}`);
  }
});

test('every literal t(\'key\') / relabel(el, \'key\') / setStatus(…, \'key\') in the scripts exists', () => {
  const used = new Set();
  for (const file of jsFiles) {
    const src = read(path.join('js', file));
    for (const m of src.matchAll(/\b(?:t|relabel\([^,]+,|setStatus\(\s*'\w+',)\s*\(?'([a-z]+(?:\.[A-Za-z0-9]+)+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\b(?:setCallState|relabelAttrs\([^,]+,)\s*\('?([a-z]+\.[a-z.]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size > 40);
  for (const key of used) assert.ok(key in en, `script uses unknown key ${key}`);
  // keys assembled at run time
  for (const n of [0, 1, 2, 3, 4]) assert.ok(`strength.${n}` in en);
  for (const mode of ['google', 'cloudflare', 'none', 'custom']) assert.ok(`settings.ice.hint.${mode}` in en);
  for (const r of ['lan', 'p2p', 'relay']) assert.ok(`route.${r}` in en && `route.${r}.long` in en);
  for (const s of ['pending', 'verified', 'mismatch']) assert.ok(`sas.${s}` in en);
  for (const code of ['BAD_FORMAT', 'TRUNCATED', 'BAD_PASSWORD', 'UNSUPPORTED_VERSION', 'EXPIRED', 'NO_CANDIDATES', 'BAD_SDP', 'NO_CRYPTO', 'STATE']) {
    assert.ok(`err.${code}` in en, `no message for error ${code}`);
  }
});

test('every element id the scripts look up exists exactly once in index.html', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids in index.html');
  for (const file of ['app.js', 'ui.js']) {
    for (const m of read(path.join('js', file)).matchAll(/\$\('([A-Za-z0-9_]+)'\)/g)) {
      assert.ok(ids.includes(m[1]), `${file} looks up #${m[1]} which does not exist`);
    }
  }
  for (const id of ['Letter', 'Icon']) for (const who of ['self', 'peer']) assert.ok(ids.includes(who + id));
  for (const m of html.matchAll(/(?:aria-controls|for)="([^"]+)"/g)) assert.ok(ids.includes(m[1]), `dangling reference to #${m[1]}`);
});

test('every <use href="#…"> points at a defined icon', () => {
  const symbols = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  const refs = new Set([...html.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]));
  for (const file of jsFiles) for (const m of read(path.join('js', file)).matchAll(/'#(i-[a-z-]+)'/g)) refs.add(m[1]);
  for (const ref of refs) assert.ok(symbols.has(ref), `missing icon ${ref}`);
});

test('markup is compatible with the strict Content-Security-Policy', () => {
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'(?!\s+'unsafe)/);
  assert.match(csp, /connect-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-/);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, 'inline <script> found');
  assert.doesNotMatch(html, /<style[\s>]/i, 'inline <style> found');
  assert.doesNotMatch(html, /\sstyle="/i, 'inline style attribute found');
  assert.doesNotMatch(html, /\son[a-z]+="/i, 'inline event handler found');
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\/(?!github\.com\/furkiak\/)/i, 'external resource referenced');
  for (const file of jsFiles) {
    const src = read(path.join('js', file));
    assert.doesNotMatch(src, /\beval\(|new Function\(|\.innerHTML\s*=|insertAdjacentHTML|document\.write/, `${file} uses a forbidden API`);
    assert.doesNotMatch(src, /setAttribute\(\s*'style'/, `${file} sets an inline style attribute`);
  }
});

test('every script referenced in the markup exists and the service worker caches all of them', () => {
  const sw = read('sw.js');
  for (const m of html.matchAll(/<script src="([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), `${m[1]} missing`);
    assert.ok(sw.includes(`'${m[1]}'`), `${m[1]} is not in the service worker shell`);
  }
  for (const m of html.matchAll(/<link[^>]+href="([^"#]+)"/g)) {
    if (/^https?:/.test(m[1])) continue;
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), `${m[1]} missing`);
  }
  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(ROOT, icon.src)), `${icon.src} missing`);
});

test('no personal or tool attribution leaked into the shipped files', () => {
  const files = ['index.html', 'sw.js', 'manifest.webmanifest', 'css/app.css', ...jsFiles.map((f) => 'js/' + f), 'README.md'];
  for (const f of files) assert.doesNotMatch(read(f), /claude|anthropic|chatgpt|openai|copilot/i, `${f} mentions an AI tool`);
});

// ------------------------------------------------------------- call.js ----

test('ICE server parsing', () => {
  const { servers, invalid } = Call.parseIceServers(
    ['# comment', 'stun:stun.example.org:3478', '  turn:turn.example.org:3478 alice s3cret pass word ', 'turn:no-credentials.example.org', 'http://nope', '', 'stuns:secure.example.org:5349'].join('\n'),
  );
  assert.deepEqual(servers, [
    { urls: 'stun:stun.example.org:3478' },
    { urls: 'turn:turn.example.org:3478', username: 'alice', credential: 's3cret pass word' },
    { urls: 'stuns:secure.example.org:5349' },
  ]);
  assert.deepEqual(invalid, ['turn:no-credentials.example.org', 'http://nope']);
});

test('RTC configuration per preset', () => {
  assert.deepEqual(Call.buildRtcConfig({ iceMode: 'none' }).iceServers, []);
  assert.match(Call.buildRtcConfig({ iceMode: 'google' }).iceServers[0].urls, /^stun:/);
  assert.match(Call.buildRtcConfig({ iceMode: 'cloudflare' }).iceServers[0].urls, /cloudflare/);
  assert.equal(Call.buildRtcConfig({}).iceServers.length, 1, 'defaults to a public STUN server');
  assert.equal(Call.buildRtcConfig({ iceMode: 'none' }).bundlePolicy, 'max-bundle');
  const custom = { iceMode: 'custom', customIce: 'turn:t.example.org:3478 u p', relay: true };
  assert.equal(Call.buildRtcConfig(custom).iceTransportPolicy, 'relay');
  assert.equal(Call.buildRtcConfig({ ...custom, relay: false }).iceTransportPolicy, undefined);
  // "relay only" is meaningless (and would break calls) without a TURN server
  assert.equal(Call.buildRtcConfig({ iceMode: 'custom', customIce: 'stun:s.example.org:3478', relay: true }).iceTransportPolicy, undefined);
});

test('route and quality classification', () => {
  assert.equal(Call.classifyRoute('host', 'host'), 'lan');
  assert.equal(Call.classifyRoute('srflx', 'host'), 'p2p');
  assert.equal(Call.classifyRoute('prflx', 'srflx'), 'p2p');
  assert.equal(Call.classifyRoute('host', 'relay'), 'relay');
  assert.equal(Call.classifyQuality(null, null), null);
  assert.equal(Call.classifyQuality(40, 0), 'good');
  assert.equal(Call.classifyQuality(250, 0), 'fair');
  assert.equal(Call.classifyQuality(40, 4), 'fair');
  assert.equal(Call.classifyQuality(600, 0), 'poor');
  assert.equal(Call.classifyQuality(40, 12), 'poor');
});
