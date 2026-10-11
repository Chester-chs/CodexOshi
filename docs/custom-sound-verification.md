# Custom click sound and settings opening — Codi 0.2.2

Verified on Windows, 2026-10-11.

- Character → Click sound offers local upload, preview, restore built-in, and 0–100% volume using a slider or number. Existing mute choices remain compatible.
- Imports are bounded to 10 MiB and staged before activation. Real Web Audio decoding rejects unplayable clips and clips longer than 30 seconds. Cancelled or failed imports preserve the active sound. Uploads are copied locally; the source file is unchanged.
- Volume and the custom selection survive reload and process restart. A real WAV was uploaded and played through the production renderer, preload, IPC, local protocol, and store after its original was removed. Captured source peak was 0.4000, with actual gain 0.25. Hardware output was muted in the test.
- Preview, zero-volume silence, built-in reset, long-clip rejection, and cancelled upload were verified in hidden Electron. Unit tests cover local copies, invalid/oversized files, invalid senders, restricted asset URLs, save races, and interrupted volume-number editing.
- Every closed → open settings transition selects Quota and scrolls to the top. Both close-button and outside dismissal were exercised. A layout refresh while settings remain open keeps the selected tab.
- New regression tests first failed against missing features and the previous tab behavior. Final automated suite: **190/190 passed**, plus 10 real Electron shape fallback cases.
- Hidden UI commands: `tests/Invoke-ClickSoundSmoke.ps1` and `-Restart` for default/mute; `-Custom` and `-Custom -Restart` for uploaded audio and volume. Image preprocessing uses a local bitmap fixture; real system pointer-to-host focus and cross-DPI behavior are outside these tests.
