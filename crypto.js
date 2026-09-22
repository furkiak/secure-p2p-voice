(function (root) {
  'use strict';

  const VERSION = 2;
  const MAX_CODE = 48000;
  const MAX_PLAINTEXT = 24000;
  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8', { fatal: true });

  function base64url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64url(value, maxLength) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > maxLength)
      throw new Error('Invalid code encoding.');
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    if (base64url(bytes) !== value) throw new Error('Invalid code encoding.');
    return bytes;
  }

  function checkPassword(password) {
    if (typeof password !== 'string' || password.length < 12 || enc.encode(password).length > 128)
      throw new Error('Use a unique shared password of 12–128 UTF-8 bytes.');
  }

  function checkType(type) {
    if (type !== 'offer' && type !== 'answer') throw new Error('Invalid code type.');
  }

  function checkSession(sessionId) {
    if (typeof sessionId !== 'string' || !/^[0-9a-f]{32}$/.test(sessionId))
      throw new Error('Invalid session ID.');
  }

  async function keyFor(password, salt, cryptoProvider) {
    const keyMaterial = await cryptoProvider.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return cryptoProvider.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
      keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  function associatedData(type, sessionId) {
    return enc.encode(`p2p-voice|${VERSION}|${type}|${sessionId}`);
  }

  async function encrypt(plainText, password, type, sessionId, cryptoProvider = globalThis.crypto) {
    checkPassword(password);
    checkType(type);
    if (typeof plainText !== 'string' || !plainText || enc.encode(plainText).length > MAX_PLAINTEXT)
      throw new Error('Description is empty or too large.');
    if (type === 'offer') sessionId = Array.from(cryptoProvider.getRandomValues(new Uint8Array(16)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    checkSession(sessionId);
    const salt = cryptoProvider.getRandomValues(new Uint8Array(16));
    const nonce = cryptoProvider.getRandomValues(new Uint8Array(12));
    const key = await keyFor(password, salt, cryptoProvider);
    const ciphertext = new Uint8Array(await cryptoProvider.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: associatedData(type, sessionId) },
      key, enc.encode(plainText)));
    const envelope = { v: VERSION, t: type, sid: sessionId,
      s: base64url(salt), n: base64url(nonce), c: base64url(ciphertext) };
    const code = base64url(enc.encode(JSON.stringify(envelope)));
    if (code.length > MAX_CODE) throw new Error('Encrypted code is too large.');
    return { code, sessionId };
  }

  async function decrypt(code, password, expectedType, expectedSessionId = null, cryptoProvider = globalThis.crypto) {
    checkPassword(password);
    checkType(expectedType);
    if (typeof code !== 'string' || code.length > MAX_CODE) throw new Error('Code is too large or missing.');
    let envelope;
    try { envelope = JSON.parse(dec.decode(fromBase64url(code.trim(), MAX_CODE))); }
    catch { throw new Error('Invalid encrypted code.'); }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope))
      throw new Error('Invalid encrypted code.');
    if (envelope.v !== VERSION) throw new Error('Unsupported code version; ask for a fresh code.');
    if (envelope.t !== expectedType) throw new Error('This code is for the other call step.');
    checkSession(envelope.sid);
    if (expectedSessionId && envelope.sid !== expectedSessionId)
      throw new Error('Answer belongs to a different call.');
    const salt = fromBase64url(envelope.s, 32);
    const nonce = fromBase64url(envelope.n, 24);
    const ciphertext = fromBase64url(envelope.c, 32024);
    if (salt.length !== 16 || nonce.length !== 12 || ciphertext.length < 17 || ciphertext.length > MAX_PLAINTEXT + 16)
      throw new Error('Invalid salt, nonce or ciphertext length.');
    const key = await keyFor(password, salt, cryptoProvider);
    try {
      const plain = await cryptoProvider.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: associatedData(envelope.t, envelope.sid) },
        key, ciphertext);
      return { plainText: dec.decode(plain), sessionId: envelope.sid };
    } catch {
      throw new Error('Wrong password or altered code.');
    }
  }

  const api = { encrypt, decrypt, VERSION, MAX_CODE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CodeEnvelope = api;
})(typeof window !== 'undefined' ? window : globalThis);
