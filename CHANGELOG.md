# Changelog

## 2.0.0

A ground-up rework of the single-file prototype into a small, tested, dependency-free app.

### Security
- **Per-code random salt** (the old format used a fixed salt shared by every user, which allowed pre-computed password tables).
- PBKDF2 iterations raised from 100 000 to **600 000**.
- New authenticated packet format: version, type (invitation / reply), compression flag, KDF cost, salt and length are bound
  to the ciphertext as AES-GCM additional data — invitations can no longer be replayed as replies.
- Codes carry a timestamp and expire after 30 minutes; versioned `spv1.` prefix.
- **Security code** (8 emoji from the DTLS fingerprints) to detect a man in the middle.
- Strict Content-Security-Policy (`connect-src 'none'`, no inline script or style); no `innerHTML`, `eval` or third-party resources.
- Password is no longer read from the DOM at encryption time, is normalised (NFKC, trimmed), is wiped once the call connects,
  and is never stored. Strength meter, minimum length and a strong random passphrase generator.
- Chat and display names are validated, length-limited and rendered as text only.
- STUN provider is now a choice (including *none*), with custom STUN/TURN and relay-only.

### Fixes
- ICE candidate handler was attached *after* `setLocalDescription` (a race that could produce an incomplete code); gathering is now
  listener-first with a bounded wait, instead of potentially waiting for ever on an unreachable STUN server.
- “Connected securely” was shown as soon as a track arrived, before the connection existed; it now follows the real connection state.
- The `pulsing` status type was never applied; failed / disconnected / closed states were not handled.
- Cancelling the system share sheet silently copied the code to the clipboard.
- Clipboard failures (insecure context, denied permission) now fall back to `execCommand`.
- A second attempt leaked the previous `RTCPeerConnection`; there was no way to hang up or release the microphone.
- Pasted codes broken by line wraps, quotes, links or chatter are recognised; truncated codes are reported as truncated.
- A variable named `package` (a reserved word in strict mode) would have broken the code once loaded as a module; the format code was rewritten.

### Performance
- Codes are **~9× shorter** (≈1 100 characters instead of ≈10 000): deflate, binary packet, base64url, Opus-only negotiation.
- Only Opus is offered, which shrinks the session description; the chat channel is pre-negotiated, so it needs no extra signaling.
- Audio level meters pause while the tab is hidden.

### Architecture
- Split into focused modules (`crypto`, `codec`, `sas`, `qr`, `call`, `i18n`, `ui`, `app`); no inline handlers, no globals besides one namespace.
- 41 unit/static tests, an end-to-end test with two real browsers, ESLint and CI.

### New
- Liquid Glass interface with light / dark / automatic themes, English and Türkçe, accessibility and reduced-motion / transparency support.
- Share link (code in the URL fragment), QR code generator and in-app scanner.
- Encrypted chat, mute indicators, display names, live connection details and quality indicator.
- Listen-only mode, microphone/speaker selection, audio processing toggles, voice-quality presets.
- Installable offline PWA, wake lock during calls, keyboard shortcut for mute.

## 1.0.0
Initial single-file prototype with manual copy-paste signaling.
