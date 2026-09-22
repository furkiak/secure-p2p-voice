# Manual release checklist

Record date, commit, browser/OS versions, device types, and network topology with each result. Use disposable test passwords and do not store actual connection codes.

1. **Local UI:** serve on localhost; verify dark/solid surfaces at desktop and mobile widths, keyboard-only focus, screen-reader labels and reduced motion. A short password must be rejected before requesting microphone permission.
2. **Two-browser call:** on two browser profiles/devices with microphones, grant only the needed origin permission. Exchange the password separately from codes. Confirm offer → answer → connected state, audible two-way audio, mute/unmute, and hangup stops both local tracks. Repeat with reversed roles.
3. **Negative paths:** wrong password, swapped offer/answer, altered code, old version 1 code, answer from another session, denied microphone, closed tab, interrupted network, and ICE timeout. Verify a clear error and recoverability with a fresh offer.
4. **Network boundary:** repeat on two separate real networks. Record direct ICE success/failure without TURN; do not classify a failure as a crypto defect. Inspect browser connection diagnostics for the selected candidate pair and whether the remote address/metadata is visible.
5. **Release:** run automated tests on the exact Git commit, inspect the static files for accidental credentials/analytics, and verify the hosted HTTPS origin, response headers and live microphone prompt. Re-run this checklist after hosting changes.

Automated code-envelope tests and static page rendering are separate from a real microphone/voice pass.
