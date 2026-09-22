# Contributing

Small, reviewable changes are welcome. Explain the user-facing behavior and privacy effect in each pull request. If you change the code envelope, update its version, compatibility notes, negative tests, and threat model together. Do not add analytics, a hosted relay, or a new third-party service without documenting its data flow and user choice.

Before submitting, run `npm test`, `node --check app.js`, and `node --check crypto.js`. For call-flow changes, complete `docs/manual-acceptance.md` on actual browsers/devices and report the browser versions and network conditions. Do not claim a real-call pass from unit tests alone. Keep test codes and passwords synthetic; never commit actual connection codes.
