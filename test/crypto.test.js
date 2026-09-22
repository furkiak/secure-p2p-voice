const test = require('node:test');
const assert = require('node:assert/strict');
const envelope = require('../crypto');

const password = 'correct horse battery staple';
const decode = code => JSON.parse(Buffer.from(code, 'base64url').toString('utf8'));
const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');

test('offer and answer share a session but use fresh salts and nonces', async () => {
  const offer = await envelope.encrypt(JSON.stringify({ type: 'offer', sdp: 'local' }), password, 'offer');
  const offer2 = await envelope.encrypt(JSON.stringify({ type: 'offer', sdp: 'local' }), password, 'offer');
  assert.notEqual(offer.code, offer2.code);
  assert.notEqual(decode(offer.code).s, decode(offer2.code).s);
  assert.notEqual(decode(offer.code).n, decode(offer2.code).n);
  assert.deepEqual(JSON.parse((await envelope.decrypt(offer.code, password, 'offer')).plainText),
    { type: 'offer', sdp: 'local' });
  const answer = await envelope.encrypt(JSON.stringify({ type: 'answer', sdp: 'remote' }),
    password, 'answer', offer.sessionId);
  assert.equal((await envelope.decrypt(answer.code, password, 'answer', offer.sessionId)).sessionId,
    offer.sessionId);
  await assert.rejects(envelope.decrypt(answer.code, password, 'offer'), /other call step/);
  await assert.rejects(envelope.decrypt(answer.code, password, 'answer', offer2.sessionId), /different call/);
});

test('wrong password, changed ciphertext and changed authenticated header are rejected', async () => {
  const offer = await envelope.encrypt('offer description', password, 'offer');
  await assert.rejects(envelope.decrypt(offer.code, 'a different long password', 'offer'), /Wrong password/);
  const changed = decode(offer.code);
  changed.c = changed.c.slice(0, -1) + (changed.c.at(-1) === 'A' ? 'B' : 'A');
  await assert.rejects(envelope.decrypt(encode(changed), password, 'offer'), /Wrong password|Invalid code/);
  const changedSession = decode(offer.code);
  changedSession.sid = '0'.repeat(32);
  await assert.rejects(envelope.decrypt(encode(changedSession), password, 'offer'), /Wrong password/);
});

test('malformed and legacy envelopes fail before decryption', async () => {
  const offer = await envelope.encrypt('offer description', password, 'offer');
  for (const [property, value] of [['s', 'AA'], ['n', 'AA'], ['c', 'AA']]) {
    const changed = decode(offer.code);
    changed[property] = value;
    await assert.rejects(envelope.decrypt(encode(changed), password, 'offer'), /Invalid/);
  }
  await assert.rejects(envelope.decrypt(encode({ iv: [], data: [] }), password, 'offer'), /Unsupported code version/);
  await assert.rejects(envelope.decrypt('x'.repeat(envelope.MAX_CODE + 1), password, 'offer'), /too large/);
  await assert.rejects(envelope.decrypt('%%%$', password, 'offer'), /Invalid encrypted code/);
});

test('weak passwords and oversized descriptions are refused', async () => {
  await assert.rejects(envelope.encrypt('offer', 'weak', 'offer'), /12/);
  await assert.rejects(envelope.encrypt('x'.repeat(24001), password, 'offer'), /too large/);
  await assert.rejects(envelope.encrypt('offer', password, 'answer'), /session ID/);
});
