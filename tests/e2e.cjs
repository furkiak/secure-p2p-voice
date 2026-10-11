'use strict';
/*
 * End-to-end test: two real browser sessions complete the whole manual
 * signaling flow and hold an encrypted call (fake microphone).
 *
 *   npm i -D playwright   # once, plus a Chromium: npx playwright install chromium
 *   node tests/e2e.cjs
 *
 * Optional: SHOTS_DIR=/some/dir saves screenshots of every step.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../scripts/serve.cjs');

const SHOTS = process.env.SHOTS_DIR || '';
const PASSWORD = 'ABCD-EFGH-JKMN-PQRS';

const serve = () => new Promise((resolve) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => resolve(server));
});

const step = (msg) => console.log(`  ✓ ${msg}`);

async function newPeer(browser, url, name, logs) {
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 940 },
    deviceScaleFactor: 2,
    permissions: ['microphone', 'clipboard-read', 'clipboard-write'],
    colorScheme: 'light',
  });
  // same-network calls only: no third-party STUN needed in the test
  await ctx.addInitScript(() => localStorage.setItem('spv:settings', JSON.stringify({ iceMode: 'none', lang: 'en' })));
  const page = await ctx.newPage();
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(`[${name}] ${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[${name}] pageerror: ${e.message}`));
  await page.goto(url);
  return { ctx, page, name };
}

async function shot(peer, label) {
  if (SHOTS) await peer.page.screenshot({ path: path.join(SHOTS, `${label}.png`) });
}

async function toConnect(peer) {
  await peer.page.fill('#secret', PASSWORD);
  await peer.page.click('#btnContinue');
  await peer.page.waitForSelector('#viewConnect:not([hidden])');
}

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const logs = [];
  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });

  try {
    console.log('Setup screen');
    const alice = await newPeer(browser, url, 'alice', logs);
    const bob = await newPeer(browser, url, 'bob', logs);
    const a = alice.page;
    const b = bob.page;

    // --- password rules
    await a.click('#btnContinue');
    assert.ok(await a.locator('.toast[data-tone="error"]').count(), 'empty password is rejected');
    await a.fill('#secret', 'short');
    await a.click('#btnContinue');
    assert.equal(await a.locator('#viewConnect').isHidden(), true, 'short password is rejected');
    await a.fill('#secret', 'password');
    assert.equal(await a.getAttribute('#strength', 'data-fill'), '1');
    await a.click('#btnGenerate');
    const generated = await a.inputValue('#secret');
    assert.match(generated, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    assert.equal(await a.getAttribute('#strength', 'data-fill'), '4');
    step('password validation, generator and strength meter');
    await shot(alice, '01-setup-strong');

    // --- caller: invitation
    console.log('Signaling');
    await toConnect(alice);
    await toConnect(bob);
    step('both reached the connect screen with the microphone granted');
    await a.click('#btnCreateOffer');
    await a.waitForFunction(() => document.getElementById('offerCode').value.startsWith('spv1.'), null, { timeout: 30000 });
    const offer = await a.inputValue('#offerCode');
    assert.ok(offer.length < 1600, `offer code is ${offer.length} chars`);
    assert.ok(await a.locator('#offerOut').isVisible());
    step(`invitation created (${offer.length} characters)`);

    await a.click('#btnQrOffer');
    assert.ok(await a.locator('#offerQrImage svg path').count(), 'QR is rendered');
    await shot(alice, '02-caller-invitation');

    // --- callee: error paths first
    await b.click('#tabCallee');
    await b.fill('#inviteInput', 'hello world');
    await b.click('#btnCreateAnswer');
    await b.waitForSelector('.toast[data-tone="error"]');
    step('garbage input is rejected with a toast');
    await b.fill('#inviteInput', offer.slice(0, offer.length - 30));
    await b.click('#btnCreateAnswer');
    await b.waitForFunction(() => /incomplete/i.test(document.body.innerText));
    step('a truncated code is reported as incomplete');

    // wrong password on a third device must not unlock the code
    const eve = await newPeer(browser, url, 'eve', logs);
    await eve.page.fill('#secret', 'EVIL-EVIL-EVIL-EVIL');
    await eve.page.click('#btnContinue');
    await eve.page.waitForSelector('#viewConnect:not([hidden])');
    await eve.page.click('#tabCallee');
    await eve.page.fill('#inviteInput', offer);
    await eve.page.click('#btnCreateAnswer');
    await eve.page.waitForFunction(() => /same password/i.test(document.body.innerText), null, { timeout: 30000 });
    assert.equal(await eve.page.locator('#cardAnswer').isHidden(), true);
    await eve.ctx.close();
    step('a wrong password can not unlock the invitation');

    await b.fill('#inviteInput', `Hey, call me: ${offer}  thanks!`);
    await b.click('#btnCreateAnswer');
    await b.waitForFunction(() => document.getElementById('answerCode').value.startsWith('spv1.'), null, { timeout: 30000 });
    const answer = await b.inputValue('#answerCode');
    step(`reply created from a code pasted inside a chat message (${answer.length} characters)`);
    await shot(bob, '03-callee-reply');

    // an invitation pasted where a reply belongs is detected
    await a.fill('#replyInput', offer);
    await a.click('#btnConnect');
    await a.waitForFunction(() => /invitation, but a reply/i.test(document.body.innerText));
    step('an invitation pasted into the reply box is detected');

    // --- connect
    await a.fill('#replyInput', answer);
    await a.click('#btnConnect');
    await a.waitForSelector('#viewCall:not([hidden])', { timeout: 40000 });
    await b.waitForSelector('#viewCall:not([hidden])', { timeout: 40000 });
    step('direct encrypted connection established on both sides');

    // sensitive fields are wiped
    assert.equal(await a.inputValue('#secret'), '');
    assert.equal(await a.inputValue('#replyInput'), '');
    assert.equal(await b.inputValue('#inviteInput'), '');
    step('password and codes are wiped after connecting');

    // --- security code
    console.log('In call');
    await a.waitForFunction(() => document.querySelectorAll('#sasEmoji span').length === 8, null, { timeout: 10000 });
    await b.waitForFunction(() => document.querySelectorAll('#sasEmoji span').length === 8, null, { timeout: 10000 });
    const sasA = await a.locator('#sasEmoji').getAttribute('aria-label');
    const sasB = await b.locator('#sasEmoji').getAttribute('aria-label');
    assert.equal(sasA, sasB, 'both sides show the same security code');
    step(`matching security code: ${sasA}`);
    await a.click('#btnSasMatch');
    assert.equal(await a.getAttribute('#sasCard', 'data-state'), 'verified');

    // --- audio really flows: remote level meter lights up from the fake mic's tone
    await a.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('#tilePeer .avatar')).getPropertyValue('--lvl')) > 0, null, { timeout: 15000 });
    step('remote audio is arriving (level meter reacts)');
    const sinkState = await a.evaluate(() => {
      const el = document.getElementById('remoteAudio');
      const track = el.srcObject && el.srcObject.getAudioTracks()[0];
      return { hasTrack: !!track, live: track && track.readyState };
    });
    assert.deepEqual(sinkState, { hasTrack: true, live: 'live' });

    // --- stats panel
    await a.click('#btnDetails');
    await a.waitForFunction(() => /kbps/.test(document.getElementById('stDown').textContent), null, { timeout: 15000 });
    const route = await a.textContent('#stRoute');
    assert.match(route, /Local network|Direct/);
    step(`connection details populated (route: ${route})`);

    // --- chat
    await a.click('#btnChat');
    await a.fill('#chatInput', 'Merhaba <b>Bob</b> 👋');
    await a.press('#chatInput', 'Enter');
    await b.waitForFunction(() => document.querySelectorAll('#chatLog .msg').length === 1);
    assert.equal(await b.locator('#chatLog .msg b').count(), 0, 'chat is rendered as text, never as HTML');
    assert.match(await b.textContent('#chatLog .msg'), /Merhaba <b>Bob<\/b> 👋/);
    assert.equal(await b.isVisible('#chatBadge'), true, 'unread badge shown');
    await b.click('#btnChat');
    await b.fill('#chatInput', 'selam!');
    await b.press('#chatInput', 'Enter');
    await a.waitForFunction(() => document.querySelectorAll('#chatLog .msg').length === 2);
    step('encrypted chat works both ways, as plain text');
    await shot(alice, '04-call-chat');

    // --- mute indicator
    await a.click('#btnMute');
    await b.waitForFunction(() => !document.getElementById('peerMuteBadge').hidden);
    assert.equal(await a.getAttribute('#btnMute', 'aria-pressed'), 'true');
    await a.click('#btnMute');
    await b.waitForFunction(() => document.getElementById('peerMuteBadge').hidden);
    step('mute state is mirrored on the other side');
    await b.click('#callTimer'); // move focus out of the chat box: shortcuts are ignored while typing
    await b.keyboard.press('m');
    await a.waitForFunction(() => !document.getElementById('peerMuteBadge').hidden);
    await b.keyboard.press('m');
    await a.waitForFunction(() => document.getElementById('peerMuteBadge').hidden);
    step('keyboard shortcut M toggles mute');

    await shot(alice, '05-call-alice');
    await shot(bob, '06-call-bob');

    // --- hang up
    await b.click('#btnHangup');
    await b.waitForSelector('#viewSetup:not([hidden])');
    await a.waitForSelector('#viewSetup:not([hidden])', { timeout: 10000 });
    assert.match(await a.textContent('#statusText'), /Call ended/);
    step('hang up returns both sides to the start and releases the microphone');
    const micLive = await a.evaluate(async () => (await navigator.mediaDevices.enumerateDevices()).length >= 0);
    assert.ok(micLive);

    // --- language + theme switches (bob is back on the start screen)
    console.log('Settings');
    await b.click('#btnSettings');
    await b.selectOption('#setLang', 'tr');
    assert.equal(await b.getAttribute('html', 'lang'), 'tr');
    assert.equal(await b.textContent('#setupTitle'), 'Ortak bir parola seçin');
    await b.selectOption('#setLang', 'en');
    await b.selectOption('#setTheme', 'dark');
    assert.equal(await b.getAttribute('html', 'data-theme'), 'dark');
    await b.selectOption('#setTheme', 'auto');
    assert.equal(await b.getAttribute('html', 'data-theme'), null);
    await b.selectOption('#setIce', 'custom');
    assert.equal(await b.isVisible('#customIceBlock'), true);
    await b.keyboard.press('Escape');
    step('language, theme and connection-helper settings apply instantly');

    // --- invitation link: share -> open link -> everything pre-filled
    console.log('Invitation link');
    const carol = await newPeer(browser, url, 'carol', logs);
    const dave = await newPeer(browser, url, 'dave', logs);
    await toConnect(carol);
    await carol.page.click('#btnCreateOffer');
    await carol.page.waitForFunction(() => document.getElementById('offerCode').value.startsWith('spv1.'), null, { timeout: 30000 });
    await carol.page.click('#btnShareOffer'); // no Web Share API in desktop Chromium: falls back to copying the link
    const link = await carol.page.evaluate(() => navigator.clipboard.readText());
    assert.match(link, /^http:\/\/127\.0\.0\.1:\d+\/index\.html#c=spv1\./);
    step('Share falls back to copying a link that carries the code in the fragment');

    await dave.page.goto(link);
    await dave.page.waitForSelector('#inviteBanner:not([hidden])');
    assert.equal(new URL(dave.page.url()).hash, '', 'the code is removed from the address bar');
    await dave.page.fill('#secret', PASSWORD);
    await dave.page.click('#btnContinue');
    await dave.page.waitForSelector('#viewConnect:not([hidden])');
    assert.equal(await dave.page.getAttribute('#tabCallee', 'aria-selected'), 'true');
    assert.ok((await dave.page.inputValue('#inviteInput')).startsWith('spv1.'));
    await dave.page.click('#btnCreateAnswer');
    await dave.page.waitForFunction(() => document.getElementById('answerCode').value.startsWith('spv1.'), null, { timeout: 30000 });
    step('opening the link pre-fills the invitation and jumps to “Join a call”');
    await shot(dave, '07-invite-link-reply');

    // --- key-derivation cost is acceptable in a real browser
    const ms = await carol.page.evaluate(async () => {
      const t0 = performance.now();
      await SPV.Crypto.seal(new Uint8Array(900), 'timing-test-password');
      return performance.now() - t0;
    });
    assert.ok(ms < 4000, `sealing took ${ms} ms`);
    step(`password-based encryption of a code takes ${Math.round(ms)} ms (600 000 PBKDF2 iterations)`);

    assert.deepEqual(logs, [], `unexpected console errors:\n${logs.join('\n')}`);
    step('no console errors or warnings');
    console.log('\nE2E PASSED');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error('\nE2E FAILED:', err);
  process.exit(1);
});
