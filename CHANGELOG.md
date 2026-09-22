# Changelog

## 1.1.0-beta.1 — local preview

- Rebuilt the interface with explicit call steps, visible microphone state, mute/hangup, keyboard focus, reduced-motion and solid-surface options.
- Added versioned, per-code-salted AES-GCM signaling envelopes with a call ID and authenticated offer/answer type. Version 1 codes require a fresh exchange.
- Added limits and validation for descriptions/codes, ICE and connection timeouts, media-track cleanup, unit tests and GitHub CI configuration.
- Corrected privacy and connectivity claims. A two-device call, GitHub CI run and public hosting have not yet been verified.
