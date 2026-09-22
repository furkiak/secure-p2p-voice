# Support and troubleshooting

This beta has no managed service or response-time commitment. Search existing issues first; for a reproducible non-security defect, open a bug report with the tested Git commit, browser/OS version, whether both pages used HTTPS or localhost, and the visible status text. Do **not** include real call codes, passwords, IP addresses, screenshots with personal details, or microphone recordings. Use the private path in [SECURITY.md](SECURITY.md) for vulnerabilities.

| Symptom | First checks |
| --- | --- |
| Microphone button does not proceed | Use HTTPS or localhost, check browser permission and available microphone, enter a unique password of at least 12 characters. |
| Code is rejected | Use the same password on both sides; exchange a fresh offer and answer from the same version. Check that you did not paste an answer into the offer field. |
| Code is accepted but no audio | Check browser playback control and mute state; verify both tabs remain open. Some networks need TURN, which is not configured. |
| Connection times out or disconnects | Try two devices on a simpler network for diagnosis. Record only the browser's non-sensitive connection-state summary. A different network may need a TURN relay. |
| Privacy concern | Review STUN, peer IP metadata and the chosen exchange channel in [SECURITY.md](SECURITY.md) before starting a new call. |

See [manual acceptance](docs/manual-acceptance.md) for the release gate.
