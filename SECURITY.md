# Security model

This is a small experimental voice client, not an audited secure messenger.

- **Assets:** the offer/answer descriptions (which can contain ICE/IP metadata), the shared password in tab memory, and the live microphone stream.
- **Code protection:** version 2 uses per-code random 16-byte salt, 12-byte AES-GCM nonce, PBKDF2-SHA-256 (250,000 iterations), and authenticated version/type/session ID. There is a 48,000-character code limit, a 24,000-byte plaintext limit, and input validation before decryption. The answer must belong to the caller's session. These checks limit accidental cross-call use; they do not provide a trusted identity system or prevent an attacker with the password from creating a valid code.
- **Audio protection:** the browser negotiates WebRTC DTLS-SRTP. This project does not add an independent audio encryption protocol, attest the browser, or prevent peer recording.
- **Metadata and availability:** Google's public STUN server may receive network metadata. ICE candidates shared with a peer may expose network addresses. The channel used to copy codes, hosting provider, browser and OS may log activity. No TURN fallback means some networks cannot connect. A compromised page or device defeats this threat model.
- **Passwords:** a captured code permits offline password guesses. A 12-character minimum is an input floor, not proof of strength. Use a unique, randomly generated secret; do not reuse an account password. Send it separately from the code.
- **Lifetime:** the password stays in tab memory until hangup/pagehide; the app does not persist it. Hangup stops all local media tracks and closes the peer connection. The browser may still retain permission for this origin, and already-delivered audio cannot be revoked.

Use current browser releases and serve from an origin you control over HTTPS (or localhost for development). Do not put secrets or real participant details in issue reports. To report a vulnerability privately, use GitHub's **Report a vulnerability** / private vulnerability reporting for this repository if enabled; otherwise contact the maintainer through a private channel listed on their GitHub profile. Include reproducible steps, affected commit/browser, and an impact description without a live call code or password.

References: [MDN WebRTC signaling and ICE](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling), [MDN Web Crypto key derivation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey).
